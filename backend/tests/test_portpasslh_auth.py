"""Auth-gated tests for PortPassLH after Emergent Google Auth integration.

Seeds admin/non-admin user+session via Mongo directly (Google OAuth not automatable).
Covers public endpoints + Bearer-token gated mutations.
"""
import os
import subprocess
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break
API = f"{BASE_URL}/api"
DB_NAME = os.environ.get("DB_NAME", "test_database")

# ---------- mongosh helpers to create sessions ----------
def _mongosh(js: str) -> str:
    out = subprocess.run(
        ["mongosh", "--quiet", "--eval", f"use('{DB_NAME}'); {js}"],
        capture_output=True, text=True, timeout=20,
    )
    return (out.stdout or "") + (out.stderr or "")


def _seed_session(email: str, is_admin: bool) -> str:
    token = f"TEST_{uuid.uuid4().hex}"
    user_id = f"TEST_user_{uuid.uuid4().hex[:8]}"
    js = (
        f'db.users.insertOne({{user_id:"{user_id}", email:"{email.lower()}", '
        f'name:"Test {email}", picture:"", is_admin:{str(is_admin).lower()}, '
        f'created_at:new Date().toISOString()}}); '
        f'db.user_sessions.insertOne({{user_id:"{user_id}", session_token:"{token}", '
        f'email:"{email.lower()}", expires_at:new Date(Date.now()+7*864e5), '
        f'created_at:new Date()}});'
    )
    _mongosh(js)
    return token, user_id


@pytest.fixture(scope="module")
def admin_token():
    token, uid = _seed_session("mrxxdoxdoxx@gmail.com", True)
    yield token
    _mongosh(f'db.user_sessions.deleteOne({{session_token:"{token}"}}); '
             f'db.users.deleteOne({{user_id:"{uid}"}});')


@pytest.fixture(scope="module")
def user_token():
    token, uid = _seed_session("regular@example.com", False)
    yield token
    _mongosh(f'db.user_sessions.deleteOne({{session_token:"{token}"}}); '
             f'db.users.deleteOne({{user_id:"{uid}"}});')


# ===================== Auth endpoints =====================
class TestAuthEndpoints:
    def test_me_without_token_returns_401(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_with_admin_token(self, admin_token):
        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == "mrxxdoxdoxx@gmail.com"
        assert d["is_admin"] is True

    def test_me_with_user_token(self, user_token):
        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {user_token}"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["is_admin"] is False

    def test_session_missing_id_returns_400(self):
        r = requests.post(f"{API}/auth/session", json={}, timeout=15)
        assert r.status_code == 400

    def test_session_invalid_id_returns_401(self):
        r = requests.post(f"{API}/auth/session",
                          json={"session_id": "obviously-bogus-xyz"}, timeout=20)
        assert r.status_code == 401

    def test_logout_deletes_session(self):
        # create dedicated session, logout, /me must 401
        token, uid = _seed_session("temp_logout@example.com", False)
        r = requests.post(f"{API}/auth/logout",
                          headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True
        r2 = requests.get(f"{API}/auth/me",
                          headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert r2.status_code == 401
        _mongosh(f'db.users.deleteOne({{user_id:"{uid}"}});')


# ===================== Public reads =====================
class TestPublicReads:
    def test_list_works_public(self):
        r = requests.get(f"{API}/works", timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 13

    def test_history_public(self):
        r = requests.get(f"{API}/history", timeout=15)
        assert r.status_code == 200

    def test_stats_public(self):
        r = requests.get(f"{API}/stats", timeout=15)
        assert r.status_code == 200
        assert r.json()["total_works"] >= 13


# ===================== Mutations gating =====================
class TestStatusUpdateAuth:
    target = "pont-7"

    def test_update_without_token_401(self):
        r = requests.put(f"{API}/works/{self.target}/status",
                         json={"status": "ferme"}, timeout=15)
        assert r.status_code == 401

    def test_update_with_non_admin_403(self, user_token):
        r = requests.put(f"{API}/works/{self.target}/status",
                         json={"status": "ferme"},
                         headers={"Authorization": f"Bearer {user_token}"}, timeout=15)
        assert r.status_code == 403

    def test_update_with_admin_200_and_history(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.put(f"{API}/works/{self.target}/status",
                         json={"status": "ferme"}, headers=h, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == self.target
        assert body["status"] == "ferme"
        assert body["source"] == "manual"

        # verify persistence via GET
        all_works = requests.get(f"{API}/works", timeout=15).json()
        assert next(w for w in all_works if w["id"] == self.target)["status"] == "ferme"

        # history entry source=manual
        hist = requests.get(f"{API}/works/{self.target}/history", timeout=15).json()
        assert hist[0]["source"] == "manual"
        assert hist[0]["status"] == "ferme"

        # restore
        requests.put(f"{API}/works/{self.target}/status",
                     json={"status": "ouvert"}, headers=h, timeout=15)

    def test_update_unknown_returns_404(self, admin_token):
        r = requests.put(f"{API}/works/does-not-exist/status",
                         json={"status": "ferme"},
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 404

    def test_update_invalid_status_422(self, admin_token):
        r = requests.put(f"{API}/works/{self.target}/status",
                         json={"status": "invalid"},
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 422


class TestRefreshHaropa:
    def test_refresh_without_token_401(self):
        r = requests.post(f"{API}/works/refresh", timeout=30)
        assert r.status_code == 401

    def test_refresh_with_non_admin_403(self, user_token):
        r = requests.post(f"{API}/works/refresh",
                          headers={"Authorization": f"Bearer {user_token}"}, timeout=30)
        assert r.status_code == 403

    def test_refresh_with_admin_200(self, admin_token):
        r = requests.post(f"{API}/works/refresh",
                          headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        # ok depends on HAROPA upstream availability; both shapes acceptable
        assert "ok" in d
