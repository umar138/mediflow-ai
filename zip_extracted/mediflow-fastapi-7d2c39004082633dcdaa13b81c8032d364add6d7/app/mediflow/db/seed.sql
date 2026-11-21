-- Mediflow sample data from the supplied screenshots.
-- Run schema_updates.sql BEFORE this file.
-- All names, CNICs, phone numbers, emails, and symptoms below are dummy test data.
-- Demo password for newly created staff accounts: DemoOnly_ChangeMe_2026!
-- Passwords are stored as bcrypt hashes using pgcrypto's Blowfish (bf) algorithm.
-- Do not use these demo credentials for a real deployment.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Make sure the departments needed by the sample staff and visit records exist.
INSERT INTO departments (clinic_id, code, name)
SELECT clinic_id, 'GP', 'General Practice'
FROM clinics
WHERE slug = 'mediflow-main'
ON CONFLICT (clinic_id, code)
DO UPDATE SET name = EXCLUDED.name;

INSERT INTO departments (clinic_id, code, name)
SELECT clinic_id, 'ORTHO', 'Orthopedics'
FROM clinics
WHERE slug = 'mediflow-main'
ON CONFLICT (clinic_id, code)
DO UPDATE SET name = EXCLUDED.name;

-- 2. Staff accounts and the extra profile attributes from the screenshot.
-- Existing users are updated, but their existing password hashes are not replaced.
INSERT INTO staff_users
    (email, full_name, password_hash, phone_number, license_number, room_label)
VALUES
    ('tariq.mahmood.demo@mediflow.local', 'Dr. Tariq Mahmood',
     crypt('DemoOnly_ChangeMe_2026!', gen_salt('bf', 12)),
     '+92-300-5120001', 'PMDC-CRD-1041', 'Room 101'),
    ('sana.farooq.demo@mediflow.local', 'Dr. Sana Farooq',
     crypt('DemoOnly_ChangeMe_2026!', gen_salt('bf', 12)),
     '+92-321-5120002', 'PMDC-GPS-1042', 'Room 102'),
    ('bilal.ahmed.demo@mediflow.local', 'Dr. Bilal Ahmed',
     crypt('DemoOnly_ChangeMe_2026!', gen_salt('bf', 12)),
     '+92-333-5120003', 'PMDC-ORT-1043', 'Room 103'),
    ('ayesha.nurse.demo@mediflow.local', 'Ayesha Siddiqui',
     crypt('DemoOnly_ChangeMe_2026!', gen_salt('bf', 12)),
     '+92-312-5120004', NULL, 'Triage Desk 1'),
    ('kamran.desk.demo@mediflow.local', 'Kamran Raza',
     crypt('DemoOnly_ChangeMe_2026!', gen_salt('bf', 12)),
     '+92-345-5120005', NULL, 'Front Desk')
ON CONFLICT (email)
DO UPDATE SET
    full_name      = EXCLUDED.full_name,
    phone_number   = EXCLUDED.phone_number,
    license_number = EXCLUDED.license_number,
    room_label     = EXCLUDED.room_label,
    is_active      = TRUE;

-- 3. Assign each staff user to the clinic, role, and department.
INSERT INTO clinic_memberships (clinic_id, user_id, department_id, role)
SELECT
    c.clinic_id,
    su.user_id,
    d.department_id,
    v.role_name::membership_role
FROM (VALUES
    ('tariq.mahmood.demo@mediflow.local', 'CARD',  'DOCTOR'),
    ('sana.farooq.demo@mediflow.local',   'GP',    'DOCTOR'),
    ('bilal.ahmed.demo@mediflow.local',  'ORTHO', 'DOCTOR'),
    ('ayesha.nurse.demo@mediflow.local', 'GP',    'NURSE'),
    ('kamran.desk.demo@mediflow.local',  'GP',    'RECEPTIONIST')
) AS v(email, department_code, role_name)
JOIN staff_users su ON su.email = v.email::citext
JOIN clinics c ON c.slug = 'mediflow-main'
JOIN departments d
    ON d.clinic_id = c.clinic_id
   AND d.code = v.department_code
ON CONFLICT (clinic_id, user_id)
DO UPDATE SET
    department_id = EXCLUDED.department_id,
    role          = EXCLUDED.role;

-- 4. Patient profiles with age, language, dummy CNIC, and dummy phone number.
INSERT INTO patients
    (clinic_id, display_name, age_years, preferred_language, cnic, phone_number)
SELECT
    c.clinic_id,
    v.display_name,
    v.age_years,
    v.language_code::language_code,
    v.cnic,
    v.phone_number
FROM clinics c
CROSS JOIN (VALUES
    ('Hamza Tariq', 34, 'en',       '61101-1234567-1', '+92-301-8890011'),
    ('Zainab Bibi', 52, 'ur',       '35202-2345678-2', '+92-302-8890012'),
    ('Usman Ghani', 27, 'roman_ur', '42101-3456789-3', '+92-331-8890013'),
    ('Hira Naveed', 41, 'en',       '61101-4567890-4', '+92-315-8890014')
) AS v(display_name, age_years, language_code, cnic, phone_number)
WHERE c.slug = 'mediflow-main'