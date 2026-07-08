import threading
import time

import pytest

from app.helpers.inference_runtime.prefetch import iter_with_prefetch, map_ordered_submit


def test_iter_with_prefetch_preserves_order_and_values():
    out = list(iter_with_prefetch([1, 2, 3, 4], lambda x: x * 10, enabled=True))
    assert out == [10, 20, 30, 40]


def test_iter_with_prefetch_disabled_matches_enabled():
    produce = lambda x: x + 1
    assert list(iter_with_prefetch([1, 2, 3], produce, enabled=False)) == [2, 3, 4]


def test_iter_with_prefetch_handles_empty_and_single():
    assert list(iter_with_prefetch([], lambda x: x, enabled=True)) == []
    assert list(iter_with_prefetch([7], lambda x: x * 2, enabled=True)) == [14]


def test_iter_with_prefetch_produces_next_while_consuming():
    # The producer for item k+1 should start before the consumer finishes item k.
    started = []

    def produce(x):
        started.append((x, time.perf_counter()))
        time.sleep(0.02)
        return x

    gen = iter_with_prefetch([0, 1, 2], produce, enabled=True)
    first = next(gen)  # forces item 0 done and item 1 submitted
    # Give the background worker a moment to begin item 1.
    time.sleep(0.03)
    assert first == 0
    assert len(started) >= 2  # item 1 started while we held item 0
    assert list(gen) == [1, 2]


def test_iter_with_prefetch_propagates_exception_at_that_item():
    def produce(x):
        if x == 2:
            raise ValueError("boom at 2")
        return x

    gen = iter_with_prefetch([1, 2, 3], produce, enabled=True)
    assert next(gen) == 1
    with pytest.raises(ValueError, match="boom at 2"):
        next(gen)


def test_map_ordered_submit_preserves_order():
    def producer():
        for i in range(6):
            yield i

    result = map_ordered_submit(producer(), lambda x: x * x, max_workers=3, enabled=True)
    assert result == [0, 1, 4, 9, 16, 25]


def test_map_ordered_submit_disabled_is_sequential():
    result = map_ordered_submit(iter([1, 2, 3]), lambda x: x + 100, max_workers=4, enabled=False)
    assert result == [101, 102, 103]


def test_map_ordered_submit_runs_concurrently():
    active = {"now": 0, "max": 0}
    lock = threading.Lock()

    def handle(x):
        with lock:
            active["now"] += 1
            active["max"] = max(active["max"], active["now"])
        time.sleep(0.02)
        with lock:
            active["now"] -= 1
        return x

    map_ordered_submit(iter(range(6)), handle, max_workers=3, enabled=True)
    assert active["max"] >= 2  # genuine overlap occurred


def test_map_ordered_submit_propagates_exception():
    def handle(x):
        if x == 3:
            raise RuntimeError("bad")
        return x

    with pytest.raises(RuntimeError, match="bad"):
        map_ordered_submit(iter(range(6)), handle, max_workers=2, enabled=True)
