import types

import torch

from app.helpers.inference_runtime import precision


def _fake_settings(**overrides):
    base = {
        "INFERENCE_AMP_ENABLED": True,
        "INFERENCE_AMP_DTYPE": "float16",
        "INFERENCE_CHANNELS_LAST": True,
        "INFERENCE_CUDNN_BENCHMARK": True,
        "INFERENCE_ALLOW_TF32": True,
    }
    base.update(overrides)
    return types.SimpleNamespace(**base)


def test_cpu_paths_are_noops_and_never_touch_settings(monkeypatch):
    # If any CPU-path helper reads settings, this would blow up.
    def _boom():
        raise AssertionError("settings must not be read on the CPU path")

    monkeypatch.setattr(precision, "_settings", _boom)
    cpu = torch.device("cpu")

    assert precision.amp_enabled(cpu) is False
    assert precision.channels_last_enabled(cpu) is False
    precision.configure_backends(cpu)  # no-op, no raise

    model = torch.nn.Conv2d(3, 1, 3)
    assert precision.to_channels_last(model, cpu) is model

    tensor = torch.zeros(1, 3, 8, 8)
    assert precision.as_channels_last(tensor, cpu) is tensor

    report = precision.describe(cpu)
    assert report.amp is False
    assert report.dtype == "float32"
    assert report.channels_last is False
    assert report.cudnn_benchmark is False


def test_autocast_cpu_is_a_real_noop_context(monkeypatch):
    monkeypatch.setattr(precision, "_settings", lambda: _fake_settings())
    with precision.autocast(torch.device("cpu")):
        x = torch.ones(2, 2) * 3
    assert x.dtype == torch.float32


def test_amp_dtype_parsing(monkeypatch):
    monkeypatch.setattr(precision, "_settings", lambda: _fake_settings(INFERENCE_AMP_DTYPE="bfloat16"))
    assert precision.amp_dtype() is torch.bfloat16

    monkeypatch.setattr(precision, "_settings", lambda: _fake_settings(INFERENCE_AMP_DTYPE="fp16"))
    assert precision.amp_dtype() is torch.float16

    monkeypatch.setattr(precision, "_settings", lambda: _fake_settings(INFERENCE_AMP_DTYPE="garbage"))
    assert precision.amp_dtype() is torch.float16


def test_autocast_respects_explicit_enabled_false(monkeypatch):
    monkeypatch.setattr(precision, "_settings", lambda: _fake_settings())
    ctx = precision.autocast(torch.device("cpu"), enabled=False)
    # nullcontext has no __enter__ side effects
    with ctx:
        pass


def test_describe_dict_roundtrip():
    report = precision.describe(torch.device("cpu"))
    d = report.as_dict()
    assert set(d) == {"device", "amp", "dtype", "channels_last", "cudnn_benchmark"}
