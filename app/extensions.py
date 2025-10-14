# app/extensions.py
import redis
from flask import Flask, current_app

_EXT_KEY = "redis"  # current_app.extensions에 등록될 키


def init_extensions(app: Flask) -> None:
    """앱 부팅 시 1회 초기화. 앱 컨텍스트 확장 슬롯에 등록."""
    client = redis.Redis.from_url(app.config["REDIS_URL"], decode_responses=True)
    # extensions dict 준비
    if not hasattr(app, "extensions") or app.extensions is None:
        app.extensions = {}
    app.extensions[_EXT_KEY] = client


def get_redis():
    """
    항상 이 함수로 redis 클라이언트를 가져오세요.
    - 정상: app.extensions['redis'] 사용
    - 예외: 초기화 안 됐으면 lazy init (config 기반)
    """
    exts = getattr(current_app, "extensions", {}) or {}
    client = exts.get(_EXT_KEY)
    if client is None:
        # lazy init (개발 환경에서 import 순서 문제 방어)
        client = redis.Redis.from_url(current_app.config["REDIS_URL"], decode_responses=True)
        # 슬롯에 꽂아둬서 이후부터는 재사용
        if not hasattr(current_app, "extensions") or current_app.extensions is None:
            current_app.extensions = {}
        current_app.extensions[_EXT_KEY] = client
    return client
