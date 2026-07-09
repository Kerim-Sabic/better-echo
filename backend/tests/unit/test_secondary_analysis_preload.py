import threading

from app.services.inference import secondary_analysis_service as service


def test_login_warmup_upgrades_an_in_progress_preload(monkeypatch):
    started = threading.Event()
    release = threading.Event()
    model = object()
    preload_calls: list[bool] = []
    warmed_models: list[object] = []

    def fake_preload(*, warmup: bool):
        preload_calls.append(warmup)
        started.set()
        assert release.wait(timeout=1)
        return model

    monkeypatch.setattr(service, "preload_secondary_analysis", fake_preload)
    monkeypatch.setattr(
        service,
        "_warmup_secondary_analysis",
        lambda candidate: warmed_models.append(candidate),
    )

    with service._preload_state_lock:
        service._preload_thread = None
        service._warmup_requested = False
        service._warmup_completed = False

    service.start_secondary_analysis_preload_background(warmup=False)
    assert started.wait(timeout=1)
    service.start_secondary_analysis_preload_background(warmup=True)
    release.set()

    thread = service._preload_thread
    assert thread is not None
    thread.join(timeout=1)

    assert not thread.is_alive()
    assert preload_calls == [False]
    assert warmed_models == [model]

