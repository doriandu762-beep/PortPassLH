from fastapi import FastAPI, APIRouter, HTTPException
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
from bs4 import BeautifulSoup

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="PortPassLH API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("portpasslh")

# -------------------- Static reference data --------------------
WORKS_SEED = [
    {"id": "pont-hode", "name": "Pont du Hode", "type": "Pont", "lat": 49.4778763311, "lng": 0.3540242849},
    {"id": "pont-rouge", "name": "Pont Rouge", "type": "Pont", "lat": 49.4878672124, "lng": 0.1858056049},
    {"id": "pont-7", "name": "Pont 7 – Pont VII", "type": "Pont", "lat": 49.4929444816, "lng": 0.1804632758},
    {"id": "pont-6", "name": "Pont 6", "type": "Pont", "lat": 49.4877340502, "lng": 0.1630858485},
    {"id": "pont-8", "name": "Pont 8", "type": "Pont", "lat": 49.4978789626, "lng": 0.2017334067},
    {"id": "pont-7bis", "name": "Pont 7 bis", "type": "Pont", "lat": 49.4974491119, "lng": 0.1969694927},
    {"id": "pont-5", "name": "Pont 5", "type": "Pont", "lat": 49.4846344572, "lng": 0.1519573561},
    {"id": "ecluse-francois-1er", "name": "Écluse François 1er", "type": "Écluse", "lat": 49.4764589409, "lng": 0.1752220875},
    {"id": "pont-quinette", "name": "Pont Quinette", "type": "Pont", "lat": 49.4829841586, "lng": 0.1165466441},
    {"id": "pont-aval-vetillart", "name": "Pont aval Vétillart", "type": "Pont", "lat": 49.4806782677, "lng": 0.1382003157},
    {"id": "pont-amont-vetillart", "name": "Pont Amont Vétillart", "type": "Pont", "lat": 49.4813056152, "lng": 0.1407028168},
    {"id": "pont-aval-ecluse-francois-1er", "name": "Pont aval Écluse François 1er", "type": "Pont", "lat": 49.4752104323, "lng": 0.1698498695},
    {"id": "pont-amont-ecluse-francois-1er", "name": "Pont amont Écluse François 1er", "type": "Pont", "lat": 49.476613847, "lng": 0.1751423069},
]

HAROPA_URL = "https://www.haropaport.com/fr/actualites/port-actu/etat-des-ouvrages-portuaires"
StatusType = Literal["ouvert", "fermeture", "bientot", "ferme"]

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

# -------------------- HAROPA Scraper --------------------
def score_match(name: str, text: str) -> int:
    n = normalize(name); t = normalize(text)
    if not n or not t:
        return 0
    return sum(1 for p in n.split() if p and p in t)

def extract_status_for_work(work_name: str, text_norm: str) -> Optional[str]:
    candidates = [work_name, work_name.replace("É", "E"), work_name.replace("é", "e"), work_name.replace("–", " "), work_name.replace("’", " ")]
    best = sorted(candidates, key=lambda c: -score_match(c, text_norm))[0]
    key = normalize(best)
    idx = text_norm.find(key)
    if idx < 0:
        return None
    chunk = text_norm[max(0, idx - 120): idx + 220]
    if "fermeture imminente" in chunk:
        return "fermeture"
    if "bientot ouvert aux vehicules" in chunk:
        return "bientot"
    if "ferme" in chunk and "ouvert aux vehicules" not in chunk:
        return "ferme"
    if "ouvert aux vehicules" in chunk:
        return "ouvert"
    return None

def fetch_haropa_html() -> Optional[str]:
    try:
        r = requests.get(HAROPA_URL, timeout=15, headers={"User-Agent": "Mozilla/5.0 PortPassLH/1.0"})
        r.raise_for_status()
        return r.text
    except Exception as e:
        logger.warning(f"HAROPA fetch failed: {e}")
        return None

async def sync_from_haropa() -> dict:
    html = fetch_haropa_html()
    if not html:
        return {"ok": False, "reason": "fetch_failed", "updated": 0}
    soup = BeautifulSoup(html, "lxml")
    body_text = soup.get_text(separator=" ", strip=True)
    text_norm = normalize(body_text)

    cursor = db.works.find({}, {"_id": 0})
    works = await cursor.to_list(1000)
    updated = 0
    ts = now_iso()
    for w in works:
        new_status = extract_status_for_work(w["name"], text_norm)
        if new_status and new_status != w.get("status"):
            await db.works.update_one(
                {"id": w["id"]},
                {"$set": {"status": new_status, "updated_at": ts, "source": "haropa"}},
            )
            await log_history(w["id"], w["name"], new_status, "haropa")
            updated += 1
    await db.meta.update_one(
        {"_id": "haropa_sync"},
        {"$set": {"_id": "haropa_sync", "last_sync": ts, "ok": True}},
        upsert=True,
    )
    logger.info(f"HAROPA sync done. {updated} statuses changed.")
    return {"ok": True, "updated": updated, "synced_at": ts}

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

@api_router.get("/works", response_model=List[Work])
async def list_works():
    docs = await db.works.find({}, {"_id": 0}).to_list(1000)
    # keep deterministic order following seed
    order = {w["id"]: i for i, w in enumerate(WORKS_SEED)}
    docs.sort(key=lambda d: order.get(d["id"], 999))
    return docs

@api_router.put("/works/{work_id}/status", response_model=Work)
async def update_status(work_id: str, payload: StatusUpdate):
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
async def manual_refresh():
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
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
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
