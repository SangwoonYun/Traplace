# File: app/routes/core.py
"""
Core routes.

Defines base routes for rendering the main page and providing
a simple health check endpoint.
"""

from flask import Blueprint, jsonify, render_template

bp = Blueprint('core', __name__)


@bp.get('/')
def index():
    """Render the main index page."""
    return render_template('index.html')


@bp.get('/healthz')
def healthz():
    """Return a basic health check response."""
    return jsonify(status='ok')
