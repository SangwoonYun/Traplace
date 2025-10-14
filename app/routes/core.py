from flask import Blueprint, render_template, jsonify

bp = Blueprint("core", __name__)


@bp.get("/")
def index():
    return render_template("index.html")


@bp.get("/healthz")
def healthz():
    return jsonify(status="ok")
