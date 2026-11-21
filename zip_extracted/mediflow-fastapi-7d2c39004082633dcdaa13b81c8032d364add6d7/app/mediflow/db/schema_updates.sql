
-- ==========================================
-- MEDIFLOW DATABASE ATTRIBUTE UPDATES
-- ==========================================

BEGIN;

-- Add attributes to staff_users
ALTER TABLE staff_users
ADD COLUMN IF NOT EXISTS phone_number TEXT,
ADD COLUMN IF NOT EXISTS license_number TEXT,
ADD COLUMN IF NOT EXISTS room_label TEXT;

-- Add attributes to patients
ALTER TABLE patients
ADD COLUMN IF NOT EXISTS cnic TEXT,
ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- CNIC must be unique within each clinic
CREATE UNIQUE INDEX IF NOT EXISTS ux_patients_clinic_cnic
ON patients (clinic_id, cnic)
WHERE cnic IS NOT NULL;

COMMIT;
