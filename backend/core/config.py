from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    CORS_ORIGIN: list[str]
    
    ORTHANC_URL: str
    ORTHANC_USER: str
    ORTHANC_PASS: str

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

@lru_cache() # Caches so Settings object is reused (performance)
def get_settings():
    return Settings()

# This settings object will be used across the whole backend
# to access any .env data
settings = get_settings()