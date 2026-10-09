import re
import os
import uuid
from pymongo.errors import OperationFailure
import logging
import hashlib
import secrets
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import jwt
import bcrypt
import requests
from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, UploadFile, File, Header, Query, BackgroundTasks
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response as StarletteResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Config & DB
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("recroute39")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "none")
ALLOWED_ORIGINS = [FRONTEND_URL, "http://localhost:3000"]

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "recroute39"

STATUSES = ["New", "Contacted", "Interview", "Shortlisted", "Approval Pending", "Selected", "Rejected", "Joined"]
SOURCES = ["Naukri", "Indeed", "LinkedIn", "WhatsApp", "Referral", "Walk-in", "Other"]

MIME_TYPES = {
    "pdf": "application/pdf", "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "txt": "text/plain",
}

app = FastAPI()
api = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Object storage
# ---------------------------------------------------------------------------
storage_key = None

def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

def create_access_token(user_id: str, email: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "email": email, "ver": token_version, "exp": datetime.now(timezone.utc) + timedelta(minutes=15), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "ver": token_version, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=900, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=604800, path="/")

def public_user(u: dict) -> dict:
    return {"id": str(u["_id"]) if "_id" in u else u.get("id"), "email": u["email"], "name": u["name"], "role": u["role"], "avatar": u.get("avatar")}

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if payload.get("ver", 0) != user.get("token_version", 0):
            raise HTTPException(status_code=401, detail="Session expired")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_roles(*roles):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="You do not have permission for this action")
        return user
    return checker

# ---------------------------------------------------------------------------
# Activity logging
# ---------------------------------------------------------------------------
async def log_activity(user: dict, action: str, candidate_id: Optional[str] = None, candidate_name: Optional[str] = None, details: str = ""):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user.get("id"),
        "user_name": user.get("name"),
        "user_role": user.get("role"),
        "action": action,
        "candidate_id": candidate_id,
        "candidate_name": candidate_name,
        "details": details,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.activities.insert_one(doc)
    return doc

def now_iso():
    return datetime.now(timezone.utc).isoformat()

IST = timezone(timedelta(hours=5, minutes=30))

def ist_date_range_to_utc(date_from, date_to):
    """Convert 'YYYY-MM-DD' (interpreted as IST calendar day) to a UTC $gte/$lte range."""
    rng = {}
    if date_from:
        y, m, d = map(int, date_from.split("-"))
        start_ist = datetime(y, m, d, 0, 0, 0, tzinfo=IST)
        rng["$gte"] = start_ist.astimezone(timezone.utc).isoformat()
    if date_to:
        y, m, d = map(int, date_to.split("-"))
        end_ist = datetime(y, m, d, 23, 59, 59, 999999, tzinfo=IST)
        rng["$lte"] = end_ist.astimezone(timezone.utc).isoformat()
    return rng

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LoginBody(BaseModel):
    email: str
    password: str

class CreateUserBody(BaseModel):
    name: str
    email: str
    password: str
    role: str  # hr | management | admin
    phone: Optional[str] = ""

class UpdateUserBody(BaseModel):
    name: str
    email: str
    phone: Optional[str] = ""
    password: Optional[str] = None

class ForgotBody(BaseModel):
    email: str

class ResetBody(BaseModel):
    token: str
    password: str

class CandidateBody(BaseModel):
    name: str
    phone: str
    email: Optional[str] = ""
    designation: str
    city: Optional[str] = ""
    branch: Optional[str] = ""
    source: Optional[str] = "Other"
    current_salary: Optional[float] = None
    expected_salary: Optional[float] = None
    experience: Optional[str] = ""
    remarks: Optional[str] = ""
    relevant_job: Optional[str] = ""
    assigned_hr_id: Optional[str] = None
    job_id: Optional[str] = None
    # FIX: allows the "Added" date/time (created_at) to be edited from the
    # candidate profile page. Optional — normal edits from EditCandidateModal
    # don't send this, so existing created_at is preserved.
    created_at: Optional[str] = None

class UpdateBody(BaseModel):
    text: str

class StatusBody(BaseModel):
    status: str
    interview_type: Optional[str] = None

class SendApprovalBody(BaseModel):
    recommended_salary: Optional[float] = None
    hr_remark: Optional[str] = ""

class DecisionBody(BaseModel):
    decision: str  # Approve | Reject | Send Back
    comment: Optional[str] = ""

class JobBody(BaseModel):
    branch: Optional[str] = ""
    designation: str
    city: Optional[str] = ""
    vacancies: int = 1
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    experience: Optional[str] = ""
    assigned_hr_id: Optional[str] = None
    status: str = "Active"

# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
async def check_lockout(ip: str, email: str):
    since = datetime.now(timezone.utc) - timedelta(minutes=15)
    count = await db.login_attempts.count_documents({"identifier": f"{ip}:{email}", "at": {"$gt": since.isoformat()}})
    if count >= 5:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")

@api.post("/auth/login")
async def login(body: LoginBody, request: Request, response: Response):
    email = body.email.strip().lower()
    ip = request.client.host if request.client else "unknown"
    await check_lockout(ip, email)
    user = await db.users.find_one({"$or": [{"email": email}, {"phone": email}]})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.insert_one({"identifier": f"{ip}:{email}", "email": email, "at": now_iso()})
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_many({"identifier": f"{ip}:{email}"})
    ver = user.get("token_version", 0)
    set_auth_cookies(response, create_access_token(user["id"], email, ver), create_refresh_token(user["id"], ver))
    return public_user(user)

@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)

@api.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user or payload.get("ver", 0) != user.get("token_version", 0):
            raise HTTPException(status_code=401, detail="Session expired")
        set_auth_cookies(response, create_access_token(user["id"], user["email"], user.get("token_version", 0)), token)
        return public_user(user)
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def send_password_reset_email(to_email: str, token: str) -> bool:
    from html import escape
    from urllib.parse import urlparse
    base = FRONTEND_URL.rstrip("/")
    link = f"{base}/reset-password?token={token}"
    key = os.environ.get("EMERGENT_EMAIL_KEY", "")
    if not key or key.startswith("{") or not base.startswith("https://"):
        if urlparse(base).hostname in ("localhost", "127.0.0.1", "::1"):
            logger.warning("Email not configured; reset link: %s", link)
        else:
            logger.error("Reset email not configured")
        return False
    brand = escape(os.environ.get("EMAIL_FROM_NAME", "RecRoute39"))
    html = (f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial">'
            f'<p>We received a request to reset your {brand} password.</p>'
            f'<p><a href="{escape(link)}">Reset your password</a></p>'
            f'<p>This link expires in 1 hour and can be used once.</p></td></tr></table>')
    base_url = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip().rstrip("/") or "https://integrations.emergentagent.com"
    try:
        resp = requests.post(f"{base_url}/api/v1/email/send", headers={"X-Email-Key": key},
                             json={"to": [to_email], "subject": f"Reset your {brand} password", "html": html, "from_name": brand}, timeout=30)
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Reset email failed: {e}")
        return False

