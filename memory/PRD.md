# RecRoute39 — Product Requirements & Build Log

## Original Problem Statement
Internal recruitment ATS for Route39 (tagline: Recruit • Track • Hire). HR manually enters candidates
from Naukri/Indeed/LinkedIn/WhatsApp/Referral/Walk-in/Other. No public job portal or candidate login.
Flow: Add Candidate → Upload Resume → Update → Interview → Shortlist → Send for Approval → Select/Reject.

## Architecture
- Backend: FastAPI + MongoDB (motor), all routes under `/api`. Single file `server.py`.
- Frontend: React (CRA + craco), react-router, Tailwind + shadcn/ui, sonner toasts, lucide icons.
- Auth: JWT httpOnly cookies (SameSite=None), bcrypt hashing, role gating (require_roles).
- Storage: Emergent object storage for resumes (soft-delete pattern, DB is source of truth).
- Currency: INR (₹).

## Roles / Personas
- HR — add & manage candidates, upload resumes, add updates, change status, send for approval.
- Management — view candidates, approve/reject/send-back from Approvals queue, HR Monitoring.
- Admin — full access; can preview HR/Management views via header role switcher.

## Seeded Accounts (see /app/memory/test_credentials.md)
- Admin: support@route39.in / Admin@123
- HR: priya@route39.in, rahul@route39.in, sneha@route39.in / Hr@123
- Management: management@route39.in / Manager@123
- Demo data: 16 candidates, 5 jobs, activity log auto-generated on startup (idempotent).

## Implemented (2026-06)
- Login + JWT cookie auth, forgot/reset-password flow, role-based routing.
- Dashboard: 8 funnel stat cards (clickable), Pending Approvals, Recent HR Activity.
- Candidates: table with live search (name/phone) + filters (designation/city/HR/source/status).
- Add Candidate modal with real-time duplicate phone check (409 + existing candidate link).
- Candidate Profile: details, resume upload/view/download, append-only HR updates timeline,
  status change (records who/when), Send for Approval, Management decision with comments.
- Approvals queue (Management/Admin) with Approve/Reject/Send Back + comment.
- HR Monitoring: per-HR pipeline counts + latest activities.
- Jobs: create/list (admin/management), assignable HR, INR salary range.
- Activity Log: append-only who/what/when table.
- Verified: 29/29 backend tests pass; full HR→Management workflow verified in UI.

## Backlog / Future (P1/P2)
- P1: Kanban board view for candidates; CSV export; edit-candidate UI (backend PUT exists).
- P1: Admin user-management UI (backend POST /api/users exists).
- P2: Source efficiency charts; interview scheduling; bulk actions.

## Next Tasks
- Wire an Admin "Users" screen to create HR/Management accounts.
- Add candidate edit form on profile.
