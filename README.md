# MediFlow AI

MediFlow AI is a full-stack clinical queue, triage, and patient tracking demo. It provides public intake flows, role-based staff tools, doctor dashboards, live waiting-room displays, ticket tracking, appointment-style doctor selection, and multilingual clinical triage support.

The project combines a FastAPI backend with a Next.js frontend and can run with PostgreSQL or automatically fall back to a local SQLite database for demo use.

> **Safety notice:** MediFlow AI is a clinical workflow and triage decision-support prototype, not a diagnostic system or a substitute for professional medical judgment. The application is not validated for production clinical use.

## Features

- Public clinic lookup and department selection
- QR-style and walk-in patient intake
- English, Urdu, and Roman Urdu triage input
- Deterministic red/yellow/green triage rules with optional OpenAI-compatible LLM enrichment
- Priority queue scoring, estimated wait ranges, and active clinic delay adjustments
- Patient ticket tracking and public waiting-room display tokens
- Reception, nurse, admin, and doctor workflows
- Patient registration, login, profile, and visit history
- Staff and doctor account management
- Live WebSocket updates for queues, displays, tickets, and doctors
- PostgreSQL support with automatic SQLite fallback
- Seeded synthetic data for local demonstrations

## Technology Stack

### Backend

- Python
- FastAPI
- SQLAlchemy 2
- Pydantic 2 and Pydantic Settings
- PostgreSQL or SQLite
- Alembic
- JWT authentication
- WebSockets
- pytest
- Optional OpenAI-compatible LLM API

### Frontend

- Next.js 14
- React 18
- JavaScript and TypeScript
- Tailwind CSS
- Browser WebSocket clients

## Repository Layout

```text
mediflow-ai/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # Public, patient, staff, hospital, and auth routes
│   │   ├── core/            # Configuration and JWT/security helpers
│   │   ├── db/              # SQLAlchemy engine and sessions
│   │   ├── models/          # Database entities
│   │   ├── routers/         # Doctor auth and doctor WebSocket routes
│   │   ├── schemas/         # Request and response contracts
│   │   └── services/        # Triage, queue, ETA, display, and WebSocket logic
│   ├── tests/               # pytest integration and triage tests
│   ├── alembic/             # Database migrations
│   ├── mediflow.db          # Local SQLite demo database
│   └── requirements.txt
├── frontend/
│   ├── app/                 # Next.js pages and routes
│   ├── components/          # Reusable UI components
│   ├── hooks/               # React hooks
│   ├── lib/                 # API and WebSocket clients
│   └── public/              # Static frontend assets
├── db/
│   ├── schema_hospital.sql
│   └── seed_hospital.sql
├── docs/
├── deploy.ps1               # Windows deployment/build helper
├── deploy.sh                # Bash deployment/build helper
└── .env.example
```

## Prerequisites

- Windows PowerShell or another supported shell
- Python 3.10 or newer
- Node.js 18 or newer
- npm
- PostgreSQL 14 or newer, only when PostgreSQL mode is required

## Quick Start

Run the backend and frontend in separate terminals from the repository root.

### 1. Create a Python environment

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend\requirements.txt
```

### 2. Configure environment variables

Copy the example file and adjust it as needed:

```powershell
Copy-Item .env.example .env
```

The `.env` file is read by the backend. The frontend uses variables starting with `NEXT_PUBLIC_`.

### 3. Start the backend

```powershell
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Useful backend URLs:

- API documentation: http://localhost:8000/docs
- Alternative API documentation: http://localhost:8000/redoc
- Health check: http://localhost:8000/health

### 4. Start the frontend

Open another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

## Database Configuration

The default `DATABASE_URL` targets PostgreSQL:

```text
postgresql+psycopg2://postgres:postgres@localhost:5432/mediflow_db
```

The database session layer attempts to connect to PostgreSQL with a short timeout. If PostgreSQL is unavailable, it automatically falls back to:

```text
sqlite:///backend/mediflow.db
```

To force SQLite explicitly, set:

```dotenv
DATABASE_URL=sqlite:///mediflow.db
```

An SQLite-only setup is useful for local demos and does not require a separate database server.

### Seed Demo Data

The most comprehensive seed script creates a synthetic clinic, departments, staff accounts, queue tickets, vitals, triage assessments, tracking tokens, display tokens, and consultation history.

Run it from the repository root:

```powershell
python backend\app\seed.py
```

Reset and rebuild its demo tables:

```powershell
python backend\app\seed.py --reset
```

The alternate lightweight seed is available at:

```powershell
python backend\app\seed_app.py
```

Use `seed.py --reset` carefully because it drops and recreates all SQLAlchemy tables.

## Demo Accounts

The comprehensive seed script (`backend/app/seed.py`) uses:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@mediflow.demo` | `DemoPass123!` |
| Receptionist | `reception@mediflow.demo` | `DemoPass123!` |
| Nurse | `nurse@mediflow.demo` | `DemoPass123!` |
| Doctor (GP) | `dr.sara@mediflow.demo` | `DemoPass123!` |
| Doctor (Pediatrics) | `dr.hamza@mediflow.demo` | `DemoPass123!` |

Demo data also includes:

- Clinic slug: `islamabad-care-clinic`
- TV display token: `demo-tv-display-token-2026`
- Tracking tokens: `track-demo-001` through `track-demo-020`

The lightweight seed uses:

- Clinic slug: `mediflow-demo`
- TV display token: `mediflow-main-display`
- Tracking token: `track-demo-005`

## Frontend Routes

| Route | Purpose |
|---|---|
| `/` | Landing and hospital/clinic selection |
| `/admin` | Administrative staff and clinic tools |
| `/reception` | Reception queue and walk-in workflows |
| `/doctor/login` | Doctor login |
| `/doctor/dashboard` | Doctor consultation dashboard |
| `/patient` | Patient registration/login and account area |
| `/c/[slug]/join` | Public clinic intake/join flow |
| `/track/[token]` | Public patient ticket tracking |
| `/display/[token]` | Public waiting-room display |

## API Overview

All versioned application endpoints are mounted below `/api/v1`.

### Public

- `GET /api/v1/public/clinics/{slug}`
- `POST /api/v1/public/clinics/{clinic_id}/intakes`
- `POST /api/v1/public/clinics/{clinic_id}/emergency-intake`
- `POST /api/v1/public/triage-preview`
- `POST /api/v1/public/medical-guidance`
- `GET /api/v1/public/tickets/{tracking_token}`
- `GET /api/v1/public/display/{display_token}`
- `GET /api/v1/public/clinics/{clinic_id}/live-summary`
- `GET /api/v1/public/clinics/{clinic_id}/doctors`
- `GET /api/v1/public/clinics/{clinic_id}/doctors/{doctor_id}/slots`

### Staff

- Login and doctor registration
- Create tickets, record vitals, call and complete visits
- Read and update queue state
- Update patient details and clinic delays
- List, create, update, and remove clinic staff

### Patient

- Register
- Login with CNIC or email
- Recover/reset a password through the demo forgot-password flow
- Read profile and visit history

### Realtime

- `/api/v1/ws/clinics/{clinic_id}`
- `/api/v1/ws/public-display/{display_token}`
- `/api/v1/ws/tickets/{tracking_token}`
- `/api/v1/doctor/ws/listen?token=...`

FastAPI's interactive Swagger UI at `/docs` provides the complete request and response contracts.

## Triage Behavior

Triage uses two layers:

1. **Deterministic rules** evaluate vitals and multilingual symptom phrases. Critical conditions are mapped to `RED`.
2. **Optional LLM enrichment** asks an OpenAI-compatible API for normalized symptoms, department suggestions, a pre-consultation brief, and an urgency tier.

The deterministic result can never be downgraded by an LLM result. If the LLM key is missing, the provider times out, or the response is invalid, the system uses the deterministic fallback.

The triage module is designed for demonstration and should not be used for real diagnosis or emergency routing.

## Environment Variables

### Backend

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | PostgreSQL URL | SQLAlchemy database connection |
| `JWT_SECRET_KEY` | Development key | Signs access tokens |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `720` | Access-token lifetime |
| `LLM_API_KEY` | Empty | Enables optional LLM triage |
| `LLM_BASE_URL` | Groq OpenAI-compatible URL | LLM API base URL |
| `LLM_MODEL` | `llama-3.1-8b-instant` | LLM model name |
| `LLM_TIMEOUT_SECONDS` | `4.0` | Maximum LLM request time |
| `RULE_SET_VERSION` | `demo-rules-v1.0` | Recorded rule-set version |
| `PROMPT_VERSION` | `triage-prompt-v1.0` | Recorded prompt version |
| `DEFAULT_CONSULT_MINUTES` | `12` | Baseline consultation estimate |
| `ETA_BUFFER_MINUTES` | `5` | ETA range buffer |

### Frontend

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | Primary HTTP API base |
| `NEXT_PUBLIC_API_BASE` | None | Compatibility HTTP API variable |
| `NEXT_PUBLIC_WS_BASE_URL` | `ws://localhost:8000` | Public and staff WebSocket base |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000` | Doctor WebSocket base |

Set all public variables in the deployment environment; restart `npm run dev` after changing environment files.

For production, replace the development JWT secret and the placeholder frontend URLs. Never commit real API keys or credentials.

## Testing

Run the backend test suite from the repository root:

```powershell
pytest -q backend\tests
```

The tests cover:

- Invalid credential responses
- Patient and doctor registration/login
- RED triage safety against LLM downgrades
- LLM failure fallback
- Queue aging and priority limits

Run frontend validation:

```powershell
cd frontend
npm run lint
npm run build
```

## Building and Deployment

Build the Next.js frontend:

```powershell
cd frontend
npm run build
```

Start the backend in a production-like process:

```powershell
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The repository includes `deploy.ps1` and `deploy.sh`, but they contain placeholder production URLs and should be reviewed before use.

Before a real deployment:

1. Use a managed PostgreSQL database.
2. Set a strong `JWT_SECRET_KEY`.
3. Restrict CORS origins instead of using `allow_origins=["*"]`.
4. Configure HTTPS/WSS origins.
5. Remove demo accounts or seed data.
6. Configure logging, backups, monitoring, and rate limits.
7. Complete clinical validation and regulatory review.

## Troubleshooting

### Backend starts but database operations fail

- Confirm PostgreSQL is running.
- Confirm the database name and credentials in `DATABASE_URL`.
- Alternatively set `DATABASE_URL=sqlite:///mediflow.db`.
- Run the seed script after the database is reachable.

### Frontend cannot reach the backend

- Confirm the backend is listening on port `8000`.
- Open http://localhost:8000/health.
- Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`.
- Restart Next.js after changing an environment variable.

### WebSocket updates do not connect

- Set `NEXT_PUBLIC_WS_BASE_URL=ws://localhost:8000`.
- Set `NEXT_PUBLIC_WS_URL=ws://localhost:8000` for doctor updates.
- For HTTPS frontend deployments, use `wss://` instead of `ws://`.

### Login fails

- Run `python backend\app\seed.py`.
- Use one of the documented demo accounts.
- Confirm the JWT secret is stable across backend restarts.

## Project Status

MediFlow AI is a hackathon/demo application. It demonstrates end-to-end clinical queue workflows, real-time updates, and multilingual triage design, but it has not been clinically validated and should not process real patient information outside an authorized, secure prototype environment.