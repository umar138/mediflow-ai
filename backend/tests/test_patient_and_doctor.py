import uuid
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

# Generate once per pytest run so registration and login share the same patient
RUN_ID = uuid.uuid4().hex[:6]
PATIENT_CNIC = f"61101-{uuid.uuid4().int % 10_000_000:07d}-9"
PATIENT_EMAIL = f"ali.{RUN_ID}@example.com"
PATIENT_PASSWORD = "Password123!"


def test_doctor_registration_flow():
    doctor_email = f"dr.usman.{RUN_ID}@mediflow.com"
    license_no = f"PMDC-{RUN_ID.upper()}"

    payload = {
        "clinic_slug": "mediflow-central",
        "full_name": "Dr. Usman Tariq",
        "email": doctor_email,
        "password": "DoctorPass123!",
        "degrees": "MBBS, FCPS Orthopedics",
        "specialization": "Orthopedic Surgeon",
        "license_number": license_no,
        "department_code": "ORTHO",
        "room_number": "Room 108 — Bone & Joint",
    }
    res = client.post("/api/v1/auth/doctor/register", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == doctor_email
    assert data["degrees"] == "MBBS, FCPS Orthopedics"
    assert data["room_number"] == "Room 108 — Bone & Joint"
    assert "access_token" in data


def test_patient_registration_and_duplicate_cnic():
    patient_payload = {
        "clinic_slug": "mediflow-central",
        "full_name": "Muhammad Ali",
        "cnic": PATIENT_CNIC,
        "phone_number": "0300-9876543",
        "age_years": 34,
        "gender": "male",
        "email": PATIENT_EMAIL,
        "password": PATIENT_PASSWORD,
    }
    # First registration -> 201 Created
    r1 = client.post("/api/v1/patient/register", json=patient_payload)
    assert r1.status_code == 201
    d1 = r1.json()
    assert d1["full_name"] == "Muhammad Ali"
    assert d1["cnic"] == PATIENT_CNIC

    # Duplicate CNIC registration -> 409 Conflict
    r2 = client.post("/api/v1/patient/register", json=patient_payload)
    assert r2.status_code == 409
    assert "already registered" in r2.json()["detail"]


def test_patient_login_with_cnic_and_email():
    # Login with CNIC
    r1 = client.post(
        "/api/v1/patient/login",
        json={"identifier": PATIENT_CNIC, "password": PATIENT_PASSWORD},
    )
    assert r1.status_code == 200
    assert r1.json()["full_name"] == "Muhammad Ali"

    # Login with Email
    r2 = client.post(
        "/api/v1/patient/login",
        json={"identifier": PATIENT_EMAIL, "password": PATIENT_PASSWORD},
    )
    assert r2.status_code == 200
    assert r2.json()["cnic"] == PATIENT_CNIC