# File: app/utils/shortener.py
"""
URL shortener utility functions.

Provides helper functions for generating short codes, validating URL origins,
and preserving query strings during path extraction.
"""

import secrets
from urllib.parse import urlparse

from flask import Request

_BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'


def to_base62(n: int) -> str:
    """Convert an integer to a Base62 string."""
    if n == 0:
        return _BASE62[0]

    digits: list[str] = []
    while n > 0:
        n, rem = divmod(n, 62)
        digits.append(_BASE62[rem])
    return ''.join(reversed(digits))


def new_code(code_len: int) -> str:
    """Generate a random Base62 short code of fixed length.

    Uses 48 random bits, encoded in Base62, padded or truncated
    to the requested length.
    """
    code = to_base62(secrets.randbits(48))
    code = (
        _BASE62[0] * (code_len - len(code)) + code
        if len(code) < code_len
        else code[:code_len]
    )
    return code


def origin_of(req: Request) -> str:
    """Return the origin (scheme + host) of the given Flask request."""
    return f'{req.scheme}://{req.host}'


def extract_path_preserving_query(target: str) -> str:
    """Extract a relative path and preserve its query string from a URL."""
    if target.startswith('/'):
        return target

    parsed = urlparse(target)
    path = parsed.path or '/'
    if parsed.query:
        path += f'?{parsed.query}'
    return path


def same_origin(req: Request, target_url: str) -> bool:
    """Check if the target URL has the same origin as the given request."""
    if target_url.startswith('/'):
        return True

    parsed = urlparse(target_url)
    if not parsed.scheme or not parsed.netloc:
        return False

    return f'{parsed.scheme}://{parsed.netloc}' == origin_of(req)
