# File: wsgi.py
"""
WSGI entry point.

This module exposes the WSGI application callable as a module-level variable
named `app`, for use by WSGI-compatible servers (e.g., Gunicorn, uWSGI).
"""

from app import create_app

# Default environment is 'production' unless overridden externally
app = create_app(env='production')

if __name__ == '__main__':
    # Optional: for local debugging only
    app.run(host='0.0.0.0', port=5000, debug=app.config.get('DEBUG', False))
