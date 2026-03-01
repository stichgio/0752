import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import _get_cors_allowed_origins  # pyre-ignore[21]


def _clear_cors_env(monkeypatch):
    monkeypatch.delenv("CORS_ALLOWED_ORIGINS", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)


def test_uses_legacy_cors_origins_variable(monkeypatch):
    _clear_cors_env(monkeypatch)
    monkeypatch.setenv("CORS_ORIGINS", "https://a.com, https://b.com")
    assert _get_cors_allowed_origins() == ["https://a.com", "https://b.com"]


def test_prefers_cors_allowed_origins_over_legacy(monkeypatch):
    _clear_cors_env(monkeypatch)
    monkeypatch.setenv("CORS_ORIGINS", "https://legacy.com")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://new.com")
    assert _get_cors_allowed_origins() == ["https://new.com"]


def test_wildcard_is_filtered_in_non_dev(monkeypatch):
    _clear_cors_env(monkeypatch)
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://app.example,*")
    assert _get_cors_allowed_origins() == ["https://app.example"]


def test_wildcard_allowed_in_dev(monkeypatch):
    _clear_cors_env(monkeypatch)
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "*")
    assert _get_cors_allowed_origins() == ["*"]
