"""
Central mixed-precision / accelerator-tuning helpers for the inference runtime.

Every GPU inference path routes precision decisions through this module so the
behaviour is consistent, centrally configurable, and safe by construction:

* ``autocast(device)`` yields a ``torch.autocast`` FP16 (or BF16) context on
  CUDA when enabled and supported, and a no-op context everywhere else. This is
  the single switch that turns Automatic Mixed Precision on/off.
* ``configure_backends(device)`` enables ``cudnn.benchmark`` (and TF32) once per
  process when input shapes are stable, and is a no-op on CPU.
* ``to_channels_last`` / ``as_channels_last`` move CNN weights and 4-D inputs to
  the channels-last memory format, which the FP16 tensor-core kernels prefer.

All helpers fail open: any capability probe that raises is treated as
"unsupported" and the caller transparently continues in FP32 / contiguous
format. Nothing here changes numerics on CPU, so the existing CPU fallback path
is bit-for-bit unchanged.
"""

from __future__ import annotations

import contextlib
import logging
import threading
from dataclasses import dataclass
from typing import Any, ContextManager, Optional

import torch

logger = logging.getLogger(__name__)

_configured_devices: set[str] = set()
_configure_lock = threading.Lock()

_DTYPE_ALIASES = {
    "float16": torch.float16,
    "fp16": torch.float16,
    "half": torch.float16,
    "bfloat16": torch.bfloat16,
    "bf16": torch.bfloat16,
}


def _settings() -> Any:
    """Fetch the live settings object, tolerating import-time edge cases."""
    from app.core.config import settings

    return settings


def _flag(name: str, default: bool) -> bool:
    try:
        return bool(getattr(_settings(), name, default))
    except Exception:
        return default


def amp_dtype() -> torch.dtype:
    """Resolve the configured autocast dtype, defaulting to FP16."""
    try:
        raw = str(getattr(_settings(), "INFERENCE_AMP_DTYPE", "float16")).strip().lower()
    except Exception:
        raw = "float16"
    return _DTYPE_ALIASES.get(raw, torch.float16)


def _as_device(device: Any) -> torch.device:
    if isinstance(device, torch.device):
        return device
    return torch.device(device) if device is not None else torch.device("cpu")


def amp_enabled(device: Any, *, setting_name: str = "INFERENCE_AMP_ENABLED") -> bool:
    """
    Decide whether autocast should be active for ``device``.

    True only when the device is CUDA, the master toggle (or the lane-specific
    ``setting_name``) is on, and the requested dtype is actually supported by the
    hardware. Everything else falls back to FP32.
    """
    dev = _as_device(device)
    if dev.type != "cuda" or not torch.cuda.is_available():
        return False
    if not _flag(setting_name, True):
        return False
    dtype = amp_dtype()
    if dtype is torch.bfloat16:
        try:
            if not torch.cuda.is_bf16_supported():
                return False
        except Exception:
            return False
    return True


def autocast(
    device: Any,
    *,
    setting_name: str = "INFERENCE_AMP_ENABLED",
    enabled: Optional[bool] = None,
) -> ContextManager[Any]:
    """
    Return an autocast context for ``device``.

    On CUDA with AMP enabled this is ``torch.autocast("cuda", dtype=fp16)``.
    On CPU, or when AMP is disabled/unsupported, this is a no-op context so the
    call site stays identical across the fast path and the FP32 fallback.
    """
    use_amp = amp_enabled(device, setting_name=setting_name) if enabled is None else bool(enabled)
    if not use_amp:
        return contextlib.nullcontext()
    return torch.autocast(device_type="cuda", dtype=amp_dtype(), enabled=True)


