from app.services.integrations.orthanc_client import (
    delete_study_from_orthanc,
    delete_study_from_orthanc_status,
)


class _Response:
    def __init__(self, status_code: int):
        self.status_code = status_code


def test_delete_study_from_orthanc_status_maps_404_to_not_found(monkeypatch):
    monkeypatch.setattr(
        "app.services.integrations.orthanc_client.requests.delete",
        lambda *_args, **_kwargs: _Response(404),
    )

    status = delete_study_from_orthanc_status("study-orthanc-id")
    assert status == "not_found"
    assert delete_study_from_orthanc("study-orthanc-id") is True


def test_delete_study_from_orthanc_status_maps_500_to_error(monkeypatch):
    monkeypatch.setattr(
        "app.services.integrations.orthanc_client.requests.delete",
        lambda *_args, **_kwargs: _Response(500),
    )

    status = delete_study_from_orthanc_status("study-orthanc-id")
    assert status == "error"
    assert delete_study_from_orthanc("study-orthanc-id") is False