@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotBody, background_tasks: BackgroundTasks):
    email = body.email.strip().lower()
    generic = {"message": "If that email is registered, a reset link has been sent."}
    await db.password_reset_requests.insert_one({"email": email, "created_at": now_iso()})
    since = datetime.now(timezone.utc) - timedelta(minutes=15)
    if await db.password_reset_requests.count_documents({"email": email, "created_at": {"$gt": since.isoformat()}}) > 5:
        return generic
    user = await db.users.find_one({"email": email})
    if not user:
        return generic
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "token_hash": hashlib.sha256(token.encode()).hexdigest(), "user_id": user["id"], "email": email,
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(), "used": False})
    background_tasks.add_task(send_password_reset_email, user["email"], token)
    return generic

@api.post("/auth/reset-password")
async def reset_password(body: ResetBody):
    h = hashlib.sha256(body.token.encode()).hexdigest()
    doc = await db.password_reset_tokens.find_one_and_update(
        {"token_hash": h, "used": False, "expires_at": {"$gt": now_iso()}}, {"$set": {"used": True}})
    if not doc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    await db.users.update_one({"id": doc["user_id"]}, {"$set": {"password_hash": hash_password(body.password)}, "$inc": {"token_version": 1}})
    await db.password_reset_tokens.delete_many({"user_id": doc["user_id"], "used": False})
    await db.login_attempts.delete_many({"email": doc["email"]})
    return {"message": "Password reset successful"}

# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------
class HRMessageBody(BaseModel):
    message: str


@api.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0, "token_version": 0}).to_list(500)
    return users

@api.post("/users")
async def create_user(body: CreateUserBody, user: dict = Depends(require_roles("admin"))):
    email = body.email.strip().lower()
    if body.role not in ("hr", "management", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="A user with this email already exists")
    doc = {"id": str(uuid.uuid4()), "email": email, "name": body.name, "role": body.role,
           "phone": (body.phone or "").strip(),
           "password_hash": hash_password(body.password), "token_version": 0, "avatar": None, "created_at": now_iso()}
    await db.users.insert_one(doc)
    return public_user(doc)


@api.put("/users/{uid}")
async def update_user(
    uid: str,
    body: UpdateUserBody,
    user: dict = Depends(require_roles("admin")),
):
    target = await db.users.find_one({"id": uid})

    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.get("role") != "hr":
        raise HTTPException(status_code=400, detail="Only HR users can be edited here")

    name = body.name.strip()
    email = body.email.strip().lower()
    phone = (body.phone or "").strip()

    if not name or not email:
        raise HTTPException(status_code=400, detail="Name and email are required")

    duplicate = await db.users.find_one({
        "email": email,
        "id": {"$ne": uid},
    })

    if duplicate:
        raise HTTPException(
            status_code=409,
            detail="A user with this email already exists",
        )

    updates = {
        "name": name,
        "email": email,
        "phone": phone,
    }

    if body.password and body.password.strip():
        updates["password_hash"] = hash_password(body.password)
        updates["token_version"] = target.get("token_version", 0) + 1

    await db.users.update_one(
        {"id": uid},
        {"$set": updates},
    )

    await log_activity(
        user,
        "HR Updated",
        details=f"HR account updated: {name}",
    )

    updated = dict(target)
    updated.update(updates)

    return public_user(updated)


@api.delete("/users/{uid}")
async def delete_user(
    uid: str,
    user: dict = Depends(require_roles("admin")),
):
    target = await db.users.find_one({"id": uid})

    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.get("role") != "hr":
        raise HTTPException(status_code=400, detail="Only HR users can be deleted here")

    assigned_count = await db.candidates.count_documents({
        "assigned_hr_id": uid
    })

    if assigned_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete this HR. {assigned_count} candidate(s) are currently assigned to this HR.",
        )

    await db.users.delete_one({"id": uid})

    await log_activity(
        user,
        "HR Deleted",
        details=f"HR account deleted: {target.get('name', '')}",
    )

    return {"message": "HR deleted successfully"}

# ---------------------------------------------------------------------------
# Candidate serialization
# ---------------------------------------------------------------------------
def clean_candidate(c: dict) -> dict:
    c.pop("_id", None)
    return c

def compute_status_at(d: dict, status: str):
    # "Send Back" -> when that decision was made (approval.decision_at).
    # Any real status -> the most recent status_history entry matching it.
    if status == "Send Back":
        appr = d.get("approval")
        if appr and appr.get("decision") == "Send Back":
            return appr.get("decision_at")
        return None
    matches = [h for h in d.get("status_history", []) if h.get("status") == status]
    return matches[-1]["at"] if matches else None

def candidate_summary(c: dict) -> dict:
    return {
        "id": c["id"], "onboarding_sent": c.get("onboarding_sent", False), "interview_type": c.get("interview_type"), "name": c["name"], "phone": c["phone"], "email": c.get("email", ""), "designation": c["designation"],
        "city": c.get("city", ""), "source": c.get("source", ""), "expected_salary": c.get("expected_salary"),
        "current_salary": c.get("current_salary"), "status": c["status"],
        "assigned_hr_name": c.get("assigned_hr_name"), "updated_at": c.get("updated_at"),
        "has_resume": bool(c.get("resume")),
    }

# ---------------------------------------------------------------------------
# Candidates
# ---------------------------------------------------------------------------
async def find_by_phone(phone: str, exclude_id: str = None):
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) < 10:
        q = {"phone": (phone or "").strip()}
    else:
        last10 = digits[-10:]
        q = {"phone": {"$regex": r"\D*".join(last10) + r"\D*$"}}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    return await db.candidates.find_one(q)

@api.get("/candidates/check-duplicate")
async def check_duplicate(phone: str = Query(...), user: dict = Depends(get_current_user)):
    phone = phone.strip()
    existing = await find_by_phone(phone)
    if existing:
        return {"exists": True, "candidate": candidate_summary(clean_candidate(existing))}
    return {"exists": False}

