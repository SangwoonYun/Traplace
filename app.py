import os
from pathlib import Path

from flask import Flask, render_template, jsonify

BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/healthz")
def healthz():
    return jsonify(status="ok")


if __name__ == "__main__":
    host = os.getenv("host", "0.0.0.0")
    port = int(os.getenv("port", 5000))
    debug = os.getenv("debug", "true").lower() == "true"
    app.run(host=host, port=port, debug=debug)
