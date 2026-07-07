"""
Local-file execution mode for EchoPrime (secondary analysis) metrics:

- local files present  -> no Orthanc HTTP request of any kind
- files missing        -> legacy Orthanc listing/download path is preserved
- execution path       -> logged and returned as "local" | "mixed" | "orthanc"
"""

import torch

from app.database_models.instances import Instance
from app.database_models.series import Series
from app.services.inference import secondary_analysis_service
from app.services.inference.secondary_analysis_service import (
    run_secondary_analysis_metrics,
)


class _FakeMetricsModel:
    """Stands in for EchoPrime; records which files it processed."""

    def __init__(self):
        self.processed_paths = []

    def process_dicom_file(self, path):
        self.processed_paths.append(path)
        return torch.zeros((3, 16, 224, 224), dtype=torch.float32)

    def create_metrics_accumulator(self):
        return []

    def accumulate_metrics_chunk(self, accumulator, stack, **_kwargs):
        accumulator.append(int(stack.shape[0]))
        return accumulator

    def predict_metrics_from_accumulator(self, accumulator):
        return {"lvef": 60.0, "chunks": float(len(accumulator))}


def _seed_instances(db, seeded_study, tmp_path, *, count=3, on_disk=True):
    series = Series(
        series_uid="series-local-mode",
        modality="US",
        series_orthanc_id="orthanc-series-local-mode",
        study_id=seeded_study["study_id"],
    )
    instances = []
    for idx in range(count):
        path = tmp_path / f"{idx}.dcm"
        if on_disk:
            path.write_bytes(b"dicom")
        instances.append(
            Instance(
                sop_instance_uid=f"sop-local-{idx}",
                file_path=str(path),
                instance_orthanc_id=f"orthanc-local-{idx}",
                series=series,
            )
        )
    db.add(series)
    db.add_all(instances)
    db.commit()
    return instances


def _forbid_http(monkeypatch, *, listing=True, download=True):
    def _boom(*_args, **_kwargs):
        raise AssertionError("Orthanc HTTP request attempted in local mode")

    if listing:
        monkeypatch.setattr(
            secondary_analysis_service, "fetch_orthanc_instance_ids_from_study", _boom
        )
    if download:
        monkeypatch.setattr(
            secondary_analysis_service, "download_dicoms_for_instances", _boom
        )
    monkeypatch.setattr(secondary_analysis_service.requests, "get", _boom)


def _install_fake_model(monkeypatch):
    fake_ep = _FakeMetricsModel()
    monkeypatch.setattr(
        secondary_analysis_service, "get_secondary_analysis_model", lambda: fake_ep
    )
    return fake_ep


# Part 1. Local path selected: zero HTTP traffic.


def test_all_local_with_include_ids_makes_no_http_request(
    db_session_factory, seeded_study, tmp_path, monkeypatch
):
    db = db_session_factory()
    try:
        instances = _seed_instances(db, seeded_study, tmp_path)
        fake_ep = _install_fake_model(monkeypatch)
        _forbid_http(monkeypatch)

        result = run_secondary_analysis_metrics(
            study_uid=seeded_study["study_uid"],
            db=db,
            include_instance_orthanc_ids=[
                instance.instance_orthanc_id for instance in instances
            ],
        )

        assert result["execution_path"] == "local"
        assert result["num_instances"] == 3
        assert sorted(fake_ep.processed_paths) == sorted(
            instance.file_path for instance in instances
        )
    finally:
        db.close()


def test_without_include_ids_fully_local_study_skips_orthanc_listing(
    db_session_factory, seeded_study, tmp_path, monkeypatch
):
    db = db_session_factory()
    try:
        instances = _seed_instances(db, seeded_study, tmp_path)
        fake_ep = _install_fake_model(monkeypatch)
        _forbid_http(monkeypatch)

        result = run_secondary_analysis_metrics(
            study_uid=seeded_study["study_uid"],
            db=db,
            include_instance_orthanc_ids=None,
        )

        assert result["execution_path"] == "local"
        assert result["num_instances"] == len(instances)
        assert len(fake_ep.processed_paths) == len(instances)
    finally:
        db.close()