@api.get("/candidates")
async def list_candidates(
    search: Optional[str] = None, designation: Optional[str] = None, city: Optional[str] = None,
    hr: Optional[str] = None, source: Optional[str] = None, status: Optional[str] = None,
    date_from: Optional[str] = None, date_to: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q = {}
    if search:
        q["$or"] = [{"name": {"$regex": search, "$options": "i"}}, {"phone": {"$regex": search, "$options": "i"}}]
    if designation and designation != "all":
        q["designation"] = designation
    if city and city != "all":
        q["city"] = city
    if hr and hr != "all":
        q["assigned_hr_id"] = hr
    if source and source != "all":
        q["source"] = source
    if status and status != "all":
        # FIX: "Send Back" isn't a real status (candidates go back to "Shortlisted"
        # after being sent back) — it's tracked via approval.decision instead.
        if status == "RNR":
            q["updates.text"] = {"$regex": r"\brnr\b", "$options": "i"}
        elif status == "Send Back":
            q["approval.decision"] = "Send Back"
        else:
            q["status"] = status
    if date_from or date_to:
        q["updated_at"] = ist_date_range_to_utc(date_from, date_to)
    docs = await db.candidates.find(q).sort("updated_at", -1).to_list(1000)
    result = []
    for d in docs:
        s = candidate_summary(clean_candidate(d))
        # FIX: when the list is filtered by a specific status (e.g. from a
        # dashboard box click), attach the exact date/time that candidate
        # reached THAT status — not the generic "last updated" timestamp —
        # so the frontend can show an absolute date instead of "Xm ago".
        if status and status != "all":
            s["status_at"] = compute_status_at(d, status)
        result.append(s)
    return result

@api.get("/candidates/filters")
async def candidate_filters(user: dict = Depends(get_current_user)):
    designations = await db.candidates.distinct("designation")
    cities = await db.candidates.distinct("city")
    hrs = await db.users.find({"role": "hr"}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    return {"designations": [d for d in designations if d], "cities": [c for c in cities if c],
            "hrs": hrs, "sources": SOURCES, "statuses": STATUSES}

@api.post("/candidates")
async def create_candidate(body: CandidateBody, user: dict = Depends(require_roles("hr", "admin"))):
    phone = body.phone.strip()
    existing = await find_by_phone(phone)
    if existing:
        raise HTTPException(status_code=409, detail={"message": "Candidate already exists", "candidate": candidate_summary(clean_candidate(existing))})
    hr_id = body.assigned_hr_id or user["id"]
    hr_user = await db.users.find_one({"id": hr_id})
    hr_name = hr_user["name"] if hr_user else user["name"]
    ts = now_iso()
    doc = {
        "id": str(uuid.uuid4()), "name": body.name.strip(), "phone": phone, "email": (body.email or "").strip(), "designation": body.designation.strip(),
        "city": (body.city or "").strip(), "branch": getattr(body, "branch", "") or "", "source": body.source or "Other",
        "current_salary": body.current_salary, "expected_salary": body.expected_salary,
        "experience": body.experience or "", "status": "New",
        "assigned_hr_id": hr_id, "assigned_hr_name": hr_name, "job_id": body.job_id, "relevant_job": getattr(body, "relevant_job", "") or "",
        "resume": None, "updates": [], "approval": None,
        "status_history": [{"status": "New", "by_id": user["id"], "by_name": user["name"], "at": ts}],
        "created_by": user["id"], "created_by_name": user["name"], "created_at": ts, "updated_at": ts,
    }
    if body.remarks:
        doc["updates"].append({"id": str(uuid.uuid4()), "hr_id": user["id"], "hr_name": user["name"], "text": body.remarks, "created_at": ts})
    await db.candidates.insert_one(dict(doc))
    await log_activity(user, "Candidate added", doc["id"], doc["name"], f"Source: {doc['source']}")
    return candidate_summary(doc)

@api.get("/candidates/{cid}")
async def get_candidate(cid: str, user: dict = Depends(get_current_user)):
    c = await db.candidates.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return clean_candidate(c)

@api.delete("/candidates/{cid}")
async def delete_candidate(cid: str, user: dict = Depends(require_roles("hr", "admin"))):
    c = await db.candidates.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    try:
        async for f in onboard_fs.find({"metadata.candidate_id": cid}):
            await onboard_fs.delete(f._id)
    except Exception:
        pass
    await db.onboarding.delete_many({"candidate_id": cid})
    await db.candidates.delete_one({"id": cid})
    await log_activity(user, "Candidate deleted", None, c["name"], c.get("designation", ""))
    return {"ok": True}

@api.put("/candidates/{cid}")
async def update_candidate(cid: str, body: CandidateBody, user: dict = Depends(require_roles("hr", "admin"))):
    c = await db.candidates.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    hr_id = body.assigned_hr_id or c.get("assigned_hr_id")
    hr_user = await db.users.find_one({"id": hr_id})
    updates = {
        "name": body.name.strip(), "phone": body.phone.strip(), "email": (body.email or "").strip(), "designation": body.designation.strip(),
        "city": (body.city or "").strip(), "branch": getattr(body, "branch", None) or c.get("branch", ""), "source": body.source or c.get("source"),
        "current_salary": body.current_salary, "expected_salary": body.expected_salary,
        "experience": body.experience or "", "assigned_hr_id": hr_id,
        "assigned_hr_name": hr_user["name"] if hr_user else c.get("assigned_hr_name"),
        "job_id": body.job_id, "relevant_job": getattr(body, "relevant_job", None) or c.get("relevant_job", ""), "updated_at": now_iso(),
        # FIX: only overwrite created_at ("Added") when the client explicitly sent one
        # (from the new "Added" date/time editor). Otherwise keep the original.
        "created_at": body.created_at or c.get("created_at"),
    }
    await db.candidates.update_one({"id": cid}, {"$set": updates})
    await log_activity(user, "Candidate edited", cid, body.name.strip())
    c.update(updates)
    return clean_candidate(c)

@api.post("/candidates/{cid}/resume")
async def upload_resume(cid: str, file: UploadFile = File(...), user: dict = Depends(require_roles("hr", "admin"))):
    c = await db.candidates.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    path = f"{APP_NAME}/resumes/{cid}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    ctype = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
    result = put_object(path, data, ctype)
    resume = {"storage_path": result["path"], "original_filename": file.filename, "content_type": ctype, "size": result.get("size", len(data)), "uploaded_at": now_iso()}
    await db.candidates.update_one({"id": cid}, {"$set": {"resume": resume, "updated_at": now_iso()}})
    await log_activity(user, "Resume uploaded", cid, c["name"], file.filename)
    return resume

@api.get("/candidates/{cid}/resume")
async def download_resume(request: Request, cid: str, authorization: str = Header(None), auth: str = Query(None)):
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif auth:
        token = auth
    else:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    c = await db.candidates.find_one({"id": cid})
    if not c or not c.get("resume"):
        raise HTTPException(status_code=404, detail="Resume not found")
    data, ctype = get_object(c["resume"]["storage_path"])
    fname = c["resume"]["original_filename"]
    return StarletteResponse(content=data, media_type=c["resume"].get("content_type", ctype),
                             headers={"Content-Disposition": f'inline; filename="{fname}"'})

@api.post("/candidates/{cid}/updates")
async def add_update(cid: str, body: UpdateBody, user: dict = Depends(require_roles("hr", "admin"))):
    c = await db.candidates.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    entry = {"id": str(uuid.uuid4()), "hr_id": user["id"], "hr_name": user["name"], "text": body.text, "created_at": now_iso()}
    await db.candidates.update_one({"id": cid}, {"$push": {"updates": entry}, "$set": {"updated_at": now_iso()}})
    await log_activity(user, "HR update added", cid, c["name"], body.text[:80])
    return entry

@api.put("/candidates/{cid}/status")
async def change_status(cid: str, body: StatusBody, user: dict = Depends(require_roles("hr", "admin"))):
    if body.status not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    c = await db.candidates.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    ts = now_iso()
    old_status = c.get("status")
    job_id = c.get("job_id")
    if body.status == "Joined" and old_status != "Joined":
        import re
        br = (c.get("branch") or "").strip()
        names = [n.strip() for n in [c.get("relevant_job"), c.get("designation")] if n and n.strip()]
        job = None
        for n in names:
            base = {"designation": {"$regex": rf"^\s*{re.escape(n)}\s*$", "$options": "i"}}
            tries = []
            if br:
                bq = {"$regex": rf"^\s*{re.escape(br)}\s*$", "$options": "i"}
                tries.append({**base, "$or": [{"branch": bq}, {"city": bq}]})
            tries.append(base)
            for q in tries:
                job = await db.jobs.find_one(q, sort=[("created_at", -1)])
                if job: break
            if job: break
        if True:
            if job:
                job_id = job["id"]
                await db.candidates.update_one({"id": cid}, {"$set": {"job_id": job_id}})
    if body.status == "Joined" and old_status != "Joined" and job_id:
        jdoc = await db.jobs.find_one({"id": job_id})
        if jdoc and jdoc.get("status", "Active") != "Active":
            raise HTTPException(status_code=400, detail=f"Cannot mark as Joined. Job is {jdoc.get('status')}, only Active jobs accept joins.")
        if jdoc and (jdoc.get("vacancies") or 0) <= 0:
            raise HTTPException(status_code=400, detail="Cannot mark as Joined. No vacancies left for this job.")
    entry = {"status": body.status, "by_id": user["id"], "by_name": user["name"], "at": ts}
    await db.candidates.update_one({"id": cid}, {"$set": {"status": body.status, "interview_type": body.interview_type if body.status == "Interview" else None, "updated_at": ts}, "$push": {"status_history": entry}})
    # FIX: keep the linked job's open vacancy count in sync with "Joined" status.
    # Moving INTO "Joined" -> one less open vacancy (never below 0).
    # Moving OUT of "Joined" -> give that vacancy back.
    if job_id and old_status != body.status:
        if body.status == "Joined" and old_status != "Joined":
            await db.jobs.update_one({"id": job_id, "status": "Active", "vacancies": {"$gt": 0}}, {"$inc": {"vacancies": -1}})
        elif old_status == "Joined" and body.status != "Joined":
            await db.jobs.update_one({"id": job_id, "status": "Active"}, {"$inc": {"vacancies": 1}})
    action = "Interview updated" if body.status == "Interview" else "Status changed"
    await log_activity(user, action, cid, c["name"], f"→ {body.status}")
    return {"status": body.status, "history": entry}

@api.post("/candidates/{cid}/send-approval")
async def send_for_approval(cid: str, body: SendApprovalBody, user: dict = Depends(require_roles("hr", "admin"))):
    c = await db.candidates.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    ts = now_iso()
    approval = {"sent": True, "recommended_salary": body.recommended_salary, "hr_remark": body.hr_remark,
                "sent_by": user["id"], "sent_by_name": user["name"], "sent_at": ts,
                "decision": None, "decision_comment": None, "decision_by_name": None, "decision_at": None}
    hist = {"status": "Approval Pending", "by_id": user["id"], "by_name": user["name"], "at": ts}
    await db.candidates.update_one({"id": cid}, {"$set": {"approval": approval, "status": "Approval Pending", "updated_at": ts}, "$push": {"status_history": hist}})
    await log_activity(user, "Candidate sent for approval", cid, c["name"], body.hr_remark[:80] if body.hr_remark else "")
    return approval

@api.post("/candidates/{cid}/decision")
async def management_decision(cid: str, body: DecisionBody, user: dict = Depends(require_roles("management", "admin"))):
    if body.decision not in ("Approve", "Reject", "Send Back"):
        raise HTTPException(status_code=400, detail="Invalid decision")
    c = await db.candidates.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if not c.get("approval"):
        raise HTTPException(status_code=400, detail="Candidate is not pending approval")
    ts = now_iso()
    new_status = {"Approve": "Selected", "Reject": "Rejected", "Send Back": "Shortlisted"}[body.decision]
    approval = c["approval"]
    approval.update({"decision": body.decision, "decision_comment": body.comment, "decision_by": user["id"],
                     "decision_by_name": user["name"], "decision_at": ts})
    hist = {"status": new_status, "by_id": user["id"], "by_name": user["name"], "at": ts}
    await db.candidates.update_one({"id": cid}, {"$set": {"approval": approval, "status": new_status, "updated_at": ts}, "$push": {"status_history": hist}})
    action = {"Approve": "Candidate approved", "Reject": "Candidate rejected", "Send Back": "Candidate sent back"}[body.decision]
    await log_activity(user, action, cid, c["name"], body.comment[:80] if body.comment else "")
    return {"status": new_status, "approval": approval}

# ---------------------------------------------------------------------------
# Approvals queue
# ---------------------------------------------------------------------------
@api.get("/approvals")
async def approvals(user: dict = Depends(get_current_user)):
    docs = await db.candidates.find({"status": "Approval Pending"}).sort("updated_at", -1).to_list(500)
    result = []
    for d in docs:
        s = candidate_summary(clean_candidate(d))
        s["approval"] = d.get("approval")
        s["experience"] = d.get("experience")
        result.append(s)
    return result

# ---------------------------------------------------------------------------
# HR -> Admin Notifications
# ---------------------------------------------------------------------------
@api.get("/notifications")
async def get_notifications(user: dict = Depends(require_roles("admin"))):
    docs = await db.notifications.find(
        {"recipient_role": "admin"},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)

    uid = user["id"]
    result = []

    for doc in docs:
        item = dict(doc)
        item["read"] = uid in item.get("read_by", [])
        result.append(item)

    unread = sum(1 for item in result if not item["read"])

    return {
        "notifications": result,
        "unread": unread,
    }


@api.post("/notifications/hr-message")
async def send_hr_message(
    body: HRMessageBody,
    user: dict = Depends(require_roles("hr", "admin")),
):
    message = body.message.strip()

    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    if len(message) > 1000:
        raise HTTPException(status_code=400, detail="Message cannot exceed 1000 characters")

    doc = {
        "id": str(uuid.uuid4()),
        "type": "hr_message",
        "sender_id": user["id"],
        "sender_name": user["name"],
        "sender_role": "hr",
        "recipient_role": "admin",
        "message": message,
        "created_at": now_iso(),
        "read_by": [],
    }

    await db.notifications.insert_one(doc)

    return {
        "message": "Notification sent to Admin",
        "notification": {k: v for k, v in doc.items() if k != "_id"},
    }


@api.put("/notifications/{nid}/read")
async def mark_notification_read(
    nid: str,
    user: dict = Depends(require_roles("admin")),
):
    result = await db.notifications.update_one(
        {
            "id": nid,
            "recipient_role": "admin",
        },
        {
            "$addToSet": {
                "read_by": user["id"]
            }
        },
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")

    return {"message": "Notification marked as read"}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@api.get("/dashboard/recent_updates")
async def recent_hr_updates(limit: int = 10, user: dict = Depends(get_current_user)):
    match = {"updates.0": {"$exists": True}}
    if user.get("role") == "hr":
        match["assigned_hr_id"] = user["id"]
    pipeline = [
        {"$match": match},
        {"$unwind": "$updates"},
        {"$sort": {"updates.created_at": -1}},
        {"$limit": max(1, min(limit, 50))},
        {"$project": {"_id": 0, "id": "$updates.id", "text": "$updates.text",
                      "hr_name": "$updates.hr_name", "created_at": "$updates.created_at",
                      "candidate_id": "$id", "candidate_name": "$name", "status": "$status"}},
    ]
    return await db.candidates.aggregate(pipeline).to_list(50)

@api.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    total = await db.candidates.count_documents({})
    counts = {}
    for s in STATUSES:
        counts[s] = await db.candidates.count_documents({"status": s})
    # FIX: "Send Back" is an approval decision, not a status, so it's counted
    # separately and added to the same counts dict the frontend reads from.
    counts["Send Back"] = await db.candidates.count_documents({"approval.decision": "Send Back"})
    pending = await db.candidates.find({"status": "Approval Pending"}).sort("updated_at", -1).to_list(20)
    pending_list = []
    for d in pending:
        s = candidate_summary(clean_candidate(d))
        s["approval"] = d.get("approval")
        pending_list.append(s)
    activities = await db.activities.find({}, {"_id": 0}).sort("created_at", -1).to_list(15)
    counts["RNR"] = await db.candidates.count_documents({"updates.text": {"$regex": r"\brnr\b", "$options": "i"}})
    return {"total": total, "counts": counts, "pending_approvals": pending_list, "recent_activity": activities}

# ---------------------------------------------------------------------------
# HR Monitoring
# ---------------------------------------------------------------------------
@api.get("/monitoring/hr")
async def hr_monitoring(user: dict = Depends(require_roles("admin", "management"))):
    hrs = await db.users.find({"role": "hr"}, {"_id": 0, "password_hash": 0, "token_version": 0}).to_list(200)
    result = []
    for hr in hrs:
        hid = hr["id"]
        added = await db.candidates.count_documents({"assigned_hr_id": hid})
        contacted = await db.candidates.count_documents({"assigned_hr_id": hid, "status_history.status": "Contacted"})
        interviewed = await db.candidates.count_documents({"assigned_hr_id": hid, "status_history.status": "Interview"})
        shortlisted = await db.candidates.count_documents({"assigned_hr_id": hid, "status_history.status": "Shortlisted"})
        sent = await db.candidates.count_documents({"assigned_hr_id": hid, "status_history.status": "Approval Pending"})
        selected = await db.candidates.count_documents({"assigned_hr_id": hid, "status": "Selected"})
        joined = await db.candidates.count_documents({"assigned_hr_id": hid, "status": "Joined"})
        rejected = await db.candidates.count_documents({"assigned_hr_id": hid, "status": "Rejected"})
        result.append({"hr": {"id": hid, "name": hr["name"], "email": hr["email"], "avatar": hr.get("avatar"), "created_at": hr.get("created_at")},
                       "added": added, "contacted": contacted, "interviewed": interviewed, "shortlisted": shortlisted,
                       "sent_for_approval": sent, "selected": selected, "joined": joined, "rejected": rejected})
    recent = await db.activities.find({}, {"_id": 0}).sort("created_at", -1).to_list(25)
    return {"hrs": result, "recent": recent}

# ---------------------------------------------------------------------------
# Activity Log
# ---------------------------------------------------------------------------
@api.get("/activities")
async def get_activities(limit: int = 100, date_from: Optional[str] = None, date_to: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if date_from or date_to:
        q["created_at"] = ist_date_range_to_utc(date_from, date_to)
    return await db.activities.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)

# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------
@api.get("/jobs")
async def list_jobs(user: dict = Depends(get_current_user)):
    return await db.jobs.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)

@api.post("/jobs")
async def create_job(body: JobBody, user: dict = Depends(require_roles("admin", "management"))):
    hr_user = await db.users.find_one({"id": body.assigned_hr_id}) if body.assigned_hr_id else None
    doc = {"id": str(uuid.uuid4()), "designation": body.designation.strip(), "city": (body.city or "").strip(), "branch": (body.branch or "").strip(),
           "vacancies": 0 if body.status == "Closed" else body.vacancies, "salary_min": body.salary_min, "salary_max": body.salary_max,
           "experience": body.experience or "", "assigned_hr_id": body.assigned_hr_id,
           "assigned_hr_name": hr_user["name"] if hr_user else None, "status": body.status,
           "created_by": user["id"], "created_at": now_iso()}
    await db.jobs.insert_one(dict(doc))
    await log_activity(user, "Job created", None, None, doc["designation"])
    doc.pop("_id", None)
    return doc

@api.put("/jobs/{jid}")
async def update_job(jid: str, body: JobBody, user: dict = Depends(require_roles("admin", "management"))):
    j = await db.jobs.find_one({"id": jid})
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")
    hr_user = await db.users.find_one({"id": body.assigned_hr_id}) if body.assigned_hr_id else None
    updates = {"designation": body.designation.strip(), "city": (body.city or "").strip(), "branch": (body.branch or "").strip(), "vacancies": 0 if body.status == "Closed" else body.vacancies,
               "salary_min": body.salary_min, "salary_max": body.salary_max, "experience": body.experience or "",
               "assigned_hr_id": body.assigned_hr_id, "assigned_hr_name": hr_user["name"] if hr_user else None, "status": body.status}
    await db.jobs.update_one({"id": jid}, {"$set": updates})
    j.update(updates)
    j.pop("_id", None)
    return j

@api.delete("/jobs/{jid}")
async def delete_job(jid: str, user: dict = Depends(require_roles("admin", "management"))):
    j = await db.jobs.find_one({"id": jid})
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")
    linked = await db.candidates.count_documents({"job_id": jid})
    if linked > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete. {linked} candidate(s) are linked to this job.")
    await db.jobs.delete_one({"id": jid})
    await log_activity(user, "Job deleted", None, None, j["designation"])
    return {"deleted": True}

@api.get("/meta")
async def meta(user: dict = Depends(get_current_user)):
    return {"statuses": STATUSES, "sources": SOURCES}

# ---------------------------------------------------------------------------
# App wiring
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Onboarding (public link for Joined candidates)
# ---------------------------------------------------------------------------
import secrets as _secrets
from urllib.parse import quote as _quote
from fastapi import UploadFile, File
from fastapi.responses import Response as _RawResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

onboard_fs = AsyncIOMotorGridFSBucket(db, bucket_name="onboarding_files")
PROOF_TYPES = ["aadhaar", "pan", "passbook", "bank_statement", "payslip1", "payslip2", "payslip3"]
REQUIRED_PROOFS = ["aadhaar", "pan", "passbook"]
PAYSLIP_TYPES = ["payslip1", "payslip2", "payslip3"]
MAX_UPLOAD = 10 * 1024 * 1024
_UPLOAD_CT = ("application/pdf", "application/zip", "application/x-zip-compressed", "application/x-zip", "multipart/x-zip")
_EXT_CT = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
           ".heic": "image/heic", ".heif": "image/heif", ".pdf": "application/pdf", ".zip": "application/zip"}

def _upload_ct(file):
    ct = (file.content_type or "").lower()
    if ct.startswith("image/") or ct == "application/pdf":
        return ct
    if ct in _UPLOAD_CT:
        return "application/zip"
    name = (file.filename or "").lower()
    for ext, mapped in _EXT_CT.items():
        if name.endswith(ext):
            return mapped
    return "application/octet-stream"

def _ok_upload(file):
    return _upload_ct(file) != "application/octet-stream"

class OnboardingSubmit(BaseModel):
    name: str
    contact: str
    whatsapp: str
    email: Optional[str] = ""
    emergency_contact: str
    location: str = ""
    emergency_relationship: Optional[str] = ""

    experience: str = ""
    experience_years: Optional[str] = ""
    experience_months: Optional[str] = "0"
    proofs: dict = {}

def _check_onboarding(body):
    exp = (body.experience or "").strip()
    if exp not in ("Fresher", "Experienced"):
        raise HTTPException(status_code=400, detail="Please select your experience (Fresher / Experienced)")
    proofs = body.proofs or {}
    for p in REQUIRED_PROOFS:
        v = proofs.get(p) or {}
        if not v.get("file_id") and not (v.get("reason") or "").strip():
            raise HTTPException(status_code=400, detail=f"{p.title()}: upload a photo or give a reason")
    if exp == "Experienced":
        try:
            yrs = float(body.experience_years or 0)
        except ValueError:
            yrs = 0
        months = int(body.experience_months or 0)
        if months < 0 or months > 11:
            raise HTTPException(status_code=400, detail="Enter valid months of experience")

        if yrs <= 0 or yrs > 60:
            raise HTTPException(status_code=400, detail="Enter your years of experience")
        for i, p in enumerate(PAYSLIP_TYPES, 1):
            if not (proofs.get(p) or {}).get("file_id"):
                raise HTTPException(status_code=400, detail=f"Upload your last 3 months payslips (payslip {i} of 3 is missing)")
    else:
        body.experience_years = ""
        body.experience_months = "0"
        body.proofs = {k: v for k, v in proofs.items() if k not in PAYSLIP_TYPES}

def _wa_number(phone):
    d = "".join(ch for ch in (phone or "") if ch.isdigit())
    return "91" + d if len(d) == 10 else d

async def _open_onboarding(token):
    ob = await db.onboarding.find_one({"token": token})
    if not ob:
        raise HTTPException(status_code=404, detail="Invalid link")
    if ob["status"] == "submitted":
        raise HTTPException(status_code=410, detail="This form has already been submitted")
    return ob

@api.post("/candidates/{cid}/onboarding-link")
async def create_onboarding_link(cid: str, user: dict = Depends(require_roles("hr", "admin"))):
    c = await db.candidates.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if c.get("status") != "Joined":
        raise HTTPException(status_code=400, detail="Onboarding link is only for Joined candidates")
    ob = await db.onboarding.find_one({"candidate_id": cid, "status": "sent"})
    token = ob["token"] if ob else _secrets.token_urlsafe(24)
    if not ob:
        await db.onboarding.insert_one({"id": str(uuid.uuid4()), "token": token, "candidate_id": cid,
            "candidate_name": c["name"], "status": "sent", "created_by": user["id"],
            "created_at": now_iso(), "answers": None, "submitted_at": None})
    await db.candidates.update_one({"id": cid}, {"$set": {"onboarding_sent": True}})
    link = f"{FRONTEND_URL.rstrip('/')}/onboard/{token}"
    msg = f"Hi {c['name']}, welcome to Route39! Please complete your joining details here: {link}"
    await log_activity(user, "Onboarding link sent", cid, c["name"], "")
    return {"link": link, "whatsapp_url": f"https://wa.me/{_wa_number(c.get('phone'))}?text={_quote(msg)}"}

@api.get("/public/onboarding/{token}")
async def public_onboarding(token: str):
    ob = await _open_onboarding(token)
    c = await db.candidates.find_one({"id": ob["candidate_id"]}) or {}
    return {"name": c.get("name", ""), "contact": c.get("phone", ""), "email": c.get("email", "")}

@api.post("/public/onboarding/{token}/upload")
async def public_onboarding_upload(token: str, proof: str, file: UploadFile = File(...)):
    ob = await _open_onboarding(token)
    if proof not in PROOF_TYPES:
        raise HTTPException(status_code=400, detail="Invalid proof type")
    if not _ok_upload(file):
        raise HTTPException(status_code=400, detail="Only images, PDF or ZIP files are allowed")
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=400, detail="File must be under 10 MB")
    fid = await onboard_fs.upload_from_stream(file.filename or f"{proof}.jpg", data,
        metadata={"candidate_id": ob["candidate_id"], "proof": proof, "content_type": _upload_ct(file)})
    return {"file_id": str(fid)}

