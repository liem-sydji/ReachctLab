"""
ReachCT — api.py
FastAPI backend — scraper + user databases + auth.
"""

import os
import sys
import uuid
import json
import asyncio
import io
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
    update_db_entry, delete_db_entry,
    add_collaborator, get_collaborators, remove_collaborator,
)
from reachct import scrape_google_maps, export_to_excel
from auth    import verify_google_token, create_jwt, decode_jwt

app = FastAPI(title="ReachCT API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Queue ─────────────────────────────────────────────────────────────────────
import threading
import queue as queue_module

jobs: dict   = {}
search_queue = queue_module.Queue()
queue_lock   = threading.Lock()


def queue_worker():
    while True:
        try:
            job_id, query, city, country, start, end = search_queue.get(timeout=300)
            jobs[job_id]["status"]         = "starting"
            jobs[job_id]["queue_position"] = 0
            waiting = [j for j in jobs.values() if j["status"] == "queued"]
            for idx, j in enumerate(waiting):
                j["queue_position"] = idx + 1
            t = threading.Thread(target=run_scrape_job_thread, args=(job_id, query, city, country, start, end))
            t.start()
            t.join()
            search_queue.task_done()
        except queue_module.Empty:
            continue
        except Exception as e:
            print(f"❌ Queue worker error: {e}")
            continue

_worker_thread = threading.Thread(target=queue_worker, daemon=True)
_worker_thread.start()


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


# ── Health ────────────────────────────────────────────────────────────────────
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
    query   = query.strip()
    city    = city.strip().title()
    country = country.strip().title()
    if not query or not city or not country:
        raise HTTPException(status_code=400, detail="query, city and country are required")
    if end <= start:
        raise HTTPException(status_code=400, detail="end must be greater than start")
    if (end - start) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 listings per search.")

    job_id = str(uuid.uuid4())[:8]
    with queue_lock:
        queued_or_running = sum(1 for j in jobs.values() if j["status"] in ("running", "queued"))
        queue_position    = queued_or_running
        jobs[job_id] = {
            "status": "queued", "queue_position": queue_position,
            "progress": 0, "total": end - start, "total_on_maps": None,
            "processing": None, "results": [], "error": None,
            "query": query, "city": city, "country": country,
        }
        search_queue.put((job_id, query, city, country, start, end))

    message = "Scrape started" if queue_position == 0 else f"Queued at position {queue_position}"
    return {"job_id": job_id, "message": message, "queue_position": queue_position}


def run_scrape_job_thread(job_id, query, city, country, start, end):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(run_scrape_job(job_id, query, city, country, start, end))
    finally:
        loop.close()


async def run_scrape_job(job_id, query, city, country, start, end):
    try:
        jobs[job_id]["status"] = "running"
        run_id  = job_id
        results = await scrape_google_maps(query, city, country, start, end, run_id, jobs=jobs, job_id=job_id)
        for company in results:
            upsert_company(run_id, company)
        save_search(run_id, query, city, country, start, end, len(results))
        jobs[job_id]["status"]  = "cancelled" if jobs[job_id].get("status") == "cancelling" else "done"
        jobs[job_id]["results"] = results
    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"]  = str(e)
        print(f"❌ Job {job_id} failed: {e}")


@app.post("/api/job/{job_id}/cancel")
def cancel_job(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] in ("running", "queued"):
        job["status"] = "cancelling"
        return {"message": "Cancellation requested"}
    return {"message": f"Job already {job['status']}"}


@app.get("/api/job/{job_id}")
def get_job(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ── Companies / filters / export ──────────────────────────────────────────────
class MultiFilterRequest(BaseModel):
    queries:   List[str] = []
    cities:    List[str] = []
    countries: List[str] = []

@app.post("/api/companies/multi")
def get_companies_multi(body: MultiFilterRequest):
    """Multi-value filter — for user dashboard pull panel."""
    data = get_companies(
        queries=body.queries,
        cities=body.cities,
        countries=body.countries,
    )
    return {"companies": data, "total": len(data)}

@app.get("/api/companies")
def get_all_companies(city: Optional[str] = None, country: Optional[str] = None, query: Optional[str] = None):
    if city:    city    = city.strip().title()
    if country: country = country.strip().title()
    if query:   query   = query.strip()
    data = get_companies(query=query, city=city, country=country)
    return {"companies": data, "total": len(data)}

@app.get("/api/filters")
def get_filters_endpoint():
    return get_filters()

@app.get("/api/export")
def export(query: str = "", city: str = "", country: str = ""):
    data = get_companies(city=city.strip().title(), country=country.strip().title())
    if not data:
        raise HTTPException(status_code=404, detail="No companies found")
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
    db   = create_user_database(int(user["sub"]), body.name.strip())
    return db

@app.get("/api/databases")
def list_dbs(authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    return get_user_databases(int(user["sub"]))

@app.delete("/api/databases/{db_id}")
def delete_db(db_id: int, authorization: str = Header(default=None)):
    user    = get_current_user(authorization)
    deleted = delete_user_database(db_id, int(user["sub"]))
    if not deleted:
        raise HTTPException(status_code=404, detail="Database not found or not owner")
    return {"deleted": True}


# ── Database entries ──────────────────────────────────────────────────────────
@app.get("/api/databases/{db_id}/entries")
def get_entries(db_id: int, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    db   = get_user_database(db_id, int(user["sub"]))
    if not db:
        raise HTTPException(status_code=403, detail="Access denied")
    return get_db_entries(db_id)

class AddEntriesRequest(BaseModel):
    rows: List[dict]

@app.post("/api/databases/{db_id}/entries")
def add_entries(db_id: int, body: AddEntriesRequest, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    db   = get_user_database(db_id, int(user["sub"]))
    if not db:
        raise HTTPException(status_code=403, detail="Access denied")
    if db.get("role") == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot add entries")
    return add_db_entries(db_id, body.rows)

class UpdateEntryRequest(BaseModel):
    data: dict

@app.patch("/api/databases/{db_id}/entries/{entry_id}")
def update_entry(db_id: int, entry_id: int, body: UpdateEntryRequest, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    db   = get_user_database(db_id, int(user["sub"]))
    if not db:
        raise HTTPException(status_code=403, detail="Access denied")
    if db.get("role") == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot edit entries")
    row = update_db_entry(entry_id, db_id, body.data)
    if not row:
        raise HTTPException(status_code=404, detail="Entry not found")
    return row

@app.delete("/api/databases/{db_id}/entries/{entry_id}")
def delete_entry(db_id: int, entry_id: int, authorization: str = Header(default=None)):
    user    = get_current_user(authorization)
    db      = get_user_database(db_id, int(user["sub"]))
    if not db:
        raise HTTPException(status_code=403, detail="Access denied")
    if db.get("role") == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot delete entries")
    deleted = delete_db_entry(entry_id, db_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"deleted": True}


# ── Upload Excel/CSV to user database ────────────────────────────────────────
@app.post("/api/databases/{db_id}/upload")
async def upload_file(db_id: int, file: UploadFile = File(...), authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    db   = get_user_database(db_id, int(user["sub"]))
    if not db:
        raise HTTPException(status_code=403, detail="Access denied")
    if db.get("role") == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot upload")

    try:
        import pandas as pd
        contents = await file.read()
        buf      = io.BytesIO(contents)

        if file.filename.endswith(".csv"):
            df = pd.read_csv(buf, dtype=str)
        else:
            df = pd.read_excel(buf, dtype=str)

        # Standardise column names
        COLUMN_MAP = {
            "company name": "name", "company": "name", "nombre": "name",
            "email address": "email", "e-mail": "email", "mail": "email",
            "phone number": "phone", "telephone": "phone", "tel": "phone",
            "website": "website", "url": "website", "web": "website",
            "city": "city", "ciudad": "city", "ville": "city",
            "country": "country", "pais": "country", "pays": "country",
            "company type": "company_type", "type": "company_type", "sector": "company_type",
        }
        df.columns = [COLUMN_MAP.get(col.lower().strip(), col.lower().strip()) for col in df.columns]
        df = df.fillna("")

        rows      = df.to_dict(orient="records")
        entries   = add_db_entries(db_id, rows)

        # Also add to shared companies table if has enough info
        for row in rows:
            if row.get("name"):
                upsert_company("upload", {
                    "name":         row.get("name", ""),
                    "email":        row.get("email", ""),
                    "phone":        row.get("phone", ""),
                    "website":      row.get("website", ""),
                    "city":         row.get("city", ""),
                    "country":      row.get("country", ""),
                    "company_type": row.get("company_type", ""),
                    "maps_url":     "",
                })

        return {"inserted": len(entries), "columns": list(df.columns)}

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
    if not db:
        raise HTTPException(status_code=403, detail="Access denied")
    if db.get("role") == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot pull data")

    companies = get_companies(queries=body.queries, cities=body.cities, countries=body.countries)
    if not companies:
        return {"inserted": 0, "message": "No companies found matching filters"}

    rows = [{
        "company_id":   str(c.get("id", "")),
        "name":         c.get("name", ""),
        "email":        c.get("email", ""),
        "phone":        c.get("phone", ""),
        "website":      c.get("website", ""),
        "city":         c.get("city", ""),
        "country":      c.get("country", ""),
        "company_type": c.get("company_type", ""),
    } for c in companies]

    entries = add_db_entries(db_id, rows)
    return {"inserted": len(entries), "columns": ["name","email","phone","website","city","country","company_type"]}


# ── Collaborators ─────────────────────────────────────────────────────────────
class AddCollaboratorRequest(BaseModel):
    email: str
    role:  str = "viewer"

@app.post("/api/databases/{db_id}/collaborators")
def add_collab(db_id: int, body: AddCollaboratorRequest, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    try:
        result = add_collaborator(db_id, int(user["sub"]), body.email, body.role)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))

@app.get("/api/databases/{db_id}/collaborators")
def list_collabs(db_id: int, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    db   = get_user_database(db_id, int(user["sub"]))
    if not db:
        raise HTTPException(status_code=403, detail="Access denied")
    return get_collaborators(db_id)

@app.delete("/api/databases/{db_id}/collaborators/{target_user_id}")
def remove_collab(db_id: int, target_user_id: int, authorization: str = Header(default=None)):
    user = get_current_user(authorization)
    try:
        deleted = remove_collaborator(db_id, int(user["sub"]), target_user_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Collaborator not found")
        return {"deleted": True}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


# ── Admin ─────────────────────────────────────────────────────────────────────
@app.get("/api/admin/jobs")
def admin_get_jobs():
    return {"jobs": [{"id": jid, **job} for jid, job in jobs.items()]}

@app.post("/api/admin/cancel-all")
def admin_cancel_all():
    cancelled = []
    for jid, job in jobs.items():
        if job["status"] in ("running", "queued", "starting"):
            job["status"] = "cancelling"
            cancelled.append(jid)
    return {"cancelled": cancelled, "count": len(cancelled)}
