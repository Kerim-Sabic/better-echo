from app.core.config import Settings


def _make_settings(monkeypatch, cors_origin: str) -> Settings:
    monkeypatch.setenv("CORS_ORIGIN", cors_origin)
    monkeypatch.setenv("ORTHANC_URL", "http://localhost:8042")
    monkeypatch.setenv("ORTHANC_USER", "orthanc")
    monkeypatch.setenv("ORTHANC_PASS", "orthanc")
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.setenv("TOKEN_EXPIRE_HOURS", "4")
    return Settings(_env_file=None)


def test_cors_origin_accepts_json_list_with_inline_comment(monkeypatch):
    settings = _make_settings(
        monkeypatch,
        '["http://localhost:3000", "http://192.168.1.68:3000"] #frontend',
    )

    assert settings.CORS_ORIGIN == [
        "http://localhost:3000",
        "http://192.168.1.68:3000",
    ]


def test_cors_origin_accepts_comma_separated_values(monkeypatch):
    settings = _make_settings(
        monkeypatch,
        "http://localhost:3000, http://192.168.1.68:3000",
    )

    assert settings.CORS_ORIGIN == [
        "http://localhost:3000",
        "http://192.168.1.68:3000",
    ]
