# File: app/extensions.py
"""
Application extensions initializer.

Manages shared services such as Redis. Provides both initialization at app startup
and lazy loading fallback for safe access within request contexts.
"""

import redis
from flask import Flask, current_app

_EXT_KEY = 'redis'  # Key for app.extensions registry


def init_extensions(app: Flask) -> None:
    """Initialize application extensions.

    Called once at app startup. Registers shared service clients
    (e.g., Redis) into the Flask app.extensions namespace.
    """
    client = redis.Redis.from_url(app.config['REDIS_URL'], decode_responses=True)

    # Ensure extensions dict exists
    if not hasattr(app, 'extensions') or app.extensions is None:
        app.extensions = {}

    app.extensions[_EXT_KEY] = client


def get_redis() -> redis.Redis:
    """Return a Redis client from the current app context.

    Always use this accessor instead of directly creating Redis clients.

    Behavior:
        - Normal case: returns `app.extensions['redis']`
        - Fallback: if not initialized, performs a lazy init based on current config
    """
    exts = getattr(current_app, 'extensions', {}) or {}
    client = exts.get(_EXT_KEY)

    if client is None:
        # Lazy initialization (useful during early import or test contexts)
        client = redis.Redis.from_url(current_app.config['REDIS_URL'], decode_responses=True)

        if not hasattr(current_app, 'extensions') or current_app.extensions is None:
            current_app.extensions = {}

        current_app.extensions[_EXT_KEY] = client

    return client