def configure_backends(device: Any) -> None:
    """
    Enable cuDNN autotuning (and TF32) once per CUDA device.

    ``cudnn.benchmark`` lets cuDNN pick the fastest convolution algorithm for a
    given input shape; it pays off precisely because the inference input shapes
    here are fixed (112x112 for motion segmentation, 640x480 for measurements).
    Idempotent and CPU-safe. Gated behind ``INFERENCE_CUDNN_BENCHMARK`` so a
    strict-determinism deployment can turn algorithm autotuning off.
    """
    dev = _as_device(device)
    if dev.type != "cuda" or not torch.cuda.is_available():
        return
    marker = str(dev)
    if marker in _configured_devices:
        return
    with _configure_lock:
        if marker in _configured_devices:
            return
        try:
            if _flag("INFERENCE_CUDNN_BENCHMARK", True):
                torch.backends.cudnn.benchmark = True
            if _flag("INFERENCE_ALLOW_TF32", True):
                torch.backends.cuda.matmul.allow_tf32 = True
                torch.backends.cudnn.allow_tf32 = True
            logger.info(
                "[Precision] Configured CUDA backends on %s | cudnn.benchmark=%s tf32=%s amp_dtype=%s",
                marker,
                torch.backends.cudnn.benchmark,
                torch.backends.cuda.matmul.allow_tf32,
                amp_dtype(),
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("[Precision] Could not configure CUDA backends: %s", exc)
        finally:
            _configured_devices.add(marker)


def channels_last_enabled(device: Any) -> bool:
    dev = _as_device(device)
    if dev.type != "cuda":
        return False
    return _flag("INFERENCE_CHANNELS_LAST", True)


def to_channels_last(model: torch.nn.Module, device: Any) -> torch.nn.Module:
    """
    Convert a CNN model's weights to channels-last when running on CUDA.

    channels-last is the memory layout the FP16 tensor-core convolution kernels
    are optimised for. Safe no-op on CPU or when disabled; returns the same
    module object.
    """
    if not channels_last_enabled(device):
        return model
    try:
        model.to(memory_format=torch.channels_last)
        logger.debug("[Precision] Model converted to channels_last")
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("[Precision] channels_last model conversion skipped: %s", exc)
    return model


def as_channels_last(tensor: torch.Tensor, device: Any) -> torch.Tensor:
    """Return a channels-last view of a 4-D NCHW input tensor when enabled."""
    if not channels_last_enabled(device):
        return tensor
    if tensor.dim() != 4:
        return tensor
    try:
        return tensor.contiguous(memory_format=torch.channels_last)
    except Exception:  # pragma: no cover - defensive
        return tensor


@dataclass(frozen=True)
class PrecisionReport:
    device: str
    amp: bool
    dtype: str
    channels_last: bool
    cudnn_benchmark: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "device": self.device,
            "amp": self.amp,
            "dtype": self.dtype,
            "channels_last": self.channels_last,
            "cudnn_benchmark": self.cudnn_benchmark,
        }


def describe(device: Any, *, setting_name: str = "INFERENCE_AMP_ENABLED") -> PrecisionReport:
    """Snapshot of the effective precision config for a device (for logs/reports)."""
    dev = _as_device(device)
    amp = amp_enabled(dev, setting_name=setting_name)
    return PrecisionReport(
        device=str(dev),
        amp=amp,
        dtype=str(amp_dtype()).replace("torch.", "") if amp else "float32",
        channels_last=channels_last_enabled(dev),
        cudnn_benchmark=(
            dev.type == "cuda"
            and torch.cuda.is_available()
            and _flag("INFERENCE_CUDNN_BENCHMARK", True)
        ),
    )


def reset_backend_configuration_for_tests() -> None:
    """Test hook: forget which devices were already configured."""
    with _configure_lock:
        _configured_devices.clear()


__all__ = [
    "PrecisionReport",
    "amp_dtype",
    "amp_enabled",
    "as_channels_last",
    "autocast",
    "channels_last_enabled",
    "configure_backends",
    "describe",
    "reset_backend_configuration_for_tests",
    "to_channels_last",
]
