"""
Benchmark: EchoPrime local-file execution mode vs Orthanc HTTP download.

Compares the two acquisition paths of `run_secondary_analysis_metrics`:

  legacy  : HTTP download from Orthanc -> temp file -> decode
  local   : decode the already-on-disk upload directly

The download leg uses the real `download_dicoms_for_instances` helper against
a fake Orthanc served from 127.0.0.1, so the measured saving is a *lower
bound*: a real Orthanc adds its own storage lookups and (on LAN deployments)
network latency on top.

Run from backend/:  python benchmark_local_vs_orthanc.py [--instances N] [--frames F]
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# The fake Orthanc must exist before app modules read ORTHANC_URL at import.
_FILES: dict[str, str] = {}
_INSTANCE_ROUTE = re.compile(r"^/instances/(?P<iid>[^/]+)/file$")
_NETWORK = {"latency_s": 0.0, "bytes_per_s": 0.0}  # 0 = unthrottled loopback


class _FakeOrthancHandler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 - http.server API
        match = _INSTANCE_ROUTE.match(self.path)
        path = _FILES.get(match.group("iid")) if match else None
        if not path:
            self.send_response(404)
            self.end_headers()
            return
        with open(path, "rb") as handle:
            payload = handle.read()
        if _NETWORK["latency_s"]:
            time.sleep(_NETWORK["latency_s"])
        self.send_response(200)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if _NETWORK["bytes_per_s"]:
            # Emulate LAN throughput with 1 MiB chunks paced to the target rate.
            chunk = 1024 * 1024
            for offset in range(0, len(payload), chunk):
                piece = payload[offset : offset + chunk]
                self.wfile.write(piece)
                time.sleep(len(piece) / _NETWORK["bytes_per_s"])
        else:
            self.wfile.write(payload)

    def log_message(self, *_args):
        pass


_server = ThreadingHTTPServer(("127.0.0.1", 0), _FakeOrthancHandler)
threading.Thread(target=_server.serve_forever, daemon=True).start()

os.environ["ORTHANC_URL"] = f"http://127.0.0.1:{_server.server_address[1]}"
os.environ.setdefault("CORS_ORIGIN", '["http://localhost:3000"]')
os.environ.setdefault("ORTHANC_USER", "bench")
os.environ.setdefault("ORTHANC_PASS", "bench")
os.environ.setdefault("SECRET_KEY", "bench")
os.environ.setdefault("TOKEN_EXPIRE_HOURS", "1")

import numpy as np  # noqa: E402
import pydicom  # noqa: E402

from benchmark_frame_cache import write_cine  # noqa: E402
from app.services.inference.secondary_analysis_service import (  # noqa: E402
    download_dicoms_for_instances,
)


def _decode(path: str) -> int:
    ds = pydicom.dcmread(path, force=True)
    return int(np.asarray(ds.pixel_array).shape[0])


def _run_legacy(instance_ids: list[str]) -> float:
    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="bench_orthanc_dl_") as chunk_dir:
        records = download_dicoms_for_instances(instance_ids, chunk_dir)
        for record in records:
            _decode(record["path"])
    return time.perf_counter() - started


def _run_local(paths: list[str]) -> float:
    started = time.perf_counter()
    for path in paths:
        _decode(path)
    return time.perf_counter() - started


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--instances", type=int, default=12)
    parser.add_argument("--frames", type=int, default=60)
    parser.add_argument("--iterations", type=int, default=3)
    parser.add_argument(
        "--latency-ms", type=float, default=0.0, help="Per-request latency to emulate LAN RTT"
    )
    parser.add_argument(
        "--bandwidth-mbps", type=float, default=0.0, help="Throttle download throughput (megabits/s)"
    )
    args = parser.parse_args()
    _NETWORK["latency_s"] = args.latency_ms / 1000.0
    _NETWORK["bytes_per_s"] = args.bandwidth_mbps * 1e6 / 8.0

    with tempfile.TemporaryDirectory(prefix="bench_local_study_") as root:
        instance_ids: list[str] = []
        paths: list[str] = []
        for idx in range(args.instances):
            path = os.path.join(root, f"cine_{idx:03d}.dcm")
            write_cine(path, frames=args.frames, rows=600, cols=800, seed=idx)
            iid = f"instance-{idx:03d}"
            _FILES[iid] = path
            instance_ids.append(iid)
            paths.append(path)
        study_bytes = sum(os.path.getsize(path) for path in paths)
        print(
            f"Synthetic study: {args.instances} cines x {args.frames} frames "
            f"(800x600, RLE, {study_bytes / 1e6:.1f} MB total)"
        )
        print("Fake Orthanc on", os.environ["ORTHANC_URL"], "(localhost = lower-bound cost)")

        # Warm OS caches for both paths.
        _run_legacy(instance_ids)
        _run_local(paths)

        legacy = min(_run_legacy(instance_ids) for _ in range(args.iterations))
        local = min(_run_local(paths) for _ in range(args.iterations))
        reduction = 1.0 - (local / legacy)

        print()
        print("=== Acquisition + decode per study (best of %d) ===" % args.iterations)
        print(f"  legacy (download+decode): {legacy:8.2f} s")
        print(f"  local  (decode only):     {local:8.2f} s")
        print(f"  runtime reduction:        {reduction * 100:8.1f} %")
        print(f"  HTTP requests:            {len(instance_ids)} -> 0")
        return 0


if __name__ == "__main__":
    sys.exit(main())
