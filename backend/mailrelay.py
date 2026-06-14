"""
ReachCT — mailrelay.py
Mailrelay API v1 integration.
API docs: https://{account}.ipzmarketing.com/api-documentation/
"""

import requests


def mailrelay_request(api_key: str, method: str, endpoint: str, data: dict = None) -> any:
    base_url = "https://spain-internship.ipzmarketing.com"
    url      = f"{base_url}{endpoint}"
    headers  = {
        "X-AUTH-TOKEN": api_key,
        "Content-Type": "application/json",
    }
    res = requests.request(method, url, headers=headers, json=data, timeout=15)
    if not res.ok:
        raise Exception(f"Mailrelay API error {res.status_code}: {res.text}")
    try:
        return res.json()
    except:
        return {}


def validate_api_key(api_key: str) -> bool:
    try:
        mailrelay_request(api_key, "GET", "/api/v1/groups")
        return True
    except:
        return False


def get_senders(api_key: str) -> list:
    """Get all configured senders from Mailrelay account."""
    try:
        result = mailrelay_request(api_key, "GET", "/api/v1/senders")
        return result if isinstance(result, list) else []
    except:
        return []


def create_group(api_key: str, name: str) -> dict:
    """Create a subscriber group. Returns full response dict."""
    return mailrelay_request(api_key, "POST", "/api/v1/groups", {"name": name})


def add_subscribers(api_key: str, group_id: int, emails: list) -> dict:
    """
    Bulk import subscribers to a Mailrelay group using the imports endpoint.
    This mirrors the UI paste import — handles new and existing subscribers.
    """
    group_id = int(group_id)
    valid    = [str(e).strip().lower() for e in emails if e and "@" in str(e)]
    if not valid:
        return {"success": 0, "failed": 0, "errors": ["No valid emails"]}
    try:
        result = mailrelay_request(api_key, "POST", "/api/v1/imports", {
            "name":        f"ReachCT import {group_id}",
            "subscribers": [{"email": e} for e in valid],
            "group_ids":   [group_id],
        })
        print(f"🔍 Import result: {result}")
        return {"success": len(valid), "failed": 0, "errors": []}
    except Exception as e:
        print(f"⚠️ Bulk import failed: {e}, trying individual adds...")
        results = {"success": 0, "failed": 0, "errors": []}
        for email in valid:
            try:
                mailrelay_request(api_key, "POST", "/api/v1/subscribers", {
                    "email":     email,
                    "group_ids": [group_id],
                    "status":    "active",
                })
                results["success"] += 1
            except Exception as e2:
                if "already exists" in str(e2).lower():
                    try:
                        search = mailrelay_request(api_key, "GET",
                            f"/api/v1/subscribers?email={email}")
                        subs = search if isinstance(search, list) else []
                        if subs:
                            sub_id = subs[0].get("id")
                            current = subs[0].get("group_ids", [])
                            if group_id not in current:
                                current.append(group_id)
                            mailrelay_request(api_key, "PATCH",
                                f"/api/v1/subscribers/{sub_id}",
                                {"group_ids": current})
                        results["success"] += 1
                    except Exception as e3:
                        results["failed"] += 1
                        results["errors"].append(f"{email}: {str(e3)}")
                else:
                    results["failed"] += 1
                    results["errors"].append(f"{email}: {str(e2)}")
        return results


def create_campaign(api_key: str, name: str, subject: str, body: str,
                    group_id: int, sender_id: int) -> dict:
    """
    Create a campaign draft in Mailrelay.
    sender_id: integer ID from GET /api/v1/senders
    group_ids: list of integer group IDs
    target: "groups" or "segment"
    """
    html_body = body or "<p>Email body — edit in Mailrelay before sending.</p>"
    return mailrelay_request(api_key, "POST", "/api/v1/campaigns", {
        "name":       name,
        "subject":    subject,
        "html":       html_body,
        "sender_id":  int(sender_id),
        "target":     "groups",
        "group_ids":  [int(group_id)],
    })


def list_campaigns(api_key: str) -> list:
    try:
        result = mailrelay_request(api_key, "GET", "/api/v1/campaigns")
        return result if isinstance(result, list) else []
    except:
        return []