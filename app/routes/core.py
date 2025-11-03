# File: app/routes/core.py
"""
Core routes.

Defines base routes for rendering the main page and providing
a simple health check endpoint.
"""

from flask import Blueprint, jsonify, render_template, request

bp = Blueprint('core', __name__)


@bp.get('/')
def index():
    """Render the main index page."""
    # Get current language from query parameter
    current_lang = request.args.get('lang', 'en')  # Default to English
    return render_template('index.html', current_lang=current_lang)


@bp.get('/healthz')
def healthz():
    """Return a basic health check response."""
    return jsonify(status='ok')
