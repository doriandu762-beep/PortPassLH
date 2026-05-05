"""
Smoke tests for the EXTERNAL PortPassLH backend that the mobile app consumes.
The local /app/backend is a placeholder; these tests hit the public deployed
backend referenced by EXPO_PUBLIC_PORTPASS_BACKEND_URL.
"""
import os
import re
import pytest
import requests

# Read URL from frontend .env (mobile app source-of-truth)
def _read_backend_url() -> str:
    env_path = "/app/frontend/.env"
    with open(env_path, "r", encoding="utf-8") as fh:
        for line in fh:
            m = re.match(r"^EXPO_PUBLIC_PORTPASS_BACKEND_URL=(.+)$", line.strip())
            if m:
                return m.group(1).strip().strip('"').rstrip("/")
    raise RuntimeError("EXPO_PUBLIC_PORTPASS_BACKEND_URL missing from frontend/.env")

BASE_URL = _read_backend_url()

@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Accept": "application/json"})
    return s


# -- Public read endpoints -------------------------------------------------
class TestPublicEndpoints:
    def test_works_returns_200_and_list(self, client):
        r = client.get(f"{BASE_URL}/api/works", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0
        sample = data[0]
        for k in ("id", "name", "type", "lat", "lng", "status", "updated_at", "source"):
            assert k in sample, f"missing key {k}"
        assert isinstance(sample["lat"], (int, float))
        assert isinstance(sample["lng"], (int, float))

    def test_stats_returns_200_and_shape(self, client):
        r = client.get(f"{BASE_URL}/api/stats", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in (
            "total_works", "open_count", "closing_count", "soon_count",
            "closed_count", "total_events_24h", "last_haropa_sync",
        ):
            assert k in d, f"missing key {k}"
        assert d["total_works"] == (
            d["open_count"] + d["closing_count"] + d["soon_count"] + d["closed_count"]
        )

    def test_history_returns_200_and_list_with_limit(self, client):
        r = client.get(f"{BASE_URL}/api/history?limit=5", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) <= 5
        if data:
            for k in ("id", "work_id", "work_name", "status", "source", "changed_at"):
                assert k in data[0], f"missing key {k}"


# -- Auth gating -----------------------------------------------------------
class TestAuthGating:
    def test_me_requires_token(self, client):
        r = client.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_me_with_bogus_token_rejected(self, client):
        r = client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": "Bearer not-a-real-token"},
            timeout=15,
        )
        assert r.status_code in (401, 403), r.text

    def test_session_exchange_rejects_bogus_session_id(self, client):
        r = client.post(
            f"{BASE_URL}/api/auth/session",
            json={"session_id": "TEST_invalid_session_id"},
            timeout=15,
        )
        # Backend should refuse — anything in 4xx is acceptable
        assert 400 <= r.status_code < 500, r.text
