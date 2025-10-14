import os


class BaseConfig:
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    SHORT_CODE_LEN = 8
    SHORT_TTL_SECONDS = 7 * 24 * 60 * 60
    SHORT_KEY_PREFIX = "su:"


class DevConfig(BaseConfig):
    DEBUG = True


class ProdConfig(BaseConfig):
    DEBUG = False


def get_config(name: str | None):
    env = name or os.getenv("FLASK_ENV") or os.getenv("ENV") or "dev"
    env = env.lower()
    if env.startswith("prod"):
        return ProdConfig
    return DevConfig