@api.post("/public/onboarding/{token}/submit")
async def public_onboarding_submit(token: str, body: OnboardingSubmit):
    ob = await _open_onboarding(token)
    _check_onboarding(body)
    await db.onboarding.update_one({"id": ob["id"]}, {"$set": {"answers": body.model_dump(), "status": "submitted", "submitted_at": now_iso()}})
    return {"ok": True}

# ---- Common (token-less) onboarding link: one link for every candidate ----
from collections import defaultdict as _dd, deque as _dq
import time as _time
_open_hits = _dd(_dq)

def _rate_limit(request: Request, bucket: str, limit: int, window: int = 3600):
    fwd = request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")
    ip = fwd.split(",")[0].strip()
    q = _open_hits[(bucket, ip)]
    now = _time.time()
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status_code=429, detail="Too many attempts. Please try again after some time.")
    q.append(now)

def _last10(v):
    return "".join(ch for ch in (v or "") if ch.isdigit())[-10:]

@api.get("/public/onboarding-open")
async def public_onboarding_open():
    return {"open": True}

@api.post("/public/onboarding-open/upload")
async def public_onboarding_open_upload(request: Request, proof: str, file: UploadFile = File(...)):
    _rate_limit(request, "open-upload", 120)
    if proof not in PROOF_TYPES:
        raise HTTPException(status_code=400, detail="Invalid proof type")
    if not _ok_upload(file):
        raise HTTPException(status_code=400, detail="Only images, PDF or ZIP files are allowed")
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=400, detail="File must be under 10 MB")
    fid = await onboard_fs.upload_from_stream(file.filename or f"{proof}.jpg", data,
        metadata={"candidate_id": None, "proof": proof, "content_type": _upload_ct(file), "via": "common_link"})
    return {"file_id": str(fid)}

