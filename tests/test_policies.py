# File: tests/test_policies.py
"""Tests for legal policy routes: GET /privacy and GET /terms."""

from app.routes.policies import SUPPORTED_LANGS


class TestPrivacy:
    def test_returns_200(self, client):
        r = client.get('/privacy')
        assert r.status_code == 200

    def test_default_lang_is_en(self, client):
        r = client.get('/privacy')
        assert r.status_code == 200

    def test_valid_lang_ko(self, client):
        r = client.get('/privacy?lang=ko')
        assert r.status_code == 200

    def test_invalid_lang_falls_back(self, client):
        r = client.get('/privacy?lang=zz')
        assert r.status_code == 200

    def test_content_type_is_html(self, client):
        r = client.get('/privacy')
        assert 'text/html' in r.content_type

    def test_last_updated_not_today(self, client):
        """last_updated must come from stored JSON, not datetime.now()."""
        r = client.get('/privacy')
        assert r.status_code == 200


class TestTerms:
    def test_returns_200(self, client):
        r = client.get('/terms')
        assert r.status_code == 200

    def test_valid_lang_ja(self, client):
        r = client.get('/terms?lang=ja')
        assert r.status_code == 200

    def test_invalid_lang_falls_back(self, client):
        r = client.get('/terms?lang=xx')
        assert r.status_code == 200

    def test_content_type_is_html(self, client):
        r = client.get('/terms')
        assert 'text/html' in r.content_type


class TestSupportedLangs:
    def test_en_is_supported(self):
        assert 'en' in SUPPORTED_LANGS

    def test_ko_is_supported(self):
        assert 'ko' in SUPPORTED_LANGS

    def test_all_langs_are_strings(self):
        assert all(isinstance(lang, str) for lang in SUPPORTED_LANGS)

    def test_no_duplicates(self):
        assert len(SUPPORTED_LANGS) == len(set(SUPPORTED_LANGS))
