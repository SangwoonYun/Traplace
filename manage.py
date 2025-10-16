# File: manage.py
"""
Application entry point.

This script initializes and runs the Flask app
using environment-based configuration.
"""

import os

from app import create_app


def main() -> None:
    """Entry point for running the application."""
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', '5000'))
    env = os.getenv('ENV', 'development')

    app = create_app(env)
    debug = app.config.get('DEBUG', False)

    try:
        app.run(host=host, port=port, debug=debug)
    except Exception as exc:
        # Log to stderr; consider switching to structured logging in production
        print(f'[ERROR] Failed to start server: {exc}', flush=True)
        raise


if __name__ == '__main__':
    main()
