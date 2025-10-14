import os

from app import create_app

if __name__ == "__main__":
    host = os.getenv("host", "0.0.0.0")
    port = int(os.getenv("port", 5000))
    env = os.getenv("ENV")
    app = create_app(env)
    app.run(host=host, port=port, debug=app.config.get("DEBUG", False))
