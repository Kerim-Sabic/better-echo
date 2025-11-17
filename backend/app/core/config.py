from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    CORS_ORIGIN: list[str]
    
    ORTHANC_URL: str
    ORTHANC_USER: str
    ORTHANC_PASS: str

    SECRET_KEY: str
    TOKEN_EXPIRE_HOURS: int

    LLM_BASE_URL: str = "http://localhost:8012/v1"
    LLM_API_KEY: str = "local-echo-key"
    LLM_MODEL: str = "Qwen/Qwen2.5-14B-Instruct-AWQ"

    LLM_PROMPT_TEMPLATE_PATH: str = "app/prompting/echo_report_prompt.md.j2"
    LLM_TEMPERATURE_REPORT: float = 0.0
    LLM_TEMPERATURE_CHAT: float = 0.2
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

@lru_cache() # Caches so Settings object is reused (performance)
def get_settings():
    return Settings()

# This settings object will be used across the whole backend
# to access any .env data
settings = get_settings()
