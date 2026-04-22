# File: tests/test_utils_shortener.py
"""Unit tests for app/utils/shortener.py (no Flask context needed)."""

from app.utils.shortener import extract_path_preserving_query, new_code, same_origin, to_base62


class TestToBase62:
    def test_zero(self):
        assert to_base62(0) == '0'

    def test_single_digit(self):
        assert to_base62(9) == '9'

    def test_ten(self):
        assert to_base62(10) == 'A'

    def test_sixty_one(self):
        assert to_base62(61) == 'z'

    def test_sixty_two(self):
        assert to_base62(62) == '10'

    def test_large_number(self):
        result = to_base62(2**24)
        assert isinstance(result, str)
        assert len(result) > 0


class TestNewCode:
    def test_returns_correct_length(self):
        code = new_code(8)
        assert len(code) == 8

    def test_different_codes_generated(self):
        codes = {new_code(8) for _ in range(20)}
        assert len(codes) > 1

    def test_only_base62_chars(self):
        import string

        valid = set(string.digits + string.ascii_letters)
        code = new_code(8)
        assert all(c in valid for c in code)

    def test_custom_length(self):
        for length in [4, 8, 12]:
            assert len(new_code(length)) == length


class TestExtractPath:
    def test_relative_path_returned_as_is(self):
        assert extract_path_preserving_query('/foo/bar') == '/foo/bar'

    def test_relative_path_with_query(self):
        assert extract_path_preserving_query('/?v=2&b=test') == '/?v=2&b=test'

    def test_absolute_url_strips_origin(self):
        result = extract_path_preserving_query('http://example.com/foo/bar')
        assert result == '/foo/bar'

    def test_absolute_url_preserves_query(self):
        result = extract_path_preserving_query('http://example.com/?v=2&b=abc')
        assert result == '/?v=2&b=abc'

    def test_no_path_defaults_to_slash(self):
        result = extract_path_preserving_query('http://example.com')
        assert result == '/'


class TestSameOrigin:
    def _mock_request(self, scheme='http', host='localhost'):
        class MockReq:
            pass

        req = MockReq()
        req.scheme = scheme
        req.host = host
        return req

    def test_relative_path_always_same_origin(self):
        req = self._mock_request()
        assert same_origin(req, '/foo/bar') is True

    def test_matching_origin_is_same(self):
        req = self._mock_request('http', 'localhost')
        assert same_origin(req, 'http://localhost/foo') is True

    def test_different_host_is_not_same(self):
        req = self._mock_request('http', 'localhost')
        assert same_origin(req, 'http://evil.com/foo') is False

    def test_different_scheme_is_not_same(self):
        req = self._mock_request('http', 'localhost')
        assert same_origin(req, 'https://localhost/foo') is False

    def test_missing_scheme_in_url_is_not_same(self):
        req = self._mock_request()
        assert same_origin(req, 'localhost/foo') is False
