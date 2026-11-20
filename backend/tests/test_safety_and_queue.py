from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from app.schemas.triage import TriageInput
from app.services.triage import run_hybrid_triage
from app.services.queue import compute_priority_score
from app.models.entities import UrgencyTier


def test_deterministic_red_cannot_be_downgraded_by_llm_green():
    payload = TriageInput(
        display_name="Test Patient",
        age_years=55,
        preferred_language="en",
        symptom_text="Severe chest pain with sweating",
        input_mode="TEXT",
        spo2_percent=88,
    )
    mock_llm_green = {
        "normalized_symptoms": ["mild discomfort"],
        "urgency_tier": "GREEN",
        "recommended_department": "General",
        "doctor_pre_brief": "Looks minor",
        "uncertainties": [],
    }
    with patch("app.services.triage.settings.LLM_API_KEY", "test-key"), patch(
        "app.services.triage._call_optional_llm", return_value=mock_llm_green
    ):
        res = run_hybrid_triage(payload)
        assert res.urgency_tier == "RED"
        assert len(res.red_flag_reasons) >= 1
        assert "AI-generated draft" in res.doctor_pre_brief


def test_llm_failure_falls_back_safely():
    payload = TriageInput(
        display_name="Urdu Patient",
        age_years=30,
        preferred_language="ur",
        symptom_text="بخار اور کھانسی ہے",
        input_mode="TEXT",
    )
    with patch("app.services.triage.settings.LLM_API_KEY", "test-key"), patch(
        "app.services.triage._call_optional_llm", return_value=None
    ):
        res = run_hybrid_triage(payload)
        assert res.urgency_tier in ("RED", "YELLOW", "GREEN")
        assert res.source == "RULES"
        assert len(res.normalized_symptoms) >= 1


def test_queue_priority_aging_cap():
    now = datetime.now(timezone.utc)
    checked_in = now - timedelta(minutes=2000)  # Should cap aging at 120 points
    score, wait_mins = compute_priority_score(UrgencyTier.GREEN, checked_in, now=now)
    assert wait_mins == 2000
    assert score == 10 + 120