import logging
import os
import subprocess
import tempfile
from typing import Iterable, Optional

import numpy as np

logger = logging.getLogger(__name__)


def convert_to_mp4(input_path: str) -> str:
    """
    Convert a video to MP4 (H.264, CRF 18, medium preset) using ffmpeg.
    This is the final encode step for LV segmentation and 2D measurements videos.
    Always re-encodes to ensure a browser-friendly H.264 stream.
    Avoids in-place writes by using a temp output when needed.
    """
    output_path = os.path.splitext(input_path)[0] + ".mp4"
    temp_output = None
    if os.path.abspath(output_path) == os.path.abspath(input_path):
        base_dir = os.path.dirname(input_path)
        with tempfile.NamedTemporaryFile(prefix="tmp_enc_", suffix=".mp4", dir=base_dir, delete=False) as tmp:
            temp_output = tmp.name
        target_path = temp_output
    else:
        target_path = output_path

    cmd = [
        "ffmpeg",
        "-y",  # overwrite existing file
        "-i", input_path,
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-an",
        "-movflags", "+faststart",  # web-friendly
        target_path,
    ]
    subprocess.run(cmd, check=True)

    if temp_output:
        os.replace(temp_output, output_path)
    return output_path


def ffmpeg_write_mp4_from_frames(
    frames: Iterable[np.ndarray],
    width: int,
    height: int,
    fps: float,
    output_path: str,
    crf: int = 16,
    preset: str = "slow",
    timeout_seconds: Optional[float] = 60.0,
) -> str:
    """
    Pipe raw BGR24 frames to ffmpeg and write a high-quality H.264 MP4.
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
    stderr = ""
    try:
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        proc_stdin = proc.stdin  # type: ignore[assignment]

        for frame in frames:
            if frame.shape[0] != height or frame.shape[1] != width:
                raise ValueError("Frame dimensions do not match writer settings.")
            if frame.ndim != 3 or frame.shape[2] != 3:
                raise ValueError("Frames must be BGR with 3 channels.")
            proc_stdin.write(frame.tobytes())
            wrote_frames = True

        proc_stdin.close()
        stderr = proc.stderr.read().decode("utf-8", errors="ignore") if proc.stderr else ""
        ret = proc.wait(timeout=timeout_seconds)
        if not wrote_frames:
            raise ValueError("No frames provided to ffmpeg writer.")
        if ret != 0:
            raise RuntimeError(f"ffmpeg exited with status {ret}: {stderr}")
    except subprocess.TimeoutExpired:
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
        raise RuntimeError("ffmpeg encode timed out.")
    except Exception as exc:
        logger.warning("ffmpeg encode failed: %s | stderr=%s", exc, stderr)
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
        try:
            if os.path.exists(output_path):
                os.remove(output_path)
        except OSError:
            pass
        raise
    finally:
        try:
            if proc and proc.stdin and not proc.stdin.closed:
                proc.stdin.close()
        except Exception:
            pass
        try:
            if proc and proc.stderr:
                proc.stderr.close()
        except Exception:
            pass

    return output_path
