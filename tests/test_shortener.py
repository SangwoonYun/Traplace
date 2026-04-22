# File: tests/test_shortener.py
"""Tests for URL shortener routes: POST /api/shorten and GET /s/<code>."""

import json


def shorten(client, url):
    return client.post(
        '/api/shorten',
        data=json.dumps({'url': url}),
        content_type='application/json',
    )


class TestApiShorten:
    def test_rejects_missing_url(self, client):
        r = client.post('/api/shorten', json={})
        assert r.status_code == 400
        assert 'error' in r.get_json()

    def test_rejects_empty_url(self, client):
        r = client.post('/api/shorten', json={'url': ''})
        assert r.status_code == 400

    def test_rejects_cross_origin_url(self, client):
        r = shorten(client, 'https://evil.example.com/path')
        assert r.status_code == 400
        assert 'same-origin' in r.get_json()['error']

    def test_rejects_url_over_8190_chars(self, client):
        long_url = 'http://localhost/' + 'a' * 8200
        r = shorten(client, long_url)
        assert r.status_code == 400
        assert 'too long' in r.get_json()['error']

    def test_accepts_relative_path(self, client):
        r = shorten(client, '/?v=2&b=B1%402%2C3')
        assert r.status_code == 201
        data = r.get_json()
        assert 'code' in data
        assert 'short_url' in data

    def test_accepts_same_origin_absolute_url(self, client):
        r = shorten(client, 'http://localhost/?v=2&b=test')
        assert r.status_code == 201

    def test_returns_existing_code_on_duplicate(self, client):
        path = '/?v=2&b=duplicate'
        r1 = shorten(client, path)
        r2 = shorten(client, path)
        assert r1.status_code == 201
        assert r2.status_code == 200
        assert r1.get_json()['code'] == r2.get_json()['code']

    def test_response_contains_path(self, client):
        r = shorten(client, '/?v=2&b=xyz')
        data = r.get_json()
        assert 'path' in data
        assert data['path'].startswith('/')

    def test_short_url_is_relative_path(self, client):
        r = shorten(client, '/?v=2&b=abc')
        data = r.get_json()
        assert data['short_url'].startswith('/s/')


class TestRedirectShort:
    def test_redirects_to_stored_path(self, client):
        r = shorten(client, '/?v=2&b=redirect-test')
        code = r.get_json()['code']

        r2 = client.get(f'/s/{code}')
        assert r2.status_code == 302
        assert r2.headers['Location'].startswith('/')

    def test_unknown_code_returns_404(self, client):
        r = client.get('/s/NOTEXIST')
        assert r.status_code == 404

    def test_redirect_extends_ttl(self, client, fake_redis):
        r = shorten(client, '/?v=2&b=ttl-check')
        code = r.get_json()['code']
        prefix = 'su:'
        key = prefix + code

        ttl_before = fake_redis.ttl(key)
        client.get(f'/s/{code}')
        ttl_after = fake_redis.ttl(key)

        assert ttl_after >= ttl_before - 1

    def test_tampered_redis_path_rejected(self, client, fake_redis):
        """Defense-in-depth: path containing scheme must be rejected."""
        fake_redis.set('su:BADCODE', 'javascript://evil', ex=3600)
        r = client.get('/s/BADCODE')
        assert r.status_code == 400
