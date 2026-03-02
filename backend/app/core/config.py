from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    CORS_ORIGIN: list[str]

    ORTHANC_URL: str
    ORTHANC_USER: str
    ORTHANC_PASS: str

    SECRET_KEY: str
    TOKEN_EXPIRE_HOURS: int

    # WebAuthn pending ceremony state backend (memory | redis).
    WEBAUTHN_STATE_BACKEND: str = "memory"
    # Enforce single-process runtime when using in-memory WebAuthn state.
    WEBAUTHN_REQUIRE_SINGLE_PROCESS: bool = True

    # Model preload toggles (default on; disable per machine if needed)
    PANECHO_PRELOAD: bool = True
    PANECHO_WARMUP: bool = False
    ECHOPRIME_PRELOAD: bool = True
    ECHOPRIME_WARMUP: bool = False
    ECHONET_PRELOAD: bool = True
    ECHONET_WARMUP: bool = False
    MEASUREMENTS_PRELOAD: bool = True
    MEASUREMENTS_WARMUP: bool = False

    # Batch sizes (conservative defaults; adjust per hardware)
    PANECHO_BATCH: int = 8
    ECHONET_BATCH: int = 16
    MEASUREMENTS_BATCH: int = 16
    MEASUREMENTS_OUTPUT_FPS: int = 30

    # Inference runtime profile and queue controls
    INFERENCE_PROFILE: str = "auto"
    PIPELINE_UNLOAD_POLICY: str = "stage"
    PIPELINE_MAX_ACTIVE_STUDIES: int = 1
    PIPELINE_POLL_INTERVAL_MS: int = 500
    PIPELINE_VIEW_CONFIDENCE_MIN: float = 0.75

    # Preferred devices (auto | cpu | cuda:<index>)
    PANECHO_DEVICE: str = "auto"
    ECHO_PRIME_DEVICE: str = "auto"
    ECHONET_DEVICE: str = "auto"
    MEASUREMENTS_DEVICE: str = "auto"
    RESERVED_LLM_DEVICE: Optional[str] = None

    LLM_BASE_URL: str = "http://localhost:8012/v1"
    LLM_API_KEY: str = "local-echo-key"
    LLM_MODEL: str = "Qwen/Qwen2.5-14B-Instruct-AWQ"

    LLM_PROMPT_TEMPLATE_PATH: str = "app/prompting/echo_report_prompt.md.j2"
    LLM_TEMPERATURE_REPORT: float = 0.0
    LLM_TOP_P_REPORT: float = 1.0
    LLM_SEED_REPORT: int = 0
    LLM_TEMPERATURE_CHAT: float = 0.2
    LLM_TOP_P_CHAT: float = 1.0
    LLM_SEED_CHAT: int = 0
    LLM_DESIRED_OUTPUT_TOKENS_REPORT: int = 1400
    LLM_DESIRED_OUTPUT_TOKENS_CHAT: int = 512
    # Keep aligned with vLLM --max-model-len
    LLM_SERVER_MAX_LEN: int = 16384
    # Hard cap for chat history turns
    LLM_HISTORY_MAX_TURNS: int = 2
    # Versioning for prompts/policies
    LLM_PROMPT_VERSION: str = "v1"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings():
    return Settings()


settings = get_settings()
