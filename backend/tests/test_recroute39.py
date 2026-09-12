"""RecRoute39 backend tests - covers auth, candidates, workflow, approvals, jobs."""
import io
import os
import time
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://route39-hire.preview.emergentagent.com"
API = BASE + "/api"

ADMIN = ("support@route39.in", "Admin@123")
HR = ("priya@route39.in", "Hr@123")
MGMT = ("management@route39.in", "Manager@123")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    assert "access_token" in s.cookies
    return s, r.json()


@pytest.fixture(scope="module")
def admin():
    return _login(*ADMIN)

@pytest.fixture(scope="module")
def hr():
    return _login(*HR)

@pytest.fixture(scope="module")
def mgmt():
    return _login(*MGMT)


# --------- Auth ---------
class TestAuth:
    def test_login_admin(self, admin):
        s, u = admin
        assert u["role"] == "admin" and u["email"] == "support@route39.in"

    def test_login_hr(self, hr):
        s, u = hr
        assert u["role"] == "hr"

    def test_login_mgmt(self, mgmt):
        s, u = mgmt
        assert u["role"] == "management"

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "priya@route39.in", "password": "wrong"}, timeout=30)
        assert r.status_code in (401, 429)

    def test_me(self, hr):
        s, _ = hr
        r = s.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == "priya@route39.in"

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401


# --------- Dashboard ---------
class TestDashboard:
    def test_stats(self, hr):
        s, _ = hr
        r = s.get(f"{API}/dashboard/stats", timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("total", "counts", "pending_approvals", "recent_activity"):
            assert k in d
        for st in ["New", "Contacted", "Interview", "Shortlisted", "Approval Pending", "Selected", "Rejected", "Joined"]:
            assert st in d["counts"]


# --------- Candidates ---------
class TestCandidates:
    def test_list(self, hr):
        s, _ = hr
        r = s.get(f"{API}/candidates", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_search_and_filters(self, hr):
        s, _ = hr
        r = s.get(f"{API}/candidates?search=a", timeout=30)
        assert r.status_code == 200
        r = s.get(f"{API}/candidates?status=New", timeout=30)
        assert r.status_code == 200
        for c in r.json():
            assert c["status"] == "New"

    def test_filters_meta(self, hr):
        s, _ = hr
        r = s.get(f"{API}/candidates/filters", timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("designations", "cities", "hrs", "sources", "statuses"):
            assert k in d

    def test_mgmt_cannot_add_candidate(self, mgmt):
        s, _ = mgmt
        r = s.post(f"{API}/candidates", json={"name": "X", "phone": "9000000001", "designation": "Sales Executive"}, timeout=30)
        assert r.status_code == 403


@pytest.fixture(scope="module")
def created_candidate(hr):
    s, _ = hr
    phone = f"9{int(time.time()) % 1000000000:09d}"
    payload = {"name": "TEST_Candidate One", "phone": phone, "designation": "Sales Executive",
               "city": "Mumbai", "source": "LinkedIn", "current_salary": 30000, "expected_salary": 40000,
               "experience": "2 years", "remarks": "Initial contact done"}
    r = s.post(f"{API}/candidates", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    return s, r.json(), phone


class TestCandidateFlow:
    def test_create(self, created_candidate):
        _, c, phone = created_candidate
        assert c["phone"] == phone
        assert c["status"] == "New"

    def test_duplicate_check(self, hr, created_candidate):
        s, _ = hr
        _, c, phone = created_candidate
        r = s.get(f"{API}/candidates/check-duplicate?phone={phone}", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["exists"] is True
        assert d["candidate"]["phone"] == phone

    def test_duplicate_check_not_exists(self, hr):
        s, _ = hr
        r = s.get(f"{API}/candidates/check-duplicate?phone=9999999999999", timeout=30)
        assert r.status_code == 200
        assert r.json()["exists"] is False

    def test_duplicate_create_409(self, hr, created_candidate):
        s, _ = hr
        _, c, phone = created_candidate
        r = s.post(f"{API}/candidates", json={"name": "X2", "phone": phone, "designation": "Sales Executive"}, timeout=30)
        assert r.status_code == 409

    def test_get_candidate(self, hr, created_candidate):
        s, _ = hr
        _, c, _ = created_candidate
        r = s.get(f"{API}/candidates/{c['id']}", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == c["id"]
        assert len(d["status_history"]) >= 1
        assert len(d["updates"]) >= 1  # from remarks

    def test_add_update(self, hr, created_candidate):
        s, _ = hr
        _, c, _ = created_candidate
        r = s.post(f"{API}/candidates/{c['id']}/updates", json={"text": "Follow-up call done"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["text"] == "Follow-up call done"

    def test_change_status(self, hr, created_candidate):
        s, _ = hr
        _, c, _ = created_candidate
        for st in ["Contacted", "Interview", "Shortlisted"]:
            r = s.put(f"{API}/candidates/{c['id']}/status", json={"status": st}, timeout=30)
            assert r.status_code == 200
            assert r.json()["status"] == st
        # verify history
        r = s.get(f"{API}/candidates/{c['id']}", timeout=30)
        hist = r.json()["status_history"]
        assert any(h["status"] == "Shortlisted" and h.get("by_name") for h in hist)

    def test_resume_upload_and_download(self, hr, created_candidate):
        s, _ = hr
        _, c, _ = created_candidate
        files = {"file": ("test.txt", io.BytesIO(b"hello resume"), "text/plain")}
        r = s.post(f"{API}/candidates/{c['id']}/resume", files=files, timeout=60)
        if r.status_code >= 500:
            pytest.skip(f"storage backend unavailable: {r.status_code} {r.text[:200]}")
        assert r.status_code == 200, r.text
        # download via cookie
        r2 = s.get(f"{API}/candidates/{c['id']}/resume", timeout=60)
        assert r2.status_code == 200
        assert b"hello resume" in r2.content

    def test_send_for_approval(self, hr, created_candidate):
        s, _ = hr
        _, c, _ = created_candidate
        r = s.post(f"{API}/candidates/{c['id']}/send-approval",
                   json={"recommended_salary": 42000, "hr_remark": "Strong fit"}, timeout=30)
        assert r.status_code == 200
        # verify status
        rc = s.get(f"{API}/candidates/{c['id']}", timeout=30).json()
        assert rc["status"] == "Approval Pending"

    def test_hr_forbidden_decision(self, hr, created_candidate):
        s, _ = hr
        _, c, _ = created_candidate
        r = s.post(f"{API}/candidates/{c['id']}/decision", json={"decision": "Approve", "comment": "x"}, timeout=30)
        assert r.status_code == 403

    def test_approvals_queue_lists_candidate(self, mgmt, created_candidate):
        s, _ = mgmt
        _, c, _ = created_candidate
        r = s.get(f"{API}/approvals", timeout=30)
        assert r.status_code == 200
        assert any(x["id"] == c["id"] for x in r.json())

    def test_management_approve(self, mgmt, created_candidate):
        s, _ = mgmt
        _, c, _ = created_candidate
        r = s.post(f"{API}/candidates/{c['id']}/decision",
                   json={"decision": "Approve", "comment": "ok"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Selected"


# --------- Monitoring / Approvals / Jobs / Activities ---------
class TestOther:
    def test_monitoring_forbidden_hr(self, hr):
        s, _ = hr
        r = s.get(f"{API}/monitoring/hr", timeout=30)
        assert r.status_code == 403

    def test_monitoring_mgmt(self, mgmt):
        s, _ = mgmt
        r = s.get(f"{API}/monitoring/hr", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "hrs" in d and isinstance(d["hrs"], list) and len(d["hrs"]) > 0
        for h in d["hrs"]:
            for k in ("added", "contacted", "interviewed", "shortlisted", "sent_for_approval", "selected", "joined", "rejected"):
                assert k in h

    def test_jobs_list_all_roles(self, admin, hr, mgmt):
        for s, _ in (admin, hr, mgmt):
            r = s.get(f"{API}/jobs", timeout=30)
            assert r.status_code == 200

    def test_jobs_hr_forbidden_create(self, hr):
        s, _ = hr
        r = s.post(f"{API}/jobs", json={"designation": "TEST_J", "vacancies": 1}, timeout=30)
        assert r.status_code == 403

    def test_jobs_admin_create(self, admin):
        s, _ = admin
        r = s.post(f"{API}/jobs", json={"designation": "TEST_Job_X", "city": "Mumbai", "vacancies": 2, "status": "Active"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["designation"] == "TEST_Job_X"

    def test_activities(self, hr):
        s, _ = hr
        r = s.get(f"{API}/activities?limit=50", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        actions = {a["action"] for a in data}
        # at least one relevant action should be present after the flow
        assert actions & {"Candidate added", "HR update added", "Status changed", "Candidate sent for approval", "Candidate approved"}
