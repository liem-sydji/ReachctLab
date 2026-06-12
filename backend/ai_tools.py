"""
ReachCT — ai_tools.py
Tool implementations that ReachAI (Claude) can call.
"""

import asyncio
import uuid
import time
from database import (
    get_companies, get_user_databases, get_user_database,
    create_user_database, add_db_entries, get_db_entries, get_filters
)
from reachct import scrape_google_maps


def run_async(coro):
    """Run async function from sync context."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def tool_list_databases(user_id: int) -> dict:
    """List all databases the user has access to."""
    dbs = get_user_databases(user_id)
    result = []
    for db in dbs:
        entries = get_db_entries(db["id"])
        result.append({
            "id":    db["id"],
            "name":  db["name"],
            "role":  db["role"],
            "rows":  len(entries),
        })
    return {"databases": result, "total": len(result)}


def tool_get_database_contents(user_id: int, db_id: int) -> dict:
    """Get entries from a specific database."""
    db = get_user_database(db_id, user_id)
    if not db:
        return {"error": f"Database {db_id} not found or access denied"}
    entries = get_db_entries(db_id)
    return {
        "database_name": db["name"],
        "total":         len(entries),
        "entries":       [e.get("data", {}) for e in entries[:50]],  # cap at 50 for context
        "truncated":     len(entries) > 50,
    }


def tool_get_database_stats(user_id: int) -> dict:
    """Get stats about the shared database."""
    filters = get_filters()
    companies = get_companies()
    by_country = {}
    for c in companies:
        country = c.get("country", "Unknown")
        by_country[country] = by_country.get(country, 0) + 1
    return {
        "total_companies":  len(companies),
        "total_with_email": sum(1 for c in companies if c.get("email")),
        "countries":        filters.get("countries", []),
        "by_country":       dict(sorted(by_country.items(), key=lambda x: x[1], reverse=True)[:10]),
        "company_types":    filters.get("company_types", []),
    }


def tool_pull_from_database(queries: list, cities: list, countries: list) -> dict:
    """Pull companies from shared database with multi-value filters."""
    companies = get_companies(queries=queries, cities=cities, countries=countries)
    return {
        "total":     len(companies),
        "companies": companies[:100],  # cap for context
        "truncated": len(companies) > 100,
    }


def tool_save_to_database(user_id: int, db_id: int, rows: list) -> dict:
    """Save rows to a user database."""
    db = get_user_database(db_id, user_id)
    if not db:
        return {"error": f"Database {db_id} not found or access denied"}
    if db.get("role") == "viewer":
        return {"error": "You are a viewer and cannot add entries to this database"}
    entries = add_db_entries(db_id, rows)
    return {"inserted": len(entries), "database": db["name"]}


def tool_create_database(user_id: int, name: str) -> dict:
    """Create a new user database."""
    db = create_user_database(user_id, name)
    return {"id": db["id"], "name": db["name"], "created": True}


def tool_search_google_maps(query: str, city: str, country: str,
                             start: int, end: int,
                             jobs: dict, search_queue) -> dict:
    """Trigger a Google Maps scrape and wait for completion."""
    import queue as queue_module
    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {
        "status": "queued", "queue_position": 0, "progress": 0,
        "total": end - start, "total_on_maps": None, "processing": None,
        "results": [], "error": None,
        "query": query, "city": city, "country": country,
    }
    search_queue.put((job_id, query, city, country, start, end))

    # Poll until done (max 10 minutes)
    timeout = 600
    elapsed = 0
    while elapsed < timeout:
        time.sleep(5)
        elapsed += 5
        job = jobs.get(job_id, {})
        if job.get("status") in ("done", "cancelled", "error"):
            break

    job = jobs.get(job_id, {})
    if job.get("status") == "error":
        return {"error": job.get("error", "Search failed")}
    results = job.get("results", [])
    return {
        "job_id":  job_id,
        "total":   len(results),
        "emails":  sum(1 for r in results if r.get("email")),
        "results": results,
    }
