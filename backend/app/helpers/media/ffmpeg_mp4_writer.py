import logging
import os
import subprocess
import threading
import time
import signal
from typing import Iterable, Optional

import numpy as np

logger = logging.getLogger(__name__)

_ffmpeg_pids = set()
_pid_lock = threading.Lock()


def _register_ffmpeg_pid(pid: int) -> None:
    with _pid_lock:
        _ffmpeg_pids.add(pid)


def _unregister_ffmpeg_pid(pid: int) -> None:
    with _pid_lock:
        _ffmpeg_pids.discard(pid)


def kill_tracked_ffmpeg_processes() -> None:
    """
    Best-effort kill of any ffmpeg processes spawned by this helper.
    Used on app shutdown to avoid orphaned encoders holding locks.
    """
    with _pid_lock:
        pids = list(_ffmpeg_pids)
        _ffmpeg_pids.clear()

    for pid in pids:
        try:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
            else:
                os.kill(pid, signal.SIGTERM)
        except Exception:
            try:
                if os.name != "nt":
                    os.kill(pid, signal.SIGKILL)
            except Exception:
                pass


def ffmpeg_write_mp4_from_frames(
    frames: Iterable[np.ndarray],
    width: int,
    height: int,
    fps: float,
    output_path: str,
    crf: int = 16,
    preset: str = "slow",
    timeout_seconds: Optional[float] = 90.0,
    per_frame_timeout: float = 30.0,
) -> str:
    """
    Pipe raw BGR24 frames to ffmpeg and write a high-quality H.264 MP4.
    Uses chunked writing and stderr reading thread to prevent pipe deadlocks.
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-f", "rawvideo",
        "-pix_fmt", "bgr24",
        "-s", f"{width}x{height}",
        "-r", str(fps),
        "-i", "-",
        "-c:v", "libx264",
        "-preset", preset,
        "-crf", str(crf),
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        output_path,
    ]

    proc = None
    wrote_frames = False
    stderr_lines = []
    stderr_lock = threading.Lock()

    def read_stderr(pipe, output_list, lock):
        """Continuously read stderr to prevent pipe fill."""
        try:
            for line in iter(pipe.readline, b""):
                decoded = line.decode("utf-8", errors="ignore").strip()
                if decoded:
                    with lock:
                        output_list.append(decoded)
                        logger.debug(f"ffmpeg stderr: {decoded}")
        except Exception:
            pass
        finally:
            try:
                pipe.close()
            except Exception:
                pass

    def write_with_timeout(pipe, data, timeout):
        """Write data in chunks with timeout to detect broken pipe."""
        CHUNK_SIZE = 32768  # 32KB chunks
        bytes_written = 0
        start_time = time.time()

        while bytes_written < len(data):
            if time.time() - start_time > timeout:
                raise RuntimeError(f"Frame write timed out after {timeout}s")

            chunk_end = min(bytes_written + CHUNK_SIZE, len(data))
            chunk = data[bytes_written:chunk_end]

            try:
                pipe.write(chunk)
                pipe.flush()  # Ensure data is pushed to pipe
                bytes_written += len(chunk)
            except BrokenPipeError:
                raise RuntimeError("ffmpeg pipe broken - process may have crashed")
            except Exception as e:
                raise RuntimeError(f"Failed to write frame data: {e}")

    try:
        # Step 1: Start ffmpeg process
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        proc_stdin = proc.stdin  # type: ignore[assignment]
        if proc and proc.pid:
            _register_ffmpeg_pid(proc.pid)

        # Step 2: Start stderr reading thread to prevent pipe fill
        stderr_thread = threading.Thread(
            target=read_stderr,
            args=(proc.stderr, stderr_lines, stderr_lock),
            daemon=True
        )
        stderr_thread.start()

        # Step 3: Write frames with chunking and per-frame timeout
        frame_count = 0
        for frame in frames:
            if frame.shape[0] != height or frame.shape[1] != width:
                raise ValueError(f"Frame {frame_count}: dimensions {frame.shape[:2]} do not match {height}x{width}")
            if frame.ndim != 3 or frame.shape[2] != 3:
                raise ValueError(f"Frame {frame_count}: must be BGR with 3 channels, got shape {frame.shape}")

            # Check if ffmpeg process is still alive
            if proc.poll() is not None:
                with stderr_lock:
                    stderr_msg = "\n".join(stderr_lines[-10:])  # Last 10 lines
                raise RuntimeError(f"ffmpeg process died unexpectedly at frame {frame_count}: {stderr_msg}")

            # Write frame in chunks with timeout
            frame_bytes = frame.tobytes()
            write_with_timeout(proc_stdin, frame_bytes, per_frame_timeout)

            wrote_frames = True
            frame_count += 1

        # Step 4: Close stdin to signal EOF to ffmpeg
        proc_stdin.close()

        # Step 5: Wait for ffmpeg to finish encoding
        ret = proc.wait(timeout=timeout_seconds)

        # Step 6: Collect final stderr output
        stderr_thread.join(timeout=2.0)
        with stderr_lock:
            stderr_output = "\n".join(stderr_lines)

        # Step 7: Check results
        if not wrote_frames:
            raise ValueError("No frames provided to ffmpeg writer")
        if ret != 0:
            raise RuntimeError(f"ffmpeg exited with status {ret}. Last stderr:\n{stderr_output[-500:]}")

        logger.info(f"Successfully wrote {frame_count} frames to {output_path}")

    except subprocess.TimeoutExpired:
        # ffmpeg took too long to finish after stdin was closed
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=2)
            except Exception:
                try:
                    proc.kill()
                    proc.wait(timeout=1)
                except Exception:
                    pass
        with stderr_lock:
            stderr_output = "\n".join(stderr_lines[-10:])
        raise RuntimeError(f"ffmpeg encode timed out after {timeout_seconds}s. Last stderr:\n{stderr_output}")

    except Exception as exc:
        # Any error during frame writing or encoding
        with stderr_lock:
            stderr_output = "\n".join(stderr_lines[-10:])
        logger.warning(f"ffmpeg encode failed: {exc} | Last stderr:\n{stderr_output}")

        # Kill ffmpeg if still running
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=2)
            except Exception:
                try:
                    proc.kill()
                    proc.wait(timeout=1)
                except Exception:
                    pass

        # Clean up partial output file
        try:
            if os.path.exists(output_path):
                os.remove(output_path)
        except OSError:
            pass
        raise

    finally:
        # Ensure all resources are cleaned up
        try:
            if proc and proc.stdin and not proc.stdin.closed:
                proc.stdin.close()
        except Exception:
            pass
        if proc and proc.pid:
            _unregister_ffmpeg_pid(proc.pid)

    return output_path
