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
    # Ensure extensions dict exists
    if not hasattr(app, 'extensions') or app.extensions is None:
        app.extensions = {}

    # Try to connect to Redis if URL is provided
    redis_url = app.config.get('REDIS_URL', '').strip()
    if redis_url:
        try:
            client = redis.Redis.from_url(redis_url, decode_responses=True)
            client.ping()  # Test connection
            app.extensions[_EXT_KEY] = client
        except Exception as e:
            print(f"Warning: Redis connection failed: {e}. Continuing without Redis.")
            app.extensions[_EXT_KEY] = None
    else:
        print("Warning: REDIS_URL not set. Running without Redis support.")
        app.extensions[_EXT_KEY] = None


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
        redis_url = current_app.config.get('REDIS_URL', '').strip()
        if redis_url:
            try:
                client = redis.Redis.from_url(redis_url, decode_responses=True)
                client.ping()
                if not hasattr(current_app, 'extensions') or current_app.extensions is None:
                    current_app.extensions = {}
                current_app.extensions[_EXT_KEY] = client
            except Exception as e:
                print(f"Warning: Redis connection failed in lazy init: {e}")
                return None
        else:
            return None

    return client
