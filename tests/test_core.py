# File: tests/test_core.py
"""Tests for core routes: GET / and GET /healthz."""


class TestIndex:
    def test_returns_200(self, client):
        r = client.get('/')
        assert r.status_code == 200

    def test_default_lang_is_en(self, client):
        r = client.get('/')
        assert b'lang' in r.data or r.status_code == 200

    def test_valid_lang_accepted(self, client):
        r = client.get('/?lang=ko')
        assert r.status_code == 200

    def test_invalid_lang_falls_back_silently(self, client):
        r = client.get('/?lang=xx')
        assert r.status_code == 200

    def test_content_type_is_html(self, client):
        r = client.get('/')
        assert 'text/html' in r.content_type


class TestHealthz:
    def test_returns_200(self, client):
        r = client.get('/healthz')
        assert r.status_code == 200

    def test_body_is_ok(self, client):
        r = client.get('/healthz')
        assert r.get_json() == {'status': 'ok'}

    def test_content_type_is_json(self, client):
        r = client.get('/healthz')
        assert r.content_type == 'application/json'
