# File: app/routes/shortener.py
"""
URL shortener routes.

Provides:
- POST /api/shorten : create a short path for a same-origin URL
- GET  /s/<code>    : redirect to the original (cached) path
"""

from flask import Blueprint, abort, current_app, jsonify, redirect, request, url_for

from ..extensions import get_redis
from ..utils.shortener import extract_path_preserving_query, new_code, same_origin

bp = Blueprint('shortener', __name__)


@bp.post('/api/shorten')
def api_shorten():
    """Create and persist a short code for a same-origin URL.

    Accepts both JSON and FormData for iOS compatibility:
    - JSON: Content-Type: application/json (triggers CORS preflight)
    - FormData: multipart/form-data (avoids CORS preflight)

    If the same path already exists, reuses the existing code and refreshes TTL.
    """
    r = get_redis()

    # Support both JSON (original) and FormData (iOS-friendly)
    if request.is_json:
        data = request.get_json(silent=True) or {}
        raw = (data.get('url') or '').strip()
    else:
        # FormData or form-urlencoded
        raw = (request.form.get('url') or '').strip()

    if not raw:
        return jsonify(error='url is required'), 400

    if not same_origin(request, raw):
        return jsonify(error='only same-origin URLs are allowed'), 400

    cfg = current_app.config
    ttl = cfg['SHORT_TTL_SECONDS']
    prefix = cfg['SHORT_KEY_PREFIX']
    code_len = cfg['SHORT_CODE_LEN']

    path = extract_path_preserving_query(raw)

    # Check if this path already has a short code (reverse lookup)
    reverse_key = f"{prefix}path:{path}"
    existing_code = r.get(reverse_key)

    if existing_code:
        # Refresh TTL for both forward and reverse mappings
        forward_key = prefix + existing_code
        if r.exists(forward_key):
            r.expire(forward_key, ttl)
            r.expire(reverse_key, ttl)
            short_path = url_for('shortener.redirect_short', code=existing_code)
            return jsonify(code=existing_code, short_url=short_path, path=path), 200

    # Try multiple times to avoid key collisions under high contention
    for _ in range(8):
        code = new_code(code_len)
        key = prefix + code
        ok = r.set(key, path, ex=ttl, nx=True)
        if ok:
            # Store reverse mapping (path → code) for deduplication
            r.set(reverse_key, code, ex=ttl)
            short_path = url_for('shortener.redirect_short', code=code)
            return jsonify(code=code, short_url=short_path, path=path), 201

    return jsonify(error='could not allocate short code, try again'), 503


@bp.get('/s/<code>')
def redirect_short(code: str):
    """Resolve a short code and redirect to the original path."""
    r = get_redis()
    cfg = current_app.config
    ttl = cfg['SHORT_TTL_SECONDS']
    prefix = cfg['SHORT_KEY_PREFIX']

    key = prefix + code
    path = r.get(key)
    if not path:
        abort(404)

    # Touch TTL to extend the life of popular links
    r.expire(key, ttl)
    return redirect(path, code=302)
