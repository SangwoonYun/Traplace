# File: app/routes/core.py
"""
Core routes.

Defines base routes for rendering the main page and providing
a simple health check endpoint.
"""

from flask import Blueprint, jsonify, render_template, request

from .policies import SUPPORTED_LANGS

bp = Blueprint('core', __name__)


@bp.get('/')
def index():
    """Render the main index page."""
    lang = request.args.get('lang', 'en')
    if lang not in SUPPORTED_LANGS:
        lang = 'en'
    return render_template('index.html', current_lang=lang)


@bp.get('/healthz')
def healthz():
    """Return a basic health check response."""
    return jsonify(status='ok')
