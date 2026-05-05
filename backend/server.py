from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
import asyncio
from datetime import datetime, timezone, timedelta
import unicodedata
import requests

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="PortPassLH API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("portpasslh")

# -------------------- Auth (Emergent Google) --------------------
ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}
EMERGENT_SESSION_DATA_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

async def get_current_user(request: Request) -> Optional[dict]:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
    if not token:
        return None
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    expires_at = sess.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        return None
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    return user

async def require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# -------------------- Static reference data --------------------
WORKS_SEED = [
    {"id": "pont-hode", "name": "Pont du Hode", "type": "Pont", "lat": 49.4778763311, "lng": 0.3540242849},
    {"id": "pont-rouge", "name": "Pont Rouge", "type": "Pont", "lat": 49.4878672124, "lng": 0.1858056049},
    {"id": "pont-7", "name": "Pont 7 – Pont VII", "type": "Pont", "lat": 49.4929444816, "lng": 0.1804632758},
    {"id": "pont-6", "name": "Pont 6", "type": "Pont", "lat": 49.4877340502, "lng": 0.1630858485},
    {"id": "pont-8", "name": "Pont 8", "type": "Pont", "lat": 49.4978789626, "lng": 0.2017334067},
    {"id": "pont-7bis", "name": "Pont 7 bis", "type": "Pont", "lat": 49.4974491119, "lng": 0.1969694927},
    {"id": "pont-5", "name": "Pont 5", "type": "Pont", "lat": 49.4846344572, "lng": 0.1519573561},
    {"id": "pont-quinette", "name": "Pont Quinette", "type": "Pont", "lat": 49.4829841586, "lng": 0.1165466441},
    {"id": "pont-aval-vetillart", "name": "Pont aval Vétillart", "type": "Pont", "lat": 49.4806782677, "lng": 0.1382003157},
    {"id": "pont-amont-vetillart", "name": "Pont Amont Vétillart", "type": "Pont", "lat": 49.4813056152, "lng": 0.1407028168},
    {"id": "pont-aval-ecluse-francois-1er", "name": "Pont aval Écluse François 1er", "type": "Pont", "lat": 49.4752104323, "lng": 0.1698498695},
    {"id": "pont-amont-ecluse-francois-1er", "name": "Pont amont Écluse François 1er", "type": "Pont", "lat": 49.476613847, "lng": 0.1751423069},
]

HAROPA_URL = "https://www.havre-port.com/map/getPonts"
StatusType = Literal["ouvert", "fermeture", "bientot", "ferme"]

# HAROPA statut code -> internal status
HAROPA_STATUS_MAP = {
    0: "ouvert",
    1: "ferme",
    2: "fermeture",
    3: "ferme",     # travaux
    11: "bientot",  # bientôt ouvert (manoeuvre)
}

# Map HAROPA "nom" -> seed work id
HAROPA_NAME_TO_ID = {
    "pont 7": "pont-7",
    "pont 7 bis": "pont-7bis",
    "pont 8": "pont-8",
    "pont 6": "pont-6",
    "pont 5": "pont-5",
    "pont rouge": "pont-rouge",
    "pont du hode": "pont-hode",
    "pont amont fr1": "pont-amont-ecluse-francois-1er",
    "pont aval fr1": "pont-aval-ecluse-francois-1er",
    "pont amont vetillart": "pont-amont-vetillart",
    "pont aval vetillart": "pont-aval-vetillart",
}

# -------------------- Pydantic Models --------------------
class Work(BaseModel):
    id: str
    name: str
    type: str
    lat: float
    lng: float
    status: StatusType = "ouvert"
    updated_at: Optional[str] = None
    source: Optional[str] = None  # "manual" | "haropa" | "seed"

class StatusUpdate(BaseModel):
    status: StatusType

class HistoryEntry(BaseModel):
    id: str
    work_id: str
    work_name: str
    status: StatusType
    source: str
    changed_at: str

