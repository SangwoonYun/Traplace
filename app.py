from pathlib import Path
from flask import Flask, render_template

BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

if __name__ == "__main__":
    app.run("0.0.0.0", 5000, debug=True)

