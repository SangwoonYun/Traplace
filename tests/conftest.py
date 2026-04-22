# File: tests/conftest.py
import fakeredis
import pytest
from app import create_app


@pytest.fixture()
def app(monkeypatch):
    """Create a test Flask app backed by fakeredis."""
    application = create_app('testing')

    fake_r = fakeredis.FakeRedis(decode_responses=True)
    application.extensions['redis'] = fake_r

    yield application


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def fake_redis(app):
    """Direct access to the fakeredis instance used by the app."""
    return app.extensions['redis']
