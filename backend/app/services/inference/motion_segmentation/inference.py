from __future__ import annotations

import logging
import os
import time
from collections import OrderedDict
from typing import Iterator

import cv2
import numpy as np
import torch

from app.core.runtime_paths import ensure_model_assets_available, model_asset_path
from app.helpers.inference_runtime.device_selector import get_device_for_model

logger = logging.getLogger(__name__)

model = None
device: torch.device | None = None

MODEL_INPUT_SIZE = (112, 112)


def checkpoint_path() -> str:
    return os.path.normpath(str(model_asset_path("motion_segmentation", "checkpoint")))


def load_motion_segmentation_model():
    """Lazy-load the singleton LV segmentation model."""
    global model, device
    if model is not None:
        return model

    import torchvision

    ensure_model_assets_available("motion_segmentation", ("checkpoint",))

    if device is None:
        device = get_device_for_model("motion_segmentation")

    start = time.time()
    model_instance = torchvision.models.segmentation.deeplabv3_resnet50(
        weights=None
    )
    model_instance.classifier[-1] = torch.nn.Conv2d(
        model_instance.classifier[-1].in_channels,
        1,
        kernel_size=model_instance.classifier[-1].kernel_size,
    )
    try:
        checkpoint = torch.load(
            checkpoint_path(),
            map_location=device,
            weights_only=True,
        )
    except TypeError:
        checkpoint = torch.load(checkpoint_path(), map_location=device)

    state_dict = checkpoint["state_dict"]
    normalized_state_dict = OrderedDict()
    for key, value in state_dict.items():
        normalized_key = key
        if normalized_key.startswith("module."):
            normalized_key = normalized_key[len("module.") :]
        if normalized_key.startswith("model."):
            normalized_key = normalized_key[len("model.") :]
        normalized_state_dict[normalized_key] = value

    model_instance.load_state_dict(normalized_state_dict, strict=False)
    model_instance.to(device)
    model_instance.eval()
    model = model_instance
    logger.info(
        "[MotionSegmentation] Model loaded on %s in %.1fs",
        device,
        time.time() - start,
    )
    return model


def unload_motion_segmentation_model() -> None:
    """Unload the singleton LV segmentation model."""
    global model
    if model is not None:
        del model
        model = None
        torch.cuda.empty_cache()


def get_active_device() -> torch.device | None:
    return device


def iter_lv_probabilities(
    frames: list[np.ndarray],
    target_device: torch.device,
    batch_size: int,
) -> Iterator[np.ndarray]:
    """Yield one foreground probability map per source frame."""
    global device
    from torchvision.transforms import functional as F

    if device is not None and device != target_device:
        unload_motion_segmentation_model()
    device = target_device

    model_instance = load_motion_segmentation_model()
    total = len(frames)
    start_time = time.time()

    for batch_start in range(0, total, batch_size):
        batch_frames = frames[batch_start : batch_start + batch_size]
        tensors = []
        for frame in batch_frames:
            img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            resized = cv2.resize(
                img_rgb,
                MODEL_INPUT_SIZE,
                interpolation=cv2.INTER_LINEAR,
            )
            tensors.append(F.to_tensor(resized))

        batch_tensor = torch.stack(tensors).to(target_device)
        with torch.no_grad():
            logits = model_instance(batch_tensor)["out"][:, 0]
            probabilities = torch.sigmoid(logits).cpu().numpy().astype(np.float32)

        for local_idx in range(probabilities.shape[0]):
            global_idx = batch_start + local_idx + 1
            if (
                global_idx <= 5
                or global_idx % max(10, batch_size) == 0
                or global_idx == total
            ):
                logger.info(
                    "[MotionSegmentation] Inferred %d/%d frames (%.1fs, device=%s)",
                    global_idx,
                    total,
                    time.time() - start_time,
                    target_device.type,
                )
            yield probabilities[local_idx]


__all__ = [
    "MODEL_INPUT_SIZE",
    "checkpoint_path",
    "get_active_device",
    "iter_lv_probabilities",
    "load_motion_segmentation_model",
    "unload_motion_segmentation_model",
]
