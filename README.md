# MediFlow AI — Smart Clinical Queue & Triage System

> **Capital Youth Expo — Track 2 Healthcare**  
> An AI-assisted hospital queue management, multilingual clinical triage, real-time patient tracking, and appointment scheduling platform built with **Next.js 14**, **FastAPI**, **PostgreSQL / SQLite**, and **WebSockets**.

> [!NOTE]
> **Clinical Disclaimer:** MediFlow AI is a clinical workflow & triage decision-support tool — not a medical diagnosis.

---

## Key Features

### 1. Public Hub & Real-Time Queue Summary (`/`)
- **Live Clinic Status:** Displays the currently serving token, next-in-line queue, waiting/in-consultation/completed counts, and average wait time via `GET /api/v1/public/clinics/{clinic_id}/live-summary` and WebSockets.
- **1-Click Emergency RED Card (Zero-Form):** Dedicated emergency banner for critical cases (road accident, heart attack/chest pain, severe bleeding, breathing/unconscious). Issues an immediate `RED` priority token (`R-xxx`) directly to the **Emergency & Trauma Center (`EMERG`)** with zero form fields required.

### 2. Patient Portal (`/patient`)
- **Authentication:** Sign in or register using CNIC or Email, plus password recovery.
- **Smart AI Triage & Symptom Preview:** Evaluates symptoms in English, Roman Urdu, and Urdu script (with fuzzy typo matching such as `"heart attak"`) and optionally enhances triage via an OpenAI-compatible LLM (`LLM_API_KEY`).
- **Doctor Selection, Attendance & Time-Slot Booking:**
  - Patients select a department (e.g., Cardiology, GP, Pediatrics, Orthopedics, Gynecology) and view assigned doctors with their **Present / Absent** status and room number.
  - Supports **today or future-date appointments** and displays **available time slots** (`09:00 AM` – `04:30 PM`), automatically disabling already-booked slots to prevent double-booking.
  - **Emergency (`EMERG`)** skips doctor selection and routes directly to the on-duty Emergency team.
- **Live Queue Tracker & Stepper:** Real-time position, ETA range, and check-in → waiting → consultation progress.
- **Recent Health Records & Printable E-Prescriptions:** View past consultations, clinician notes, lab tests, and print/save official digital prescriptions.
- **MediFlow AI Medical Guidance Chat:** Interactive assistant under **Need Assistance?** providing symptom guidance, red-flag warnings, department recommendations, and 1-click token booking.

### 3. Doctor & Nurse Console (`/doctor`)
- **Department & Room-Locked Queue:** Doctors and Nurses automatically see only their assigned department and room (no cross-department clutter).
- **Doctor-Specific Routing:** Each doctor sees only patients booked for their `doctor_id` (plus unassigned walk-ins/emergencies in their department).
- **Consultation Workflow:** View AI pre-brief, red-flag reasons, and vitals; **Call**, **Start**, and **Complete** consultations with digital prescriptions (medicines, dosage, frequency, lab tests, advice, follow-up).

### 4. Admin Staff & Department Console (`/admin`)
- **Staff Management:** Add Doctors, Nurses, and Receptionists; optionally assign custom integer IDs (`1, 2, 3...`); assign departments & rooms; and set login emails & passwords.
- **Doctor Attendance:** 1-click **Present / Absent** toggle that controls whether a doctor can be booked for same-day appointments.

### 5. Reception & Nurse Console (`/reception`) & Waiting Room TV Display (`/display/[token]`)
- **Walk-In Registration & Manual Info Update:** Register walk-in patients and fill in patient details later for 1-Click Emergency RED Card arrivals.
- **16:9 Waiting Room Display:** Sanitized public screen showing token codes, clinic status, and notices without exposing private patient information (PHI).

---

## Project File Structure

```text
mediflow-ai/
├── backend/
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── auth.py            # Staff & Doctor JWT auth + registration
│   │   │   ├── hospital.py        # Hospital & doctor listing endpoints
│   │   │   ├── patient.py         # Patient auth, profile & visit history
│   │   │   ├── public.py          # Public intake, 1-Click Emergency, live-summary, doctors/slots, AI guidance
│   │   │   ├── router.py          # API v1 router registration
│   │   │   ├── staff.py           # Queue management, vitals, call/start/complete, admin staff CRUD
│   │   │   └── ws.py              # WebSocket endpoints (clinic, display, ticket)
│   │   ├── core/
│   │   │   ├── config.py          # Environment & triage settings (Pydantic)
│   │   │   └── security.py        # Password hashing (bcrypt) & JWT helpers
│   │   ├── db/
│   │   │   ├── base.py            # SQLAlchemy declarative Base
│   │   │   └── session.py         # PostgreSQL engine with automatic SQLite fallback
│   │   ├── models/
│   │   │   ├── entities.py        # Core relational models (integer PKs/FKs)
│   │   │   └── hospital.py        # Hospital/specialization auxiliary models
│   │   ├── schemas/
│   │   │   ├── contracts.py       # Request/response Pydantic schemas
│   │   │   ├── hospital.py        # Hospital response schemas
│   │   │   └── triage.py          # Triage input/output models
│   │   ├── services/
│   │   │   ├── display_token.py   # Public TV display token helper
│   │   │   ├── eta.py             # Dynamic ETA calculation
│   │   │   ├── queue.py           # Priority-scored deterministic queue sorting
│   │   │   ├── triage.py          # Hybrid deterministic + fuzzy + LLM triage engine
│   │   │   └── ws_manager.py      # WebSocket connection manager
│   │   ├── clean_setup.py         # Resets DB cleanly with zero dummy patient records
│   │   ├── main.py                # FastAPI app, CORS, table creation & default bootstrap
│   │   └── seed.py                # Synthetic demo seed script
│   └── requirements.txt           # Python dependencies
├── db/
│   ├── schema_hospital.sql        # Reference SQL schema
│   └── seed_hospital.sql          # Reference SQL seed
├── frontend/
│   ├── app/
│   │   ├── admin/page.js          # Admin Staff, Department & Attendance Console
│   │   ├── c/[slug]/join/page.js  # Public QR patient intake page
│   │   ├── display/[token]/page.js# 16:9 Waiting Room TV Display
│   │   ├── doctor/page.js         # Doctor & Nurse Consultation Queue
│   │   ├── patient/page.js        # Patient Portal, Slot Booking, Records & AI Chat
│   │   ├── reception/page.js      # Reception & Nurse Walk-In / Manual Update Console
│   │   ├── track/[token]/page.js  # Live Patient Token Tracker
│   │   ├── globals.css            # Tailwind + glass-morphic utilities
│   │   ├── layout.js              # Root layout
│   │   └── page.js                # Main Hub & 1-Click Emergency Banner
│   ├── lib/
│   │   ├── api.js                 # Typed/centralized API client
│   │   └── ws.js                  # Reconnecting WebSocket helper
│   └── package.json               # Next.js 14 + Tailwind CSS dependencies
├── deploy.ps1                     # Windows production build & start script
├── deploy.sh                      # Linux/macOS production build & start script
└── README.md
```

---

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React 18, Tailwind CSS
- **Backend:** FastAPI, SQLAlchemy 2.0, Pydantic v2, Uvicorn, Python-JOSE (JWT), Passlib + Bcrypt
- **Database:** PostgreSQL (primary, via `DATABASE_URL`) with automatic local SQLite (`backend/mediflow.db`) fallback
- **Real-Time:** FastAPI WebSockets + polling fallback

---

## Default Admin Account

On startup, the backend automatically ensures the main clinic (`mediflow-demo`), core departments (`CARD`, `EMERG`, `GP`, `PEDS`, `ORTHO`, `GYNAE`), and the Admin account exist:

| Role  | Email              | Password   | Portal URL |
|-------|--------------------|------------|------------|
| Admin | `admin@gmail.com`  | `admin123` | `/admin`   |

From `/admin`, the Admin can create Doctors, Nurses, and Receptionists, assign their IDs, departments, and rooms, set their emails/passwords, and mark attendance (**Present / Absent**).

---

## Local Setup

### 1. Backend (FastAPI)
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
*(Optional)* To reset the database to a clean state with zero dummy patient/ticket records:
```bash
python -m app.clean_setup
```

### 2. Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000`.

---

## Deployment Guide (Vercel + Live Backend)

1. **Deploy the Backend (`backend/`):**
   - Host the FastAPI backend on **Render**, **Railway**, or **Fly.io** (recommended over serverless so WebSockets and PostgreSQL connection pooling stay active).
   - Start command:
     ```bash
     uvicorn app.main:app --host 0.0.0.0 --port $PORT
     ```
   - Environment variables:
     - `DATABASE_URL` (PostgreSQL connection string)
     - `JWT_SECRET_KEY` (strong random secret)
     - `LLM_API_KEY` *(optional, for LLM-enhanced triage & medical guidance)*

2. **Deploy the Frontend on Vercel (`frontend/`):**
   - Import the GitHub repository in **Vercel**.
   - Set **Root Directory** to `frontend`.
   - Add **Environment Variables** in Vercel Project Settings:
     - `NEXT_PUBLIC_API_BASE_URL` = `https://your-live-backend-url.com`
     - `NEXT_PUBLIC_WS_BASE_URL` = `wss://your-live-backend-url.com`
   - Deploy — Vercel will automatically run `npm run build` and serve all routes.