# Part 2. Fallback preserved when local files are unavailable.


def test_mixed_study_downloads_only_missing_instances(
    db_session_factory, seeded_study, tmp_path, monkeypatch
):
    db = db_session_factory()
    try:
        instances = _seed_instances(db, seeded_study, tmp_path)
        missing = instances[1]
        (tmp_path / "1.dcm").unlink()

        fake_ep = _install_fake_model(monkeypatch)
        download_calls = []

        def fake_download(instance_ids, output_dir):
            download_calls.append(list(instance_ids))
            records = []
            for iid in instance_ids:
                path = tmp_path / f"downloaded_{iid}.dcm"
                path.write_bytes(b"dicom")
                records.append({"instance_id": iid, "path": str(path)})
            return records

        monkeypatch.setattr(
            secondary_analysis_service, "download_dicoms_for_instances", fake_download
        )
        _forbid_http(monkeypatch, download=False)

        result = run_secondary_analysis_metrics(
            study_uid=seeded_study["study_uid"],
            db=db,
            include_instance_orthanc_ids=[
                instance.instance_orthanc_id for instance in instances
            ],
        )

        assert result["execution_path"] == "mixed"
        assert result["num_instances"] == 3
        assert download_calls == [[missing.instance_orthanc_id]]
    finally:
        db.close()


def test_without_include_ids_partial_local_falls_back_to_orthanc_listing(
    db_session_factory, seeded_study, tmp_path, monkeypatch
):
    db = db_session_factory()
    try:
        instances = _seed_instances(db, seeded_study, tmp_path)
        (tmp_path / "2.dcm").unlink()

        _install_fake_model(monkeypatch)
        all_ids = [instance.instance_orthanc_id for instance in instances]
        listing_calls = []

        def fake_listing(study_uid):
            listing_calls.append(study_uid)
            return list(all_ids)

        def fake_download(instance_ids, output_dir):
            records = []
            for iid in instance_ids:
                path = tmp_path / f"downloaded_{iid}.dcm"
                path.write_bytes(b"dicom")
                records.append({"instance_id": iid, "path": str(path)})
            return records

        monkeypatch.setattr(
            secondary_analysis_service,
            "fetch_orthanc_instance_ids_from_study",
            fake_listing,
        )
        monkeypatch.setattr(
            secondary_analysis_service, "download_dicoms_for_instances", fake_download
        )

        result = run_secondary_analysis_metrics(
            study_uid=seeded_study["study_uid"],
            db=db,
            include_instance_orthanc_ids=None,
        )

        assert listing_calls == [seeded_study["study_uid"]]
        assert result["execution_path"] == "mixed"
        assert result["num_instances"] == 3
    finally:
        db.close()


def test_no_local_files_uses_legacy_orthanc_path(
    db_session_factory, seeded_study, tmp_path, monkeypatch
):
    db = db_session_factory()
    try:
        instances = _seed_instances(db, seeded_study, tmp_path, on_disk=False)

        _install_fake_model(monkeypatch)
        all_ids = [instance.instance_orthanc_id for instance in instances]
        downloaded_ids = []

        def fake_download(instance_ids, output_dir):
            downloaded_ids.extend(instance_ids)
            records = []
            for iid in instance_ids:
                path = tmp_path / f"downloaded_{iid}.dcm"
                path.write_bytes(b"dicom")
                records.append({"instance_id": iid, "path": str(path)})
            return records

        monkeypatch.setattr(
            secondary_analysis_service,
            "fetch_orthanc_instance_ids_from_study",
            lambda _study_uid: list(all_ids),
        )
        monkeypatch.setattr(
            secondary_analysis_service, "download_dicoms_for_instances", fake_download
        )

        result = run_secondary_analysis_metrics(
            study_uid=seeded_study["study_uid"],
            db=db,
            include_instance_orthanc_ids=None,
        )

        assert result["execution_path"] == "orthanc"
        assert result["num_instances"] == 3
        assert sorted(downloaded_ids) == sorted(all_ids)
    finally:
        db.close()
