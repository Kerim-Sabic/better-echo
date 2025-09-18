import os
import subprocess

def convert_to_mp4(input_path: str) -> str:
    """
    Convert an AVI file to MP4 using ffmpeg.
    """
    output_path = os.path.splitext(input_path)[0] + ".mp4"
    cmd = [
        "ffmpeg",
        "-y",  # overwrite existing file
        "-i", input_path,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-movflags", "+faststart",  # web-friendly
        output_path
    ]
    subprocess.run(cmd, check=True)
    return output_path
