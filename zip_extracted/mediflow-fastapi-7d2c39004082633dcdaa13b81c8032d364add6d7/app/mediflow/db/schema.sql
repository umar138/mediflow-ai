-- ===== Extensions & Enum Types =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email

CREATE TYPE membership_role    AS ENUM ('ADMIN','DOCTOR','NURSE','RECEPTIONIST');
CREATE TYPE language_code      AS ENUM ('en','ur','roman_ur');
CREATE TYPE ticket_status      AS ENUM ('WAITING','CALLED','IN_CONSULTATION','ON_HOLD',
                                        'COMPLETED','CANCELLED','NO_SHOW');
CREATE TYPE urgency_level      AS ENUM ('RED','YELLOW','GREEN');
CREATE TYPE ticket_channel     AS ENUM ('QR','WALK_IN');
CREATE TYPE intake_input_mode  AS ENUM ('TEXT','VOICE');
CREATE TYPE triage_source      AS ENUM ('RULES','LLM','COMBINED');

-- ===== 1. clinics =====
CREATE TABLE clinics (
    clinic_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    public_notice TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== 2. departments =====
CREATE TABLE departments (
    department_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     UUID NOT NULL REFERENCES clinics(clinic_id) ON DELETE CASCADE,
    code          TEXT NOT NULL,
    name          TEXT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (clinic_id, code),
    UNIQUE (department_id, clinic_id)          -- target for tenant-safe composite FKs
);

-- ===== 3. staff_users =====
CREATE TABLE staff_users (
    user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         CITEXT NOT NULL UNIQUE,
    full_name     TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== 4. clinic_memberships (junction: staff <-> clinic) =====
CREATE TABLE clinic_memberships (
    membership_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     UUID NOT NULL REFERENCES clinics(clinic_id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES staff_users(user_id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(department_id) ON DELETE SET NULL,
    role          membership_role NOT NULL,
    UNIQUE (clinic_id, user_id)
);

-- ===== 5. patients =====
CREATE TABLE patients (
    patient_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id          UUID NOT NULL REFERENCES clinics(clinic_id) ON DELETE CASCADE,
    display_name       TEXT NOT NULL,
    age_years          SMALLINT CHECK (age_years BETWEEN 0 AND 130),
    preferred_language language_code NOT NULL DEFAULT 'en',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (patient_id, clinic_id)
);

-- ===== 6. queue_tickets =====
CREATE TABLE queue_tickets (
    ticket_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id               UUID NOT NULL REFERENCES clinics(clinic_id) ON DELETE CASCADE,
    department_id           UUID NOT NULL,
    patient_id              UUID NOT NULL,
    doctor_id               UUID REFERENCES staff_users(user_id) ON DELETE SET NULL,
    created_by              UUID REFERENCES staff_users(user_id) ON DELETE SET NULL,
    token_code              TEXT NOT NULL,
    status                  ticket_status  NOT NULL DEFAULT 'WAITING',
    urgency                 urgency_level  NOT NULL DEFAULT 'GREEN',
    priority_score          INTEGER NOT NULL DEFAULT 0,
    estimated_wait_minutes  INTEGER CHECK (estimated_wait_minutes >= 0),
    channel                 ticket_channel NOT NULL,
    checked_in_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    called_at               TIMESTAMPTZ,
    consultation_started_at TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- tenant-safety: department and patient must belong to the same clinic
    FOREIGN KEY (department_id, clinic_id) REFERENCES departments(department_id, clinic_id),
    FOREIGN KEY (patient_id, clinic_id)    REFERENCES patients(patient_id, clinic_id),
    UNIQUE (ticket_id, clinic_id),
    UNIQUE (clinic_id, token_code, checked_in_at)  -- adjust if tokens reset daily
);
CREATE INDEX idx_tickets_queue ON queue_tickets (clinic_id, department_id, status, priority_score DESC, checked_in_at);
CREATE INDEX idx_tickets_doctor ON queue_tickets (doctor_id) WHERE doctor_id IS NOT NULL;

-- ===== 7. intake_records =====
CREATE TABLE intake_records (
    intake_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id                  UUID NOT NULL REFERENCES queue_tickets(ticket_id) ON DELETE CASCADE,
    symptom_text               TEXT NOT NULL,
    input_mode                 intake_input_mode NOT NULL,
    patient_reported_duration  TEXT,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_intake_ticket ON intake_records (ticket_id);

-- ===== 8. vital_observations =====
CREATE TABLE vital_observations (
    vital_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id      UUID NOT NULL REFERENCES queue_tickets(ticket_id) ON DELETE CASCADE,
    systolic_bp    SMALLINT CHECK (systolic_bp  BETWEEN 40 AND 300),
    diastolic_bp   SMALLINT CHECK (diastolic_bp BETWEEN 20 AND 200),
    temperature_c  NUMERIC(4,1) CHECK (temperature_c BETWEEN 30 AND 45),
    spo2_percent   SMALLINT CHECK (spo2_percent BETWEEN 0 AND 100),
    pulse_bpm      SMALLINT CHECK (pulse_bpm BETWEEN 20 AND 300),
    measured_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by    UUID REFERENCES staff_users(user_id) ON DELETE SET NULL
);
CREATE INDEX idx_vitals_ticket ON vital_observations (ticket_id, measured_at DESC);

-- ===== 9. triage_assessments =====
CREATE TABLE triage_assessments (
    triage_assessment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id            UUID NOT NULL,
    clinic_id            UUID NOT NULL REFERENCES clinics(clinic_id) ON DELETE CASCADE,
    source               triage_source NOT NULL,
    urgency              urgency_level NOT NULL,
    normalized_symptoms  JSONB NOT NULL DEFAULT '[]'::jsonb,
    red_flag_reasons     JSONB NOT NULL DEFAULT '[]'::jsonb,
    uncertainties        JSONB NOT NULL DEFAULT '[]'::jsonb,
    recommended_department TEXT,
    doctor_pre_brief     TEXT NOT NULL,
    model_provider       TEXT,
    model_name           TEXT,
    prompt_version       TEXT,
    rule_set_version     TEXT NOT NULL,
    input_hash           TEXT NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (ticket_id, clinic_id) REFERENCES queue_tickets(ticket_id, clinic_id) ON DELETE CASCADE,
    CHECK (source = 'RULES' OR model_name IS NOT NULL),
    CHECK (jsonb_typeof(normalized_symptoms) = 'array'
       AND jsonb_typeof(red_flag_reasons)    = 'array'
       AND jsonb_typeof(uncertainties)       = 'array')
);
CREATE INDEX idx_triage_ticket ON triage_assessments (ticket_id, created_at DESC);
CREATE INDEX idx_triage_hash   ON triage_assessments (input_hash);  -- cache/replay lookup

-- ===== 10. triage_rule_hits =====
CREATE TABLE triage_rule_hits (
    rule_hit_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    triage_assessment_id UUID NOT NULL REFERENCES triage_assessments(triage_assessment_id) ON DELETE CASCADE,
    rule_code            TEXT NOT NULL,
    rule_version         TEXT NOT NULL,
    evidence             TEXT NOT NULL
);
CREATE INDEX idx_rulehits_assessment ON triage_rule_hits (triage_assessment_id);
CREATE INDEX idx_rulehits_code ON triage_rule_hits (rule_code);

-- ===== 11. consultations =====
CREATE TABLE consultations (
    consultation_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id        UUID NOT NULL REFERENCES queue_tickets(ticket_id) ON DELETE CASCADE,
    doctor_id        UUID REFERENCES staff_users(user_id) ON DELETE SET NULL,
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at     TIMESTAMPTZ,
    duration_seconds INTEGER CHECK (duration_seconds >= 0),
    clinician_note   TEXT,
    CHECK (completed_at IS NULL OR completed_at >= started_at)
);
-- at most one open consultation per ticket (allows resume after ON_HOLD)
CREATE UNIQUE INDEX uq_open_consultation ON consultations (ticket_id) WHERE completed_at IS NULL;

-- ===== 12. clinic_delays =====
CREATE TABLE clinic_delays (
    delay_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     UUID NOT NULL REFERENCES clinics(clinic_id) ON DELETE CASCADE,
    department_id UUID,   -- NULL = clinic-wide delay
    delay_minutes INTEGER NOT NULL CHECK (delay_minutes > 0),
    reason        TEXT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_by    UUID REFERENCES staff_users(user_id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (department_id, clinic_id) REFERENCES departments(department_id, clinic_id)
);
CREATE INDEX idx_delays_active ON clinic_delays (clinic_id, department_id) WHERE is_active;

-- ===== 13. patient_tracking_tokens (1:1 with queue_tickets) =====
CREATE TABLE patient_tracking_tokens (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id      UUID NOT NULL UNIQUE REFERENCES queue_tickets(ticket_id) ON DELETE CASCADE,
    tracking_token TEXT NOT NULL UNIQUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== 14. display_access_tokens =====
CREATE TABLE display_access_tokens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     UUID NOT NULL REFERENCES clinics(clinic_id) ON DELETE CASCADE,
    display_token TEXT NOT NULL UNIQUE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== 15. audit_logs =====
CREATE TABLE audit_logs (
    audit_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     UUID NOT NULL REFERENCES clinics(clinic_id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES staff_users(user_id) ON DELETE SET NULL,
    entity_type   TEXT NOT NULL,
    entity_id     UUID NOT NULL,
    action        TEXT NOT NULL,
    details       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_logs (clinic_id, entity_type, entity_id, created_at DESC);