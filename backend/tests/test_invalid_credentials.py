import uuid
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_staff_login_invalid_credentials():
    """
    Verify that a wrong password (or unknown e‑mail) returns exactly the
    expected error message.
    """
    # Use a random e‑mail that does not exist in the DB
    fake_email = f"nonexistent.{uuid.uuid4().hex[:6]}@example.com"

    response = client.post(
        "/api/v1/auth/login",
        json={"email": fake_email, "password": "WrongPass123!"},
    )
    assert response.status_code == 401
    data = response.json()
    # The API should expose the literal string “Invalid credentials”.
    assert data["detail"] == "Invalid credentials"