@api.post("/public/onboarding-open/submit")
async def public_onboarding_open_submit(request: Request, body: OnboardingSubmit):
    _rate_limit(request, "open-submit", 30)
    _check_onboarding(body)
    nums = {_last10(body.contact), _last10(body.whatsapp)} - {""}
    cands = await db.candidates.find({}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(10000)
    match = next((c for c in cands if _last10(c.get("phone")) in nums), None)
    cid = match["id"] if match else None
    now = now_iso()
    if cid:
        if await db.onboarding.find_one({"candidate_id": cid, "status": "submitted"}):
            raise HTTPException(status_code=409, detail="Your details are already submitted. Please contact Route39 HR to make changes.")
        pending = await db.onboarding.find_one({"candidate_id": cid, "status": "sent"})
        if pending:
            await db.onboarding.update_one({"id": pending["id"]}, {"$set": {"answers": body.model_dump(), "status": "submitted", "submitted_at": now}})
            await log_activity({"name": "Candidate (common link)", "role": "candidate"}, "Onboarding form submitted", cid, match.get("name"), "")
            return {"ok": True}
        await db.candidates.update_one({"id": cid}, {"$set": {"onboarding_sent": True}})
    name = (match or {}).get("name") or body.name.strip()
    await db.onboarding.insert_one({"id": str(uuid.uuid4()), "token": _secrets.token_urlsafe(24), "candidate_id": cid,
        "candidate_name": name, "status": "submitted", "created_by": None, "created_at": now,
        "answers": body.model_dump(), "submitted_at": now, "source": "common_link"})
    await log_activity({"name": "Candidate (common link)", "role": "candidate"}, "Onboarding form submitted", cid, name, "")
    return {"ok": True}

@api.get("/onboarding")
async def list_onboarding(user: dict = Depends(require_roles("hr", "admin", "management"))):
    return await db.onboarding.find({}, {"_id": 0, "token": 0}).sort("created_at", -1).to_list(500)

@api.post("/onboarding/{oid}/upload")
async def hr_onboarding_upload(oid: str, proof: str, file: UploadFile = File(...), user: dict = Depends(require_roles("hr", "admin"))):
    """Lets HR/Admin upload a proof photo on the candidate's behalf — e.g. when the
    candidate marked a document "Not available" and later shared it outside the app
    (WhatsApp, email, in person) instead of through the onboarding form."""
    ob = await db.onboarding.find_one({"id": oid})
    if not ob:
        raise HTTPException(status_code=404, detail="Onboarding record not found")
    if ob.get("status") != "submitted":
        raise HTTPException(status_code=400, detail="Candidate hasn't submitted onboarding details yet")
    if proof not in PROOF_TYPES:
        raise HTTPException(status_code=400, detail="Invalid proof type")
    if not _ok_upload(file):
        raise HTTPException(status_code=400, detail="Only images, PDF or ZIP files are allowed")
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=400, detail="File must be under 10 MB")
    fid = await onboard_fs.upload_from_stream(file.filename or f"{proof}.jpg", data,
        metadata={"candidate_id": ob["candidate_id"], "proof": proof, "content_type": _upload_ct(file), "uploaded_by": user["id"]})
    await db.onboarding.update_one({"id": oid}, {"$set": {f"answers.proofs.{proof}": {"file_id": str(fid)}}})
    await log_activity(user, "Onboarding proof uploaded", ob["candidate_id"], ob.get("candidate_name"), proof.title())
    return {"file_id": str(fid)}

@api.get("/onboarding/files/{fid}")
async def get_onboarding_file(fid: str, user: dict = Depends(require_roles("hr", "admin", "management"))):
    from bson import ObjectId
    try:
        stream = await onboard_fs.open_download_stream(ObjectId(fid))
        data = await stream.read()
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return _RawResponse(content=data, media_type=(stream.metadata or {}).get("content_type", "image/jpeg"))

@api.delete("/onboarding/{oid}")
async def delete_onboarding(oid: str, user: dict = Depends(require_roles("hr", "admin"))):
    from bson import ObjectId
    ob = await db.onboarding.find_one({"id": oid})
    if not ob:
        raise HTTPException(status_code=404, detail="Onboarding record not found")
    for v in (((ob.get("answers") or {}).get("proofs")) or {}).values():
        fid = (v or {}).get("file_id")
        if fid:
            try:
                await onboard_fs.delete(ObjectId(fid))
            except Exception:
                pass
    await db.onboarding.delete_one({"id": oid})
    cid = ob.get("candidate_id")
    if cid and not await db.onboarding.find_one({"candidate_id": cid}):
        await db.candidates.update_one({"id": cid}, {"$set": {"onboarding_sent": False}})
    await log_activity(user, "Onboarding deleted", cid, ob.get("candidate_name"), "")
    return {"ok": True}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------
