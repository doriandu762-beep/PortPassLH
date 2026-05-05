import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback: read frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# Works listing
def test_list_works_returns_13(s):
    r = s.get(f"{API}/works", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 13
    for w in data:
        assert "id" in w and "name" in w and "lat" in w and "lng" in w
        assert w["status"] in ["ouvert", "fermeture", "bientot", "ferme"]


# Status update + history
def test_update_status_and_history(s):
    target = "pont-7"
    r = s.put(f"{API}/works/{target}/status", json={"status": "ferme"}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == target
    assert body["status"] == "ferme"
    assert body["source"] == "manual"

    # GET to verify persistence
    r2 = s.get(f"{API}/works", timeout=15)
    found = next(w for w in r2.json() if w["id"] == target)
    assert found["status"] == "ferme"

    # History for work
    h = s.get(f"{API}/works/{target}/history", timeout=15)
    assert h.status_code == 200
    hist = h.json()
    assert len(hist) >= 1
    assert hist[0]["work_id"] == target
    assert hist[0]["source"] == "manual"
    assert hist[0]["status"] == "ferme"

    # restore
    s.put(f"{API}/works/{target}/status", json={"status": "ouvert"}, timeout=15)


def test_update_unknown_returns_404(s):
    r = s.put(f"{API}/works/does-not-exist/status", json={"status": "ferme"}, timeout=15)
    assert r.status_code == 404


def test_update_invalid_status_422(s):
    r = s.put(f"{API}/works/pont-7/status", json={"status": "invalid"}, timeout=15)
    assert r.status_code == 422


# Global history
def test_global_history(s):
    r = s.get(f"{API}/history", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    if len(data) >= 2:
        assert data[0]["changed_at"] >= data[1]["changed_at"]


# Stats
def test_stats(s):
    r = s.get(f"{API}/stats", timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ["total_works", "open_count", "closing_count", "soon_count", "closed_count", "total_events_24h"]:
        assert k in d
    assert d["total_works"] == 13
    assert "last_haropa_sync" in d


# HAROPA refresh graceful failure
def test_refresh_graceful(s):
    r = s.post(f"{API}/works/refresh", timeout=30)
    assert r.status_code == 200
    d = r.json()
    # URL is 404 -> ok=False, fetch_failed, updated=0
    assert d.get("ok") is False
    assert d.get("reason") == "fetch_failed"
    assert d.get("updated") == 0
