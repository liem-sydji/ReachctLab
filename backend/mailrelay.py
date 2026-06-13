"""
ReachCT — mailrelay.py
Mailrelay API integration.
"""

import requests


def mailrelay_request(api_key: str, method: str, endpoint: str, data: dict = None) -> dict:
    """Make a request to the Mailrelay API."""
    base_url = "https://spain-internship.ipzmarketing.com"  # Mailrelay account URL
    url      = f"{base_url}{endpoint}"
    headers  = {
        "X-AUTH-TOKEN": api_key,
        "Content-Type": "application/json",
    }
    res = requests.request(method, url, headers=headers, json=data, timeout=15)
    if not res.ok:
        raise Exception(f"Mailrelay API error {res.status_code}: {res.text}")
    return res.json() if res.text else {}


def validate_api_key(api_key: str) -> bool:
    """Check if an API key is valid by fetching subscriber groups."""
    try:
        mailrelay_request(api_key, "GET", "/api/v1/groups")
        return True
    except:
        try:
            mailrelay_request(api_key, "GET", "/api/v1/subscribers")
            return True
        except:
            return False


def create_group(api_key: str, name: str) -> dict:
    """Create a subscriber group in Mailrelay."""
    return mailrelay_request(api_key, "POST", "/api/v1/groups", {"name": name})


def add_subscribers(api_key: str, group_id: int, contacts: list) -> dict:
    """
    Add subscribers to a Mailrelay group.
    contacts: list of {email, name} dicts
    """
    results = {"success": 0, "failed": 0, "errors": []}
    for contact in contacts:
        try:
            mailrelay_request(api_key, "POST", "/api/v1/subscribers", {
                "email":          contact.get("email", ""),
                "email_list_ids": [group_id],
            })
            results["success"] += 1
        except Exception as e:
            results["failed"] += 1
            results["errors"].append(str(e))
    return results


def create_campaign(api_key: str, name: str, subject: str, body: str,
                    group_id: int, sender_email: str, sender_name: str) -> dict:
    """Create a campaign draft in Mailrelay."""
    return mailrelay_request(api_key, "POST", "/api/v1/campaigns", {
        "name":          name,
        "subject":       subject,
        "html_body":     body,
        "email_list_ids": [group_id],
        "from_email":    sender_email,
        "from_name":     sender_name,
        "status":        "draft",
    })


def list_campaigns(api_key: str) -> list:
    """List all campaigns in Mailrelay."""
    try:
        return mailrelay_request(api_key, "GET", "/api/v1/campaigns")
    except:
        return []
