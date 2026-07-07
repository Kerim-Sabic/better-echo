import numpy as np
import torch

from app.helpers.inference_runtime.adaptive_batch import is_cuda_oom, run_adaptive_batches


def test_covers_all_items_in_order_without_oom():
    seen = []

    def run_batch(start, end):
        seen.append((start, end))
        return np.arange(start, end)

    results = list(
        run_adaptive_batches(
            10, 4, run_batch, device=torch.device("cpu"), label="test"
        )
    )
    assert seen == [(0, 4), (4, 8), (8, 10)]
    reconstructed = np.concatenate([r for _, _, r in results])
    np.testing.assert_array_equal(reconstructed, np.arange(10))


def test_non_oom_error_propagates():
    def run_batch(start, end):
        raise ValueError("boom")

    try:
        list(run_adaptive_batches(4, 2, run_batch, device=torch.device("cpu")))
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_cuda_oom_halves_batch_and_retries():
    # Simulate a device that reports CUDA and OOMs above batch size 2.
    device = torch.device("cuda")
    attempts = []

    def run_batch(start, end):
        attempts.append((start, end))
        if end - start > 2:
            raise RuntimeError("CUDA out of memory. Tried to allocate ...")
        return list(range(start, end))

    # is_cuda check inside the runner uses device.type == "cuda"; on a CPU-only
    # host torch.cuda.empty_cache() is a guarded no-op, so this still exercises
    # the shrink-and-retry control flow.
    results = list(
        run_adaptive_batches(6, 8, run_batch, device=device, min_batch_size=1)
    )
    covered = [idx for _, _, chunk in results for idx in chunk]
    assert covered == list(range(6))
    # First attempt at batch 8 (=whole range) OOMs, shrinks to 4, OOMs, then 2.
    assert attempts[0] == (0, 6)
    assert any((end - start) <= 2 for start, end in attempts)


def test_is_cuda_oom_detects_message():
    assert is_cuda_oom(RuntimeError("CUDA out of memory")) is True
    assert is_cuda_oom(RuntimeError("some other error")) is False
    assert is_cuda_oom(ValueError("out of memory")) is False
