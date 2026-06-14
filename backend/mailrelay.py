"""
ReachCT — mailrelay.py
Mailrelay API integration.
"""

import requests
import json


def mailrelay_request(api_key: str, method: str, endpoint: str, data: dict = None) -> dict:
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


def create_group(api_key: str, name: str) -> dict:
    return mailrelay_request(api_key, "POST", "/api/v1/groups", {"name": name})


def add_subscribers(api_key: str, group_id: int, emails: list) -> dict:
    """
    Add subscribers to a Mailrelay group.
    emails: list of email strings
    Uses batch import endpoint for reliability.
    """
    results = {"success": 0, "failed": 0, "errors": []}
    for email in emails:
        if not email or "@" not in str(email):
            continue
        try:
            mailrelay_request(api_key, "POST", "/api/v1/subscribers", {
                "email":           str(email).strip().lower(),
                "email_list_ids":  [group_id],
                "status":          "active",
            })
            results["success"] += 1
        except Exception as e:
            results["failed"] += 1
            results["errors"].append(f"{email}: {str(e)}")
    return results


def create_campaign(api_key: str, name: str, subject: str, body: str,
                    group_id: int, sender_email: str, sender_name: str) -> dict:
    """
    Create a campaign draft in Mailrelay.
    Field names from Mailrelay API v1: sender, target, html (not from_email etc.)
    """
    return mailrelay_request(api_key, "POST", "/api/v1/campaigns", {
        "name":           name,
        "subject":        subject,
        "html":           body or "<p>Email body</p>",
        "sender":         f"{sender_name} <{sender_email}>",
        "target":         [group_id],
    })


def list_campaigns(api_key: str) -> list:
    try:
        result = mailrelay_request(api_key, "GET", "/api/v1/campaigns")
        return result if isinstance(result, list) else []
    except:
        return []
