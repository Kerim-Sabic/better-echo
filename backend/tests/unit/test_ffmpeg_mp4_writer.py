import subprocess

from app.helpers.media.ffmpeg_mp4_writer import _windows_hidden_process_kwargs


def test_windows_hidden_process_kwargs_on_windows(monkeypatch):
    monkeypatch.setattr("app.helpers.media.ffmpeg_mp4_writer.os.name", "nt")

    kwargs = _windows_hidden_process_kwargs()

    assert kwargs["creationflags"] == subprocess.CREATE_NO_WINDOW
    assert kwargs["startupinfo"].dwFlags & subprocess.STARTF_USESHOWWINDOW


def test_windows_hidden_process_kwargs_on_non_windows(monkeypatch):
    monkeypatch.setattr("app.helpers.media.ffmpeg_mp4_writer.os.name", "posix")

    assert _windows_hidden_process_kwargs() == {}
