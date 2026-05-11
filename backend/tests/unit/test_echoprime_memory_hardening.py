from types import SimpleNamespace

import numpy as np
import torch

from app.AI_models.EchoPrime.echo_prime import model as echoprime_model
from app.AI_models.EchoPrime.echo_prime.model import EchoPrime


def _lightweight_echoprime() -> EchoPrime:
    ep = EchoPrime.__new__(EchoPrime)
    ep.frames_to_take = 16
    ep.frame_stride = 1
    ep.video_size = 224
    ep.mean = torch.zeros((3, 1, 1, 1), dtype=torch.float32)
    ep.std = torch.ones((3, 1, 1, 1), dtype=torch.float32)
    ep.device = torch.device("cpu")
    return ep


def _patch_pixels(monkeypatch, pixels) -> None:
    monkeypatch.setattr(
        echoprime_model.pydicom,
        "dcmread",
        lambda _path: SimpleNamespace(pixel_array=pixels),
    )
    monkeypatch.setattr(
        echoprime_model.utils,
        "mask_outside_ultrasound",
        lambda value: value,
    )
    monkeypatch.setattr(
        echoprime_model.utils,
        "crop_and_scale",
        lambda frame: np.full((224, 224, 3), float(np.mean(frame)), dtype=np.float32),
    )


def test_process_dicom_file_samples_long_cine_evenly(monkeypatch, tmp_path):
    ep = _lightweight_echoprime()
    pixels = np.arange(32, dtype=np.float32).reshape(32, 1, 1)
    _patch_pixels(monkeypatch, pixels)

    output = ep.process_dicom_file(str(tmp_path / "long.dcm"))

    assert output.shape == (3, 16, 224, 224)
    sampled_values = [float(output[0, idx, 0, 0]) for idx in range(16)]
    assert sampled_values[0] == 0.0
    assert sampled_values[-1] == 31.0
    assert len(set(sampled_values)) == 16


def test_process_dicom_file_repeats_short_cine_last_frame(monkeypatch, tmp_path):
    ep = _lightweight_echoprime()
    pixels = np.arange(3, dtype=np.float32).reshape(3, 1, 1)
    _patch_pixels(monkeypatch, pixels)

    output = ep.process_dicom_file(str(tmp_path / "short.dcm"))

    assert output.shape == (3, 16, 224, 224)
    assert float(output[0, 0, 0, 0]) == 0.0
    assert float(output[0, 2, 0, 0]) == 2.0
    assert float(output[0, 15, 0, 0]) == 2.0


def test_process_dicom_file_repeats_still_image(monkeypatch, tmp_path):
    ep = _lightweight_echoprime()
    pixels = np.full((2, 2), 7, dtype=np.float32)
    _patch_pixels(monkeypatch, pixels)

    output = ep.process_dicom_file(str(tmp_path / "still.dcm"))

    assert output.shape == (3, 16, 224, 224)
    assert all(float(output[0, idx, 0, 0]) == 7.0 for idx in range(16))


def test_metrics_accumulator_is_chunk_additive():
    ep = _lightweight_echoprime()
    ep.non_empty_sections = ["section-a", "section-b"]
    ep.section_weights = np.zeros((2, 11), dtype=np.float32)
    ep.section_weights[0, 0] = 1.0
    ep.section_weights[0, 1] = 2.0
    ep.section_weights[1, :] = 0.5

    features = torch.zeros((2, 512), dtype=torch.float32)
    features[0, 0] = 1.0
    features[1, 0] = 2.0
    views = torch.nn.functional.one_hot(torch.tensor([0, 1]), num_classes=11).float()
    encoded = torch.cat((features, views), dim=1)

    whole = ep.accumulate_study_embedding(ep.create_metrics_accumulator(), encoded)
    chunked = ep.create_metrics_accumulator()
    chunked = ep.accumulate_study_embedding(chunked, encoded[:1])
    chunked = ep.accumulate_study_embedding(chunked, encoded[1:])

    assert torch.equal(whole, chunked)
    assert float(whole[0, 0]) == 5.0
    assert float(whole[1, 0]) == 1.5
