import secrets
from urllib.parse import urlparse

from flask import Request

_BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def to_base62(n: int) -> str:
    if n == 0:
        return _BASE62[0]
    s = []
    while n > 0:
        n, rem = divmod(n, 62)
        s.append(_BASE62[rem])
    return "".join(reversed(s))


def new_code(code_len: int) -> str:
    # 48비트 랜덤을 base62로(최대 8자 충분)
    code = to_base62(secrets.randbits(48))
    if len(code) < code_len:
        code = (_BASE62[0] * (code_len - len(code))) + code
    else:
        code = code[:code_len]
    return code


def origin_of(req: Request) -> str:
    return f"{req.scheme}://{req.host}"


def extract_path_preserving_query(target: str) -> str:
    if target.startswith("/"):
        return target
    parsed = urlparse(target)
    path = parsed.path or "/"
    if parsed.query:
        path += f"?{parsed.query}"
    return path


def same_origin(req: Request, target_url: str) -> bool:
    if target_url.startswith("/"):
        return True
    p = urlparse(target_url)
    if not p.scheme or not p.netloc:
        return False
    return f"{p.scheme}://{p.netloc}" == origin_of(req)
