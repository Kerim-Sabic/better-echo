import pytest

from app.services.auth.webauthn.state import (
    assert_webauthn_state_runtime_safe,
    get_configured_worker_count,
)


def test_get_configured_worker_count_defaults_to_single():
    # --- Step 1: Resolve worker count from empty environment ---
    worker_count = get_configured_worker_count({})

    # --- Step 2: Assert default single-process fallback ---
    assert worker_count == 1


def test_get_configured_worker_count_reads_web_concurrency():
    # --- Step 1: Resolve worker count from WEB_CONCURRENCY ---
    worker_count = get_configured_worker_count({"WEB_CONCURRENCY": "3"})

    # --- Step 2: Assert parsed integer value ---
    assert worker_count == 3


def test_get_configured_worker_count_parses_gunicorn_args():
    # --- Step 1: Resolve worker count from GUNICORN_CMD_ARGS ---
    worker_count = get_configured_worker_count({"GUNICORN_CMD_ARGS": "--bind 0.0.0.0:8000 --workers=4"})

    # --- Step 2: Assert parsed workers value ---
    assert worker_count == 4


def test_assert_webauthn_state_runtime_safe_allows_single_worker_memory():
    # --- Step 1: Validate in-memory backend with single worker ---
    assert_webauthn_state_runtime_safe(
        state_backend="memory",
        require_single_process=True,
        env={"WEB_CONCURRENCY": "1"},
    )


def test_assert_webauthn_state_runtime_safe_rejects_multi_worker_memory():
    # --- Step 1: Validate in-memory backend with multi-worker env ---
    with pytest.raises(RuntimeError):
        assert_webauthn_state_runtime_safe(
            state_backend="memory",
            require_single_process=True,
            env={"WEB_CONCURRENCY": "2"},
        )


def test_assert_webauthn_state_runtime_safe_allows_multi_worker_shared_backend():
    # --- Step 1: Validate shared state backend under multi-worker env ---
    assert_webauthn_state_runtime_safe(
        state_backend="redis",
        require_single_process=True,
        env={"WEB_CONCURRENCY": "4"},
    )