class GlobalStats(BaseModel):
    total_works: int
    open_count: int
    closing_count: int
    soon_count: int
    closed_count: int
    last_haropa_sync: Optional[str] = None
    total_events_24h: int

# -------------------- Helpers --------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def normalize(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    return s.lower().strip()

async def seed_works():
    count = await db.works.count_documents({})
    if count == 0:
        ts = now_iso()
        docs = [{**w, "status": "ouvert", "updated_at": ts, "source": "seed"} for w in WORKS_SEED]
        await db.works.insert_many(docs)
        logger.info(f"Seeded {len(docs)} works")

async def log_history(work_id: str, work_name: str, status: str, source: str):
    entry = {
        "id": str(uuid.uuid4()),
        "work_id": work_id,
        "work_name": work_name,
        "status": status,
        "source": source,
        "changed_at": now_iso(),
    }
    await db.status_history.insert_one(entry)

# -------------------- HAROPA Scraper (JSON API) --------------------
def fetch_haropa_json() -> Optional[dict]:
    try:
        r = requests.get(HAROPA_URL, timeout=15, headers={"User-Agent": "Mozilla/5.0 PortPassLH/1.0"})
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning(f"HAROPA fetch failed: {e}")
        return None

async def sync_from_haropa() -> dict:
    payload = fetch_haropa_json()
    if not payload or "data" not in payload:
        return {"ok": False, "reason": "fetch_failed", "updated": 0}

    cursor = db.works.find({}, {"_id": 0})
    works = await cursor.to_list(1000)
    by_id = {w["id"]: w for w in works}

    ts = now_iso()
    updated = 0
    seen_ids = set()
    for haropa_id, item in payload["data"].items():
        nom = item.get("nom", "").strip()
        statut_code = item.get("statut")
        if statut_code not in HAROPA_STATUS_MAP:
            continue
        new_status = HAROPA_STATUS_MAP[statut_code]
        norm_name = normalize(nom)

        # Find target work id
        target_id = HAROPA_NAME_TO_ID.get(norm_name)
        if not target_id:
            target_id = f"haropa-{haropa_id}"
        seen_ids.add(target_id)

        existing = by_id.get(target_id)
        pos = item.get("position") or {}
        lat = pos.get("lat")
        lng = pos.get("lon")

        if existing is None:
            # Create new work coming from HAROPA only
            doc = {
                "id": target_id,
                "name": nom,
                "type": "Pont",
                "lat": lat or 0,
                "lng": lng or 0,
                "status": new_status,
                "updated_at": ts,
                "source": "haropa",
            }
            await db.works.insert_one(doc)
            await log_history(target_id, nom, new_status, "haropa")
            updated += 1
            continue

        if existing.get("status") != new_status:
            await db.works.update_one(
                {"id": target_id},
                {"$set": {"status": new_status, "updated_at": ts, "source": "haropa"}},
            )
            await log_history(target_id, existing["name"], new_status, "haropa")
            updated += 1

    await db.meta.update_one(
        {"_id": "haropa_sync"},
        {"$set": {"_id": "haropa_sync", "last_sync": ts, "ok": True, "horo": payload.get("horo")}},
        upsert=True,
    )
    logger.info(f"HAROPA sync done. {updated} statuses changed (received {len(payload['data'])} items).")
    return {"ok": True, "updated": updated, "received": len(payload["data"]), "synced_at": ts}

# -------------------- Background scheduler --------------------
async def haropa_loop():
    await asyncio.sleep(5)
    while True:
        try:
            await sync_from_haropa()
        except Exception as e:
            logger.exception(f"sync loop error: {e}")
        await asyncio.sleep(300)  # 5 min

# -------------------- Routes --------------------
@api_router.get("/")
async def root():
    return {"app": "PortPassLH", "version": "1.0"}

