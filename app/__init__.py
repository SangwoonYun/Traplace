from flask import Flask

from .config import get_config
from .extensions import init_extensions
from .routes.core import bp as core_bp
from .routes.shortener import bp as shortener_bp


def create_app(config_name: str | None = None) -> Flask:
    app = Flask(__name__, template_folder="templates")
    app.config.from_object(get_config(config_name))

    init_extensions(app)

    app.register_blueprint(core_bp)
    app.register_blueprint(shortener_bp)

    return app
