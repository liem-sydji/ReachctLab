"""
ReachCT — linkedin.py
LinkedIn/People finder via DuckDuckGo dorking + email pattern guessing + SMTP verification.

Flow:
1. Build search dork from role + company/keyword + location
2. Scrape DuckDuckGo HTML for LinkedIn profile snippets
3. Extract name + title + company from each result
4. Generate email patterns from name + domain
5. SMTP verify each pattern to find the real email
6. Return structured people contacts
"""

import re
import random
import asyncio
import smtplib
import unicodedata
from urllib.parse import quote_plus, unquote
from playwright.async_api import async_playwright

try:
    import dns.resolver
    HAS_DNS = True
except ImportError:
    HAS_DNS = False


USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
]


# ── Name / email helpers ──────────────────────────────────────────────────────

def strip_accents(text: str) -> str:
    """María → Maria"""
    return "".join(c for c in unicodedata.normalize("NFD", text)
                   if unicodedata.category(c) != "Mn")


def parse_name(full_name: str):
    """Split a full name into first and last name parts."""
    cleaned = strip_accents(full_name.strip().lower())
    cleaned = re.sub(r"[^a-z\s\-]", "", cleaned)
    parts   = [p for p in cleaned.split() if p]
    if len(parts) < 2:
        return (parts[0] if parts else "", "")
    return (parts[0], parts[-1])


def generate_email_patterns(first: str, last: str, domain: str) -> list:
    """Generate common corporate email patterns."""
    if not first or not domain:
        return []
    if last:
        patterns = [
            f"{first}@{domain}",
            f"{first}.{last}@{domain}",
            f"{first[0]}{last}@{domain}",
            f"{first}{last}@{domain}",
            f"{first[0]}.{last}@{domain}",
            f"{last}@{domain}",
            f"{last}.{first}@{domain}",
        ]
    else:
        patterns = [f"{first}@{domain}"]
    seen = set()
    return [p for p in patterns if not (p in seen or seen.add(p))]


# ── SMTP verification ─────────────────────────────────────────────────────────

def get_mx_record(domain: str):
    if not HAS_DNS:
        return None
    try:
        records = dns.resolver.resolve(domain, "MX")
        return str(sorted(records, key=lambda r: r.preference)[0].exchange).rstrip(".")
    except Exception:
        return None


def verify_email_smtp(email: str, mx_host: str, timeout: int = 10) -> str:
    try:
        with smtplib.SMTP(mx_host, 25, timeout=timeout) as smtp:
            smtp.ehlo("verify.local")
            smtp.mail("check@verify.local")
            code, _ = smtp.rcpt(email)
            if code == 250:
                return "valid"
            elif code in (550, 551, 553):
                return "invalid"
            return "unknown"
    except Exception:
        return "unknown"


def find_email(first: str, last: str, domain: str) -> dict:
    patterns = generate_email_patterns(first, last, domain)
    if not patterns:
        return {"email": "", "confidence": "none", "verified": False}
    mx = get_mx_record(domain)
    if not mx:
        return {"email": patterns[0], "confidence": "guess", "verified": False}
    # Catch-all check
    if verify_email_smtp(f"zzznonexistent12345@{domain}", mx) == "valid":
        return {"email": patterns[0], "confidence": "catch-all", "verified": False}
    for email in patterns:
        if verify_email_smtp(email, mx) == "valid":
            return {"email": email, "confidence": "verified", "verified": True}
    return {"email": patterns[0], "confidence": "unverified", "verified": False}


# ── Dork builder ──────────────────────────────────────────────────────────────

def build_dork(role: str = "", company: str = "", location: str = "", keyword: str = "") -> str:
    """Build a natural query — DDG doesn't support site: operator in HTML mode."""
    parts = ["linkedin"]  # first so DDG prioritizes LinkedIn results
    if company:
        parts.append(company)
    if role:
        roles = [r.strip() for r in role.split(",") if r.strip()]
        parts.append(" OR ".join(roles))
    if keyword:
        parts.append(keyword)
    if location:
        parts.append(location)
    else:
        parts.append("profile")  # helps surface individual profiles when no location
    return " ".join(parts)


# ── LinkedIn title parser ─────────────────────────────────────────────────────

def parse_linkedin_snippet(title: str) -> tuple:
    """
    Extract name, job title, company from a LinkedIn result title.
    Format: "María García - HR Manager - Kreaset | LinkedIn"
    """
    clean    = re.sub(r"\s*[\|\-–]\s*LinkedIn.*$", "", title, flags=re.IGNORECASE)
    segments = re.split(r"\s+[-–]\s+", clean)
    name     = segments[0].strip() if segments else ""
    job      = segments[1].strip() if len(segments) > 1 else ""
    company  = segments[2].strip() if len(segments) > 2 else ""
    return name, job, company


# ── DuckDuckGo scraper ────────────────────────────────────────────────────────

