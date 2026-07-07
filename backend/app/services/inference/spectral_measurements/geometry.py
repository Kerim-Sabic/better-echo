from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Optional

import numpy as np
import pydicom

from app.helpers.doppler.doppler_frame_selection import (
    select_doppler_frame,
    select_doppler_frame_from_pixels,
)
from app.helpers.doppler.doppler_tags import extract_doppler_region

if TYPE_CHECKING:
    from app.helpers.media.frame_cache import DecodedInstance, StudyFrameCache

DOPPLER_INPUTS_RECIPE = "doppler_inputs"


@dataclass(frozen=True)
class DopplerMeasurementInputs:
    image_rgb: np.ndarray
    frame_selection: dict[str, Any]
    region: dict[str, Any]
    frame_width: int
    frame_height: int


def _region_fingerprint(region_override: dict[str, Any] | None) -> str:
    if not isinstance(region_override, dict):
        return "auto"
    canonical = json.dumps(region_override, sort_keys=True, default=str)
    return hashlib.sha1(canonical.encode("utf-8")).hexdigest()[:12]


def _build_doppler_inputs(
    *,
    decoded: "DecodedInstance",
    region_override: dict[str, Any] | None,
) -> DopplerMeasurementInputs:
    region = (
        dict(region_override)
        if isinstance(region_override, dict)
        else extract_doppler_region(decoded.header)
    )
    if not region:
        raise ValueError("No valid spectral ultrasound region found in DICOM.")
    if region.get("y0") is None:
        raise ValueError("Doppler region y0 is missing.")

    image_rgb, frame_selection = select_doppler_frame_from_pixels(
        decoded.pixel_array,
        decoded.photometric,
        decoded.number_of_frames,
        int(region["y0"]),
    )
    frame_height, frame_width = image_rgb.shape[:2]
    return DopplerMeasurementInputs(
        image_rgb=image_rgb,
        frame_selection=frame_selection,
        region=region,
        frame_width=int(frame_width),
        frame_height=int(frame_height),
    )


# Part 1. Load the selected source frame and Doppler region in source-pixel space.
def load_doppler_inputs(
    *,
    input_path: str,
    region_override: dict[str, Any] | None = None,
    cache: Optional["StudyFrameCache"] = None,
) -> DopplerMeasurementInputs:
    if not input_path.lower().endswith(".dcm"):
        raise ValueError("Doppler inference expects a DICOM input.")

    if cache is not None:
        # Frame selection scans the full cine; share it across every Doppler
        # weight run for this instance within the analysis job.
        recipe = f"{DOPPLER_INPUTS_RECIPE}:{_region_fingerprint(region_override)}"
        return cache.get_derived(
            input_path,
            recipe,
            lambda decoded: _build_doppler_inputs(
                decoded=decoded,
                region_override=region_override,
            ),
        )

    ds = pydicom.dcmread(input_path, force=True)
    region = (
        dict(region_override)
        if isinstance(region_override, dict)
        else extract_doppler_region(ds)
    )
    if not region:
        raise ValueError("No valid spectral ultrasound region found in DICOM.")
    if region.get("y0") is None:
        raise ValueError("Doppler region y0 is missing.")

    image_rgb, frame_selection = select_doppler_frame(ds, int(region["y0"]))
    frame_height, frame_width = image_rgb.shape[:2]
    return DopplerMeasurementInputs(
        image_rgb=image_rgb,
        frame_selection=frame_selection,
        region=region,
        frame_width=int(frame_width),
        frame_height=int(frame_height),
    )


def build_reference_line(region: dict[str, Any]) -> dict[str, Any] | None:
    reference_line = region.get("reference_line")
    y0 = region.get("y0")
    if reference_line is None or y0 is None:
        return None
    relative_y = int(reference_line)
    return {
        "y": int(y0) + relative_y,
        "relative_y": relative_y,
        "role": "doppler_baseline",
    }


__all__ = [
    "DOPPLER_INPUTS_RECIPE",
    "DopplerMeasurementInputs",
    "build_reference_line",
    "load_doppler_inputs",
]