AVATARS = [
    "https://images.unsplash.com/photo-1649123245135-4db6ead931b5?crop=entropy&cs=srgb&fm=jpg&q=85&w=200",
    "https://images.unsplash.com/photo-1725131481715-f0aa4357665d?crop=entropy&cs=srgb&fm=jpg&q=85&w=200",
    "https://images.unsplash.com/photo-1740252117013-4fb21771e7ca?crop=entropy&cs=srgb&fm=jpg&q=85&w=200",
    "https://images.unsplash.com/photo-1740252117044-2af197eea287?crop=entropy&cs=srgb&fm=jpg&q=85&w=200",
]

async def ensure_user(email, name, role, password, avatar=None):
    existing = await db.users.find_one({"email": email})
    if existing:
        if not existing.get("id"):
            await db.users.update_one({"email": email}, {"$set": {"id": str(uuid.uuid4())}})
            existing = await db.users.find_one({"email": email})
        return existing
    doc = {"id": str(uuid.uuid4()), "email": email, "name": name, "role": role,
           "password_hash": hash_password(password), "token_version": 0, "avatar": avatar, "created_at": now_iso()}
    await db.users.insert_one(doc)
    return doc

async def ensure_index(collection, field, **kwargs):
    # FIX: this cluster is shared with other deployments that sometimes
    # (re)create indexes on the same field with different options (e.g. a
    # stray "sparse" flag on the "email" index). Instead of crashing app
    # startup on IndexKeySpecsConflict (code 86), drop the conflicting index
    # and recreate it with the options this app actually needs.
    try:
        await collection.create_index(field, **kwargs)
    except OperationFailure as e:
        if getattr(e, "code", None) == 86:
            index_name = field if isinstance(field, str) else "_".join(f"{k}_{v}" for k, v in field)
            await collection.drop_index(f"{index_name}_1" if isinstance(field, str) else index_name)
            await collection.create_index(field, **kwargs)
        else:
            raise