async def scrape_linkedin_people(role: str, company: str, location: str,
                                  keyword: str, domain: str,
                                  max_results: int, jobs: dict, run_id: str):
    dork    = build_dork(role, company, location, keyword)
    results = []

    print(f"🔍 LinkedIn dork: {dork}")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=random.choice(USER_AGENTS),
            locale="en-US",
            extra_http_headers={
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Accept-Encoding": "gzip, deflate, br",
                "DNT": "1",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1",
            }
        )
        page = await context.new_page()

        try:
            # Use regular DuckDuckGo with JS — more like a real browser
            search_url = f"https://duckduckgo.com/?q={quote_plus(dork)}&ia=web"
            print(f"🔍 Visiting: {search_url}")
            await page.goto(search_url, timeout=30000)
            # Wait for results to load (JS-rendered)
            await page.wait_for_timeout(random.randint(2000, 3500))
            print(f"🔍 Page loaded: {await page.title()}, URL: {page.url}")

            # DDG JS result containers
            result_blocks = []
            for selector in ["article[data-testid='result']", "div[data-result='snippet']",
                             "li[data-layout='organic']", ".nrn-react-div", "article"]:
                result_blocks = await page.query_selector_all(selector)
                if result_blocks:
                    print(f"🔍 Found {len(result_blocks)} blocks with: {selector}")
                    break

            if not result_blocks:
                body = await page.inner_text("body")
                print(f"🔍 No blocks found. Page body: {body[:400]}")

            seen_names = set()
            for block in result_blocks:
                if len(results) >= max_results:
                    break
                try:
                    # DDG JS title — try multiple selectors
                    title_el = (await block.query_selector("h2 a") or
                                await block.query_selector("a[data-testid='result-title-a']") or
                                await block.query_selector("a.result__a") or
                                await block.query_selector("h2") or
                                await block.query_selector("a"))
                    if not title_el:
                        continue

                    title = await title_el.inner_text()
                    href  = await title_el.get_attribute("href")

                    # DDG wraps links with redirect — unwrap
                    if href and "uddg=" in href:
                        match = re.search(r"uddg=([^&]+)", href)
                        if match:
                            href = unquote(match.group(1))

                    if not href or "linkedin.com" not in href:
                        continue

                    name, job, comp = parse_linkedin_snippet(title)
                    if not name or name.lower() in seen_names:
                        continue
                    seen_names.add(name.lower())

                    # Email finding
                    email_data = {"email": "", "confidence": "none", "verified": False}
                    if domain:
                        first, last = parse_name(name)
                        email_data  = find_email(first, last, domain)

                    person = {
                        "full_name":    name,
                        "job_title":    job or role,
                        "company":      comp or company,
                        "email":        email_data["email"],
                        "confidence":   email_data["confidence"],
                        "linkedin_url": href,
                        "location":     location,
                    }
                    results.append(person)
                    print(f"🔍 Found: {name} — {job} — {email_data['email']} ({email_data['confidence']})")

                    if run_id in jobs:
                        jobs[run_id]["found"] = len(results)

                except Exception as e:
                    print(f"⚠️ Block parse error: {e}")
                    continue

        finally:
            await browser.close()

    return results


# ── Bulk input parsing ────────────────────────────────────────────────────────

def parse_bulk_input(raw_lines: list) -> list:
    """Auto-detect each line as email, domain, or company name."""
    targets = []
    seen    = set()
    for line in raw_lines:
        item = str(line).strip()
        if not item:
            continue
        if "@" in item:
            domain  = item.split("@")[-1].strip().lower()
            company = domain.split(".")[0]
        elif "." in item and " " not in item:
            domain  = item.lower().replace("https://","").replace("http://","").replace("www.","").strip("/")
            company = domain.split(".")[0]
        else:
            company = item
            domain  = ""
        key = (company, domain)
        if key not in seen:
            seen.add(key)
            targets.append({"company": company, "domain": domain})
    return targets


async def scrape_linkedin_bulk(targets: list, role: str, location: str,
                               max_per_company: int, jobs: dict, run_id: str):
    """Run a LinkedIn search for each target company/domain."""
    all_results = []
    for idx, target in enumerate(targets):
        company = target.get("company", "")
        domain  = target.get("domain", "")
        if run_id in jobs:
            jobs[run_id]["processing"]      = company or domain
            jobs[run_id]["company_index"]   = idx + 1
            jobs[run_id]["total_companies"] = len(targets)
        try:
            results = await scrape_linkedin_people(
                role=role, company=company, location=location, keyword="",
                domain=domain, max_results=max_per_company, jobs=jobs, run_id=run_id
            )
            all_results.extend(results)
            if run_id in jobs:
                jobs[run_id]["found"] = len(all_results)
        except Exception as e:
            print(f"⚠️ Bulk search failed for {company}: {e}")
            continue
    return all_results