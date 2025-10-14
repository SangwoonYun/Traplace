from flask import Blueprint, current_app, jsonify, request, url_for, redirect, abort

from ..extensions import get_redis
from ..utils.shortener import new_code, extract_path_preserving_query, same_origin

bp = Blueprint("shortener", __name__)


@bp.post("/api/shorten")
def api_shorten():
    r = get_redis()
    data = request.get_json(silent=True) or {}
    raw = (data.get("url") or "").strip()
    if not raw:
        return jsonify(error="url is required"), 400

    if not same_origin(request, raw):
        return jsonify(error="only same-origin URLs are allowed"), 400

    cfg = current_app.config
    ttl = cfg["SHORT_TTL_SECONDS"]
    prefix = cfg["SHORT_KEY_PREFIX"]
    code_len = cfg["SHORT_CODE_LEN"]

    path = extract_path_preserving_query(raw)

    for _ in range(8):
        code = new_code(code_len)
        key = prefix + code
        ok = r.set(key, path, ex=ttl, nx=True)
        if ok:
            short_path = url_for("shortener.redirect_short", code=code)
            return jsonify(code=code, short_url=short_path, path=path), 201

    return jsonify(error="could not allocate short code, try again"), 503


@bp.get("/s/<code>")
def redirect_short(code: str):
    r = get_redis()
    cfg = current_app.config
    ttl = cfg["SHORT_TTL_SECONDS"]
    prefix = cfg["SHORT_KEY_PREFIX"]

    key = prefix + code
    path = r.get(key)
    if not path:
        abort(404)

    r.expire(key, ttl)
    return redirect(path, code=302)
