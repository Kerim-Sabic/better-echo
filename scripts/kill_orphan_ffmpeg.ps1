# Quick helper to kill orphaned ffmpeg/python backend processes on Windows.
# Run from repo root if the app crashes and leaves encoders running.

taskkill /F /IM ffmpeg.exe /T
taskkill /F /IM python.exe /T
