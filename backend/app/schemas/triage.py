from typing import List, Optional, Literal
from pydantic import BaseModel, Field

UrgencyLiteral = Literal["RED", "YELLOW", "GREEN"]


class TriageInput(BaseModel):
    display_name: str
    age_years: int
    preferred_language: Literal["en", "ur", "roman_ur"] = "en"
    symptom_text: str
    input_mode: Literal["TEXT", "VOICE"] = "TEXT"
    patient_reported_duration: Optional[str] = None
    department_name: Optional[str] = None
    # Optional measured vitals if already present during triage evaluation
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    temperature_c: Optional[float] = None
    spo2_percent: Optional[int] = None
    pulse_bpm: Optional[int] = None


class RuleHitResult(BaseModel):
    rule_code: str
    rule_version: str
    evidence: dict


class TriageOutput(BaseModel):
    normalized_symptoms: List[str] = Field(default_factory=list)
    urgency_tier: UrgencyLiteral
    red_flag_reasons: List[str] = Field(default_factory=list)
    recommended_department: Optional[str] = None
    doctor_pre_brief: str
    uncertainties: List[str] = Field(default_factory=list)
    source: Literal["RULES", "LLM", "HUMAN", "COMBINED"]
    model_provider: str
    model_name: str
    prompt_version: str
    rule_set_version: str
    input_hash: str
    rule_hits: List[RuleHitResult] = Field(default_factory=list)