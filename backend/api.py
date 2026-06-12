"""
ReachCT — api.py  v2.1
FastAPI backend — scraper + auth + user databases + Claude upload cleaning.
"""

import os, sys, uuid, json, asyncio, io, re
from datetime import datetime
from typing import Optional, List

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI, HTTPException, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from database import (
    init_db, save_search, upsert_company, get_companies,
    upsert_user, get_user_by_email, get_filters,
    create_user_database, get_user_databases, get_user_database,
    delete_user_database, get_db_entries, add_db_entries,
    update_db_entry, delete_db_entry, rename_column_in_db,
    add_collaborator, get_collaborators, remove_collaborator,
)
from reachct import scrape_google_maps, export_to_excel
from auth    import verify_google_token, create_jwt, decode_jwt

app = FastAPI(title="ReachCT API", version="2.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Queue ─────────────────────────────────────────────────────────────────────
import threading, queue as queue_module
jobs: dict   = {}
search_queue = queue_module.Queue()
queue_lock   = threading.Lock()

def queue_worker():
    while True:
        try:
            job_id, query, city, country, start, end = search_queue.get(timeout=300)
            jobs[job_id]["status"]         = "starting"
            jobs[job_id]["queue_position"] = 0
            for idx, j in enumerate([j for j in jobs.values() if j["status"] == "queued"]):
                j["queue_position"] = idx + 1
            t = threading.Thread(target=run_scrape_job_thread, args=(job_id, query, city, country, start, end))
            t.start(); t.join()
            search_queue.task_done()
        except queue_module.Empty: continue
        except Exception as e: print(f"❌ Queue worker error: {e}"); continue

threading.Thread(target=queue_worker, daemon=True).start()

# ── Auth helpers ──────────────────────────────────────────────────────────────
def get_current_user(authorization: str = None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_jwt(authorization[7:])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload

# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
def startup():
    init_db()
    print("✅ ReachCT API ready")

@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.now().isoformat()}

# ── Auth ──────────────────────────────────────────────────────────────────────
class GoogleAuthRequest(BaseModel):
    credential: str

@app.post("/api/auth/google")
def auth_google(body: GoogleAuthRequest):
    try:
        info = verify_google_token(body.credential)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google token")
    user  = upsert_user(info["sub"], info.get("email",""), info.get("name",""), info.get("picture",""))
    token = create_jwt(user["id"], info.get("email",""), info.get("name",""), info.get("picture",""))
    return {"token": token, "user": {"id": user["id"], "email": info.get("email",""), "name": info.get("name",""), "picture": info.get("picture","")}}

@app.get("/api/auth/me")
def auth_me(authorization: str = Header(default=None)):
    payload = get_current_user(authorization)
    return {"id": payload["sub"], "email": payload["email"], "name": payload["name"], "picture": payload["picture"]}

# ── Scrape ────────────────────────────────────────────────────────────────────
@app.get("/api/scrape")
async def start_scrape(query: str, city: str, country: str, start: int = 0, end: int = 25):
    query = query.strip(); city = city.strip().title(); country = country.strip().title()
    if not query or not city or not country:
        raise HTTPException(status_code=400, detail="query, city and country are required")
    if end <= start: raise HTTPException(status_code=400, detail="end must be greater than start")
    if (end - start) > 50: raise HTTPException(status_code=400, detail="Maximum 50 listings per search.")
    job_id = str(uuid.uuid4())[:8]
    with queue_lock:
        qr = sum(1 for j in jobs.values() if j["status"] in ("running","queued"))
        jobs[job_id] = {"status":"queued","queue_position":qr,"progress":0,"total":end-start,
            "total_on_maps":None,"processing":None,"results":[],"error":None,
            "query":query,"city":city,"country":country}
        search_queue.put((job_id, query, city, country, start, end))
    return {"job_id": job_id, "message": "Scrape started" if qr==0 else f"Queued at position {qr}", "queue_position": qr}

def run_scrape_job_thread(job_id, query, city, country, start, end):
    loop = asyncio.new_event_loop(); asyncio.set_event_loop(loop)
    try: loop.run_until_complete(run_scrape_job(job_id, query, city, country, start, end))
    finally: loop.close()

async def run_scrape_job(job_id, query, city, country, start, end):
    try:
        jobs[job_id]["status"] = "running"
        results = await scrape_google_maps(query, city, country, start, end, job_id, jobs=jobs, job_id=job_id)
        for c in results: upsert_company(job_id, c)
        save_search(job_id, query, city, country, start, end, len(results))
        jobs[job_id]["status"]  = "cancelled" if jobs[job_id].get("status") == "cancelling" else "done"
        jobs[job_id]["results"] = results
    except Exception as e:
        jobs[job_id]["status"] = "error"; jobs[job_id]["error"] = str(e)

@app.post("/api/job/{job_id}/cancel")
def cancel_job(job_id: str):
    job = jobs.get(job_id)
    if not job: raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] in ("running","queued"): job["status"] = "cancelling"; return {"message":"Cancellation requested"}
    return {"message": f"Job already {job['status']}"}

@app.get("/api/job/{job_id}")
def get_job(job_id: str):
    job = jobs.get(job_id)
    if not job: raise HTTPException(status_code=404, detail="Job not found")
    return job

# ── Companies ─────────────────────────────────────────────────────────────────
class MultiFilterRequest(BaseModel):
    queries:   List[str] = []
    cities:    List[str] = []
    countries: List[str] = []

@app.post("/api/companies/multi")
def get_companies_multi(body: MultiFilterRequest):
    data = get_companies(queries=body.queries, cities=body.cities, countries=body.countries)
    return {"companies": data, "total": len(data)}

@app.get("/api/companies")
def get_all_companies(city: Optional[str]=None, country: Optional[str]=None, query: Optional[str]=None):
    if city: city = city.strip().title()
    if country: country = country.strip().title()
    if query: query = query.strip()
    data = get_companies(query=query, city=city, country=country)
    return {"companies": data, "total": len(data)}

@app.get("/api/filters")
def get_filters_endpoint():
    return get_filters()

@app.get("/api/export")
def export_shared(query: str="", city: str="", country: str=""):
    data = get_companies(city=city.strip().title(), country=country.strip().title())
    if not data: raise HTTPException(status_code=404, detail="No companies found")
    filename = export_to_excel(data, query or "export", city, country)
    if not filename or not os.path.exists(filename):
        raise HTTPException(status_code=500, detail="Failed to generate Excel file")
    return FileResponse(path=filename, filename=os.path.basename(filename),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

@app.get("/api/searches")
def get_searches_endpoint():
    from database import get_searches
    return {"searches": get_searches()}

# ── User Databases ────────────────────────────────────────────────────────────
class CreateDBRequest(BaseModel):
    name: str

@app.post("/api/databases")
def create_db(body: CreateDBRequest, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    return create_user_database(int(user["sub"]), body.name.strip())

@app.get("/api/databases")
def list_dbs(authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    return get_user_databases(int(user["sub"]))

@app.delete("/api/databases/{db_id}")
def delete_db(db_id: int, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    if not delete_user_database(db_id, int(user["sub"])):
        raise HTTPException(status_code=404, detail="Database not found or not owner")
    return {"deleted": True}

# ── Database entries ──────────────────────────────────────────────────────────
@app.get("/api/databases/{db_id}/entries")
def get_entries(db_id: int, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    if not get_user_database(db_id, int(user["sub"])):
        raise HTTPException(status_code=403, detail="Access denied")
    return get_db_entries(db_id)

class AddEntriesRequest(BaseModel):
    rows: List[dict]

@app.post("/api/databases/{db_id}/entries")
def add_entries(db_id: int, body: AddEntriesRequest, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    db   = get_user_database(db_id, int(user["sub"]))
    if not db: raise HTTPException(status_code=403, detail="Access denied")
    if db.get("role") == "viewer": raise HTTPException(status_code=403, detail="Viewers cannot add entries")
    return add_db_entries(db_id, body.rows)

class UpdateEntryRequest(BaseModel):
    data: dict

@app.patch("/api/databases/{db_id}/entries/{entry_id}")
def update_entry(db_id: int, entry_id: int, body: UpdateEntryRequest, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    db   = get_user_database(db_id, int(user["sub"]))
    if not db: raise HTTPException(status_code=403, detail="Access denied")
    if db.get("role") == "viewer": raise HTTPException(status_code=403, detail="Viewers cannot edit")
    row = update_db_entry(entry_id, db_id, body.data)
    if not row: raise HTTPException(status_code=404, detail="Entry not found")
    return row

@app.delete("/api/databases/{db_id}/entries/{entry_id}")
def delete_entry(db_id: int, entry_id: int, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    db   = get_user_database(db_id, int(user["sub"]))
    if not db: raise HTTPException(status_code=403, detail="Access denied")
    if db.get("role") == "viewer": raise HTTPException(status_code=403, detail="Viewers cannot delete")
    if not delete_db_entry(entry_id, db_id):
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"deleted": True}

# ── Rename column ─────────────────────────────────────────────────────────────
class RenameColRequest(BaseModel):
    old_name: str
    new_name: str

@app.post("/api/databases/{db_id}/rename-column")
def rename_column(db_id: int, body: RenameColRequest, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    db   = get_user_database(db_id, int(user["sub"]))
    if not db: raise HTTPException(status_code=403, detail="Access denied")
    if db.get("role") == "viewer": raise HTTPException(status_code=403, detail="Viewers cannot rename columns")
    count = rename_column_in_db(db_id, body.old_name, body.new_name)
    return {"renamed": count}

# ── Export user database to Excel ─────────────────────────────────────────────
@app.get("/api/databases/{db_id}/export")
def export_user_db(db_id: int, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    db   = get_user_database(db_id, int(user["sub"]))
    if not db: raise HTTPException(status_code=403, detail="Access denied")
    entries = get_db_entries(db_id)
    if not entries: raise HTTPException(status_code=404, detail="No entries to export")

    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment
    # Derive columns
    cols = []
    seen = set()
    for e in entries:
        for k in (e.get("data") or {}).keys():
            if k not in seen: seen.add(k); cols.append(k)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = db["name"][:31]

    hdr_fill = PatternFill(start_color="111111", end_color="111111", fill_type="solid")
    hdr_font = Font(name="Arial", color="FFFFFF", bold=True, size=11)
    for ci, col in enumerate(cols, 1):
        cell = ws.cell(row=1, column=ci, value=col)
        cell.fill = hdr_fill; cell.font = hdr_font
        ws.column_dimensions[cell.column_letter].width = 25

    for ri, entry in enumerate(entries, 2):
        data = entry.get("data") or {}
        for ci, col in enumerate(cols, 1):
            ws.cell(row=ri, column=ci, value=data.get(col, ""))

    stamp    = datetime.now().strftime("%Y%m%d_%H%M")
    filename = f"reachct_{db['name'].replace(' ','_')}_{stamp}.xlsx"
    wb.save(filename)
    return FileResponse(path=filename, filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

# ── Upload with Claude cleaning ───────────────────────────────────────────────
@app.post("/api/databases/{db_id}/upload")
async def upload_file(db_id: int, file: UploadFile = File(...), authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    db   = get_user_database(db_id, int(user["sub"]))
    if not db: raise HTTPException(status_code=403, detail="Access denied")
    if db.get("role") == "viewer": raise HTTPException(status_code=403, detail="Viewers cannot upload")

    try:
        import pandas as pd
        import anthropic

        contents = await file.read()
        buf      = io.BytesIO(contents)

        if file.filename.lower().endswith(".csv"):
            df = pd.read_csv(buf, dtype=str, header=None)
        else:
            df = pd.read_excel(buf, dtype=str, header=None)

        # Remove completely empty rows/cols
        df = df.dropna(how="all").reset_index(drop=True)
        df = df.dropna(axis=1, how="all")

        # Convert to raw text for Claude to analyze
        raw_text = df.to_csv(index=False, header=False)

        # Ask Claude to identify and standardize the data
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY",""))
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4000,
            messages=[{
                "role": "user",
                "content": f"""You are a data cleaning assistant. Analyze this raw spreadsheet data and extract company contact information.

The data may have no headers, inconsistent formatting, or mixed column orders.

Raw data:
{raw_text}

Your task:
1. Identify which values are: company names, emails, phones, websites, cities, countries, company types
2. Return ONLY a valid JSON array of objects. Each object should have these keys (use empty string "" if unknown):
   - name (company name)
   - email
   - phone
   - website
   - city
   - country
   - company_type

Rules:
- Skip completely empty rows
- Clean phone numbers (keep digits and + only)
- Lowercase emails
- Do not invent data — only use what's in the file
- Return ONLY the JSON array, no explanation, no markdown

Example output format:
[{{"name":"Acme Corp","email":"info@acme.com","phone":"+34612345678","website":"acme.com","city":"Madrid","country":"Spain","company_type":""}}]"""
            }]
        )

        response_text = message.content[0].text.strip()
        # Strip markdown if present
        response_text = re.sub(r"```json\s*", "", response_text)
        response_text = re.sub(r"```\s*", "", response_text)

        cleaned_rows = json.loads(response_text)

        if not isinstance(cleaned_rows, list):
            raise ValueError("Claude did not return a list")

        # Save to user database
        entries = add_db_entries(db_id, [dict(row) for row in cleaned_rows])

        # Save to shared companies table
        for row in cleaned_rows:
            if row.get("name"):
                upsert_company("upload", {
                    "name":         row.get("name",""),
                    "email":        row.get("email",""),
                    "phone":        row.get("phone",""),
                    "website":      row.get("website",""),
                    "city":         row.get("city",""),
                    "country":      row.get("country",""),
                    "company_type": row.get("company_type",""),
                    "maps_url":     "",
                })

        cols = ["name","email","phone","website","city","country","company_type"]
        return {"inserted": len(entries), "columns": cols, "cleaned_by": "claude"}

    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="Claude could not parse the file. Make sure it contains company data.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Upload failed: {str(e)}")

# ── Pull from shared DB into user database ────────────────────────────────────
class PullToDBRequest(BaseModel):
    queries:   List[str] = []
    cities:    List[str] = []
    countries: List[str] = []

@app.post("/api/databases/{db_id}/pull")
def pull_to_db(db_id: int, body: PullToDBRequest, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    db   = get_user_database(db_id, int(user["sub"]))
    if not db: raise HTTPException(status_code=403, detail="Access denied")
    if db.get("role") == "viewer": raise HTTPException(status_code=403, detail="Viewers cannot pull data")
    companies = get_companies(queries=body.queries, cities=body.cities, countries=body.countries)
    if not companies: return {"inserted": 0, "message": "No companies found matching filters"}
    rows = [{"company_id": str(c.get("id","")), "name": c.get("name",""), "email": c.get("email",""),
             "phone": c.get("phone",""), "website": c.get("website",""), "city": c.get("city",""),
             "country": c.get("country",""), "company_type": c.get("company_type","")} for c in companies]
    entries = add_db_entries(db_id, rows)
    return {"inserted": len(entries), "columns": ["name","email","phone","website","city","country","company_type"]}

# ── Add specific rows from search/pull to a user database ─────────────────────
class AddRowsToDBRequest(BaseModel):
    db_id: int
    rows:  List[dict]

@app.post("/api/databases/add-rows")
def add_rows_to_db(body: AddRowsToDBRequest, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    db   = get_user_database(body.db_id, int(user["sub"]))
    if not db: raise HTTPException(status_code=403, detail="Access denied or database not found")
    if db.get("role") == "viewer": raise HTTPException(status_code=403, detail="Viewers cannot add entries")
    entries = add_db_entries(body.db_id, body.rows)
    return {"inserted": len(entries)}

# ── Collaborators ─────────────────────────────────────────────────────────────
class AddCollaboratorRequest(BaseModel):
    email: str
    role:  str = "viewer"

@app.post("/api/databases/{db_id}/collaborators")
def add_collab(db_id: int, body: AddCollaboratorRequest, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    try: return add_collaborator(db_id, int(user["sub"]), body.email, body.role)
    except ValueError as e: raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e: raise HTTPException(status_code=403, detail=str(e))

@app.get("/api/databases/{db_id}/collaborators")
def list_collabs(db_id: int, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    if not get_user_database(db_id, int(user["sub"])): raise HTTPException(status_code=403, detail="Access denied")
    return get_collaborators(db_id)

@app.delete("/api/databases/{db_id}/collaborators/{target_user_id}")
def remove_collab(db_id: int, target_user_id: int, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    try:
        if not remove_collaborator(db_id, int(user["sub"]), target_user_id):
            raise HTTPException(status_code=404, detail="Collaborator not found")
        return {"deleted": True}
    except PermissionError as e: raise HTTPException(status_code=403, detail=str(e))

# ── Admin ─────────────────────────────────────────────────────────────────────
@app.get("/api/admin/jobs")
def admin_get_jobs():
    return {"jobs": [{"id": jid, **job} for jid, job in jobs.items()]}

@app.post("/api/admin/cancel-all")
def admin_cancel_all():
    cancelled = []
    for jid, job in jobs.items():
        if job["status"] in ("running","queued","starting"):
            job["status"] = "cancelling"; cancelled.append(jid)
    return {"cancelled": cancelled, "count": len(cancelled)}

# ── Shared DB upload (Push tab on DatabasePage, no user DB needed) ────────────
@app.post("/api/upload-shared")
async def upload_shared(file: UploadFile = File(...), authorization: str = Header(default=None)):
    """Upload Excel/CSV directly to the shared companies table via Claude cleaning."""
    user = get_current_user(authorization)  # must be logged in
    try:
        import pandas as pd
        import anthropic

        contents = await file.read()
        buf      = io.BytesIO(contents)
        if file.filename.lower().endswith(".csv"):
            df = pd.read_csv(buf, dtype=str, header=None)
        else:
            df = pd.read_excel(buf, dtype=str, header=None)

        df = df.dropna(how="all").reset_index(drop=True)
        df = df.dropna(axis=1, how="all")
        raw_text = df.to_csv(index=False, header=False)

        client  = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY",""))
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4000,
            messages=[{"role":"user","content":f"""You are a data cleaning assistant. Analyze this raw spreadsheet data and extract company contact information.

Raw data:
{raw_text}

Return ONLY a valid JSON array. Each object must have these keys (use "" if unknown):
name, email, phone, website, city, country, company_type

Rules: skip empty rows, clean phones (digits/+ only), lowercase emails, don't invent data.
Return ONLY the JSON array, no explanation."""}]
        )

        response_text = re.sub(r"```json\s*","",message.content[0].text.strip())
        response_text = re.sub(r"```\s*","",response_text)
        cleaned_rows  = json.loads(response_text)

        inserted = 0
        for row in cleaned_rows:
            if row.get("name"):
                upsert_company("upload_shared", {
                    "name":         row.get("name",""),
                    "email":        row.get("email",""),
                    "phone":        row.get("phone",""),
                    "website":      row.get("website",""),
                    "city":         row.get("city",""),
                    "country":      row.get("country",""),
                    "company_type": row.get("company_type",""),
                    "maps_url":     "",
                })
                inserted += 1

        return {"inserted": inserted, "cleaned_by": "claude"}

    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="Claude could not parse the file. Please ensure it contains company data.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Upload failed: {str(e)}")
