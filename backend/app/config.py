"""Application configuration using pydantic-settings."""
from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List
import os


class Settings(BaseSettings):
    # App
    APP_NAME: str = "SCADA-IDS"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    ENVIRONMENT: str = "development"

    # JWT
    SECRET_KEY: str = "scada-ids-super-secret-key-2024-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Database
    DATABASE_URL: str = "sqlite:///./scada_ids.db"

    # ML Model
    MODEL_PATH: str = "./models/isolation_forest.joblib"
    ANOMALY_THRESHOLD: float = 0.5
    INFERENCE_TIMEOUT_MS: int = 100

    # Simulation
    SIMULATOR_SPEED: str = "1x"
    SIMULATOR_BATCH_SIZE: int = 10

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"

    # Security
    BCRYPT_ROUNDS: int = 12

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
