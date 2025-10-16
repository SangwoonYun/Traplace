# File: app/config.py
"""
Application configuration module.

Defines configuration classes for different environments and provides a helper
function to resolve the appropriate configuration dynamically.
"""

import os
from typing import Type


class BaseConfig:
    """Base configuration shared across all environments."""

    REDIS_URL: str = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    SHORT_CODE_LEN: int = 8
    SHORT_TTL_SECONDS: int = 7 * 24 * 60 * 60  # 7 days
    SHORT_KEY_PREFIX: str = 'su:'


class DevConfig(BaseConfig):
    """Development environment configuration."""

    DEBUG: bool = True


class ProdConfig(BaseConfig):
    """Production environment configuration."""

    DEBUG: bool = False


def get_config(name: str | None = None) -> Type[BaseConfig]:
    """Return a configuration class based on the provided or detected environment name.

    Args:
        name: Optional environment name (e.g., 'development', 'production').
              If not provided, detects from environment variables FLASK_ENV or ENV.

    Returns:
        A configuration class (subclass of BaseConfig).
    """
    env = (name or os.getenv('FLASK_ENV') or os.getenv('ENV') or 'dev').lower()

    if env.startswith('prod'):
        return ProdConfig
    return DevConfig