# -------------------- Auth routes --------------------
@api_router.post("/auth/session")
async def auth_session(request: Request, response: Response):
    body = await request.json()
    sid = body.get("session_id")
    if not sid:
        raise HTTPException(status_code=400, detail="Missing session_id")
    try:
        r = requests.get(EMERGENT_SESSION_DATA_URL, headers={"X-Session-ID": sid}, timeout=15)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        logger.warning(f"Emergent session-data failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid session")

    email = (data.get("email") or "").lower()
    is_admin = email in ADMIN_EMAILS
    name = data.get("name") or email
    picture = data.get("picture") or ""
    session_token = data.get("session_token") or ""
    if not email or not session_token:
        raise HTTPException(status_code=401, detail="Invalid session payload")

    # Upsert user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture, "is_admin": is_admin}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": name, "picture": picture,
            "is_admin": is_admin, "created_at": now_iso(),
        })

    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token, "email": email,
        "expires_at": expires_at, "created_at": datetime.now(timezone.utc),
    })

    response.set_cookie(
        key="session_token", value=session_token, httponly=True, secure=True,
        samesite="none", path="/", max_age=7 * 24 * 3600,
    )
    return {"user_id": user_id, "email": email, "name": name, "picture": picture, "is_admin": is_admin, "session_token": session_token}

@api_router.get("/auth/me")
async def auth_me(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {
        "user_id": user["user_id"], "email": user["email"], "name": user.get("name"),
        "picture": user.get("picture"), "is_admin": bool(user.get("is_admin")),
    }

@api_router.post("/auth/logout")
async def auth_logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

@api_router.get("/works", response_model=List[Work])
async def list_works():
    docs = await db.works.find({}, {"_id": 0}).to_list(1000)
    # keep deterministic order following seed
    order = {w["id"]: i for i, w in enumerate(WORKS_SEED)}
    docs.sort(key=lambda d: order.get(d["id"], 999))
    return docs

@api_router.put("/works/{work_id}/status", response_model=Work)
async def update_status(work_id: str, payload: StatusUpdate, admin: dict = Depends(require_admin)):
    work = await db.works.find_one({"id": work_id}, {"_id": 0})
    if not work:
        raise HTTPException(status_code=404, detail="Work not found")
    ts = now_iso()
    await db.works.update_one(
        {"id": work_id},
        {"$set": {"status": payload.status, "updated_at": ts, "source": "manual"}},
    )
    await log_history(work_id, work["name"], payload.status, "manual")
    updated = await db.works.find_one({"id": work_id}, {"_id": 0})
    return updated

@api_router.post("/works/refresh")
async def manual_refresh(admin: dict = Depends(require_admin)):
    return await sync_from_haropa()

@api_router.get("/works/{work_id}/history", response_model=List[HistoryEntry])
async def work_history(work_id: str, limit: int = 50):
    cursor = db.status_history.find({"work_id": work_id}, {"_id": 0}).sort("changed_at", -1).limit(limit)
    return await cursor.to_list(limit)

@api_router.get("/history", response_model=List[HistoryEntry])
async def all_history(limit: int = 100):
    cursor = db.status_history.find({}, {"_id": 0}).sort("changed_at", -1).limit(limit)
    return await cursor.to_list(limit)

@api_router.get("/stats", response_model=GlobalStats)
async def stats():
    docs = await db.works.find({}, {"_id": 0}).to_list(1000)
    counts = {"ouvert": 0, "fermeture": 0, "bientot": 0, "ferme": 0}
    for d in docs:
        counts[d.get("status", "ouvert")] = counts.get(d.get("status", "ouvert"), 0) + 1
    yesterday = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    events_24h = await db.status_history.count_documents({"changed_at": {"$gte": yesterday}})
    meta = await db.meta.find_one({"_id": "haropa_sync"}, {"_id": 0})
    return GlobalStats(
        total_works=len(docs),
        open_count=counts["ouvert"],
        closing_count=counts["fermeture"],
        soon_count=counts["bientot"],
        closed_count=counts["ferme"],
        last_haropa_sync=(meta or {}).get("last_sync"),
        total_events_24h=events_24h,
    )

# -------------------- Wire app --------------------
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def on_startup():
    await seed_works()
    asyncio.create_task(haropa_loop())

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