async def seed():
    await ensure_index(db.users, "email", unique=True)
    await ensure_index(db.users, "id")
    await ensure_index(db.candidates, "phone")
    await ensure_index(db.candidates, "id", unique=True)
    await ensure_index(db.login_attempts, "email")
    await ensure_index(db.login_attempts, "identifier")
    await ensure_index(db.password_reset_tokens, "token_hash", unique=True)

    admin = await ensure_user(os.environ.get("ADMIN_EMAIL", "support@route39.in"), "Route39 Admin", "admin", os.environ.get("ADMIN_PASSWORD", "Admin@123"))
    # keep admin password in sync
    if not verify_password(os.environ.get("ADMIN_PASSWORD", "Admin@123"), admin["password_hash"]):
        await db.users.update_one({"id": admin["id"]}, {"$set": {"password_hash": hash_password(os.environ.get("ADMIN_PASSWORD", "Admin@123"))}})

    priya = await ensure_user("priya@route39.in", "Priya Sharma", "hr", "Hr@123", AVATARS[0])
    rahul = await ensure_user("rahul@route39.in", "Rahul Verma", "hr", "Hr@123", AVATARS[1])
    sneha = await ensure_user("sneha@route39.in", "Sneha Iyer", "hr", "Hr@123", AVATARS[2])
    mgmt = await ensure_user("management@route39.in", "Vikram Nair", "management", "Manager@123", AVATARS[3])

    if await db.candidates.count_documents({}) > 0:
        return

    hrs = [priya, rahul, sneha]
    import random
    random.seed(39)
    first = ["Amit", "Neha", "Karan", "Divya", "Rohan", "Pooja", "Arjun", "Meera", "Sahil", "Ananya", "Vishal", "Kavya", "Manish", "Ritika", "Gaurav", "Shreya", "Nikhil", "Tara"]
    last = ["Kumar", "Singh", "Reddy", "Gupta", "Mehta", "Joshi", "Das", "Rao", "Patel", "Chopra", "Bose", "Nair"]
    desigs = ["Sales Executive", "Telecaller", "Field Sales Officer", "Customer Support", "Team Lead", "Branch Manager", "Accountant", "HR Executive"]
    cities = ["Mumbai", "Pune", "Bengaluru", "Delhi", "Hyderabad", "Chennai", "Ahmedabad"]
    notes = ["Called candidate. Interested. Available to join in 15 days.", "Left voicemail, will follow up tomorrow.",
             "Interview completed. Strong communication skills.", "Negotiating salary. Expects a bit higher.",
             "Good candidate, culture fit looks great.", "Shared JD, awaiting confirmation."]

    candidates = []
    for i in range(16):
        hr = random.choice(hrs)
        name = f"{random.choice(first)} {random.choice(last)}"
        status = random.choice(["New", "Contacted", "Interview", "Shortlisted", "Approval Pending", "Selected", "Rejected", "Joined"])
        ts = (datetime.now(timezone.utc) - timedelta(days=random.randint(0, 20), hours=random.randint(0, 20))).isoformat()
        cur = random.choice([18000, 22000, 25000, 30000, 35000, 40000])
        exp = cur + random.choice([5000, 8000, 10000])
        cand = {
            "id": str(uuid.uuid4()), "name": name, "phone": f"9{random.randint(100000000, 999999999)}",
            "designation": random.choice(desigs), "city": random.choice(cities), "source": random.choice(SOURCES),
            "current_salary": cur, "expected_salary": exp, "experience": f"{random.randint(1, 8)} years",
            "status": status, "assigned_hr_id": hr["id"], "assigned_hr_name": hr["name"], "job_id": None,
            "resume": None, "created_by": hr["id"], "created_by_name": hr["name"], "created_at": ts, "updated_at": ts,
        }
        upds = []
        for _ in range(random.randint(1, 3)):
            uts = (datetime.now(timezone.utc) - timedelta(days=random.randint(0, 15))).isoformat()
            upds.append({"id": str(uuid.uuid4()), "hr_id": hr["id"], "hr_name": hr["name"], "text": random.choice(notes), "created_at": uts})
        cand["updates"] = upds
        cand["status_history"] = [{"status": "New", "by_id": hr["id"], "by_name": hr["name"], "at": ts}]
        if status == "Approval Pending":
            cand["approval"] = {"sent": True, "recommended_salary": exp, "hr_remark": "Highly recommended, meets all criteria.",
                                "sent_by": hr["id"], "sent_by_name": hr["name"], "sent_at": ts,
                                "decision": None, "decision_comment": None, "decision_by_name": None, "decision_at": None}
        else:
            cand["approval"] = None
        candidates.append(cand)
        await db.candidates.insert_one(dict(cand))
        await log_activity(hr, "Candidate added", cand["id"], cand["name"], f"Source: {cand['source']}")

    jobs = [
        ("Sales Executive", "Mumbai", 5, 240000, 420000, "1-3 years", priya),
        ("Telecaller", "Pune", 8, 180000, 300000, "0-2 years", rahul),
        ("Branch Manager", "Bengaluru", 2, 600000, 900000, "5-8 years", sneha),
        ("Field Sales Officer", "Delhi", 6, 300000, 480000, "2-4 years", priya),
        ("Accountant", "Hyderabad", 1, 360000, 540000, "3-5 years", rahul),
    ]
    for d, city, vac, smin, smax, exp, hr in jobs:
        await db.jobs.insert_one({"id": str(uuid.uuid4()), "designation": d, "city": city, "vacancies": vac,
                                  "salary_min": smin, "salary_max": smax, "experience": exp, "assigned_hr_id": hr["id"],
                                  "assigned_hr_name": hr["name"], "status": "Active", "created_by": admin["id"], "created_at": now_iso()})

@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    await seed()
    logger.info("Seed complete")

@app.on_event("shutdown")
async def shutdown():
    client.close()
