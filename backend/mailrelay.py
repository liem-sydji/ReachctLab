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
    Add subscribers to a Mailrelay group.
    Tries both group_ids and email_list_ids field names.
    """
    results = {"success": 0, "failed": 0, "errors": []}
    group_id = int(group_id)
    for email in emails:
        email = str(email).strip().lower()
        if not email or "@" not in email:
            continue
        try:
            # Try group_ids first (v1 API standard)
            mailrelay_request(api_key, "POST", "/api/v1/subscribers", {
                "email":     email,
                "group_ids": [group_id],
                "status":    "active",
            })
            results["success"] += 1
        except Exception as e1:
            try:
                # Fallback: try email_list_ids
                mailrelay_request(api_key, "POST", "/api/v1/subscribers", {
                    "email":          email,
                    "email_list_ids": [group_id],
                    "status":         "active",
                })
                results["success"] += 1
            except Exception as e2:
                results["failed"] += 1
                results["errors"].append(f"{email}: {str(e1)} | fallback: {str(e2)}")
    return results


def create_campaign(api_key: str, name: str, subject: str, body: str,
                    group_id: int, sender_id: int) -> dict:
    """
    Create a campaign draft in Mailrelay.
    sender_id: integer ID from GET /api/v1/senders
    group_ids: list of integer group IDs
    target: "groups" or "segment"
    """
    return mailrelay_request(api_key, "POST", "/api/v1/campaigns", {
        "name":       name,
        "subject":    subject,
        "body":       body or "<p>Email body — edit in Mailrelay before sending.</p>",
        "sender_id":  int(sender_id),
        "group_ids":  [int(group_id)],
    })


def list_campaigns(api_key: str) -> list:
    try:
        result = mailrelay_request(api_key, "GET", "/api/v1/campaigns")
        return result if isinstance(result, list) else []
    except:
        return []
