# File: app/__init__.py
"""
Application factory.

Creates and configures the Flask application using an environment-aware configuration.
"""

import os

from flask import Flask

from .config import get_config
from .extensions import init_extensions
from .routes.core import bp as core_bp
from .routes.shortener import bp as shortener_bp

__all__ = ['create_app']


def create_app(env: str | None = None) -> Flask:
    """Create and configure the Flask application.

    Args:
        config_name: Explicit configuration name (e.g., 'development', 'production').
            If None, falls back to the ENV environment variable (default: 'development').

    Returns:
        A configured Flask application instance.
    """
    if env is None:
        env = os.getenv('ENV', 'development')

    app = Flask(__name__, template_folder='templates')
    app.config.from_object(get_config(env))

    # Initialize extensions (DB, cache, login, etc.)
    init_extensions(app)

    # Register blueprints
    app.register_blueprint(core_bp)
    app.register_blueprint(shortener_bp)

    return app
