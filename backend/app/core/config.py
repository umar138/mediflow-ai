from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/mediflow_db"
    JWT_SECRET_KEY: str = "super-secret-hackathon-jwt-key-change-in-prod"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720

    # AI / LLM Settings (Optional - Safe fallback if empty)
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = "https://api.groq.com/openai/v1"
    LLM_MODEL: str = "llama-3.1-8b-instant"
    LLM_TIMEOUT_SECONDS: float = 4.0

    # Configurable Triage & ETA Demo Thresholds
    RULE_SET_VERSION: str = "demo-rules-v1.0"
    PROMPT_VERSION: str = "triage-prompt-v1.0"
    DEFAULT_CONSULT_MINUTES: int = 12
    ETA_BUFFER_MINUTES: int = 5

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")


settings = Settings()