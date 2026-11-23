-- Hospital schema additions for Mediflow

-- Hospitals table (top‑level entity)
CREATE TABLE hospitals (
    hospital_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Specializations table (e.g., Cardiology, Emergency, Orthopedics)
CREATE TABLE specializations (
    specialization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

-- Doctors table (staff users that are doctors)
CREATE TABLE doctors (
    doctor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
    email CITEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    cnic      Text NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    specialization_id UUID NOT NULL REFERENCES specializations(specialization_id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Adjust existing departments to reference hospitals instead of clinics
-- (keep old foreign key for backward compatibility; new FK added)
ALTER TABLE departments
    DROP CONSTRAINT IF EXISTS departments_clinic_id_fkey,
    ADD CONSTRAINT departments_hospital_id_fkey
        FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id) ON DELETE CASCADE;
