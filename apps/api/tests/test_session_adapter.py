from app.auth.dependencies import get_auth_adapter
from app.auth.dev_adapter import DevAdapter


def test_session_adapter_is_jwt_in_all_envs(monkeypatch):
    monkeypatch.setattr("app.config.settings.environment", "prod")
    assert isinstance(get_auth_adapter(), DevAdapter)  # JWT maison, pas Firebase
