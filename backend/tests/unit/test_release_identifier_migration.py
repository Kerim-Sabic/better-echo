from pathlib import Path

from app.services.release import identifier_migration


def test_run_release_identifier_migration_reruns_with_existing_marker(monkeypatch, tmp_path):
    marker_file = tmp_path / "release-identifiers-v1.done"
    marker_file.parent.mkdir(parents=True, exist_ok=True)
    marker_file.write_text("old", encoding="utf-8")

    uploads_root = tmp_path / "uploads"
    uploads_root.mkdir(parents=True, exist_ok=True)

    calls = {"db": 0, "uploads": 0}

    monkeypatch.setattr(identifier_migration, "_MARKER_FILE", marker_file)
    monkeypatch.setattr(identifier_migration, "uploads_dir", lambda: str(uploads_root))

    def fake_migrate_database():
        calls["db"] += 1
        return {"rows_updated": 1, "json_rows_updated": 1}

    def fake_migrate_upload_dirs(root: Path):
        calls["uploads"] += 1
        assert root == uploads_root
        return {"directories_checked": 4, "files_moved": 2, "conflicts": 0}

    monkeypatch.setattr(identifier_migration, "migrate_database", fake_migrate_database)
    monkeypatch.setattr(identifier_migration, "migrate_upload_dirs", fake_migrate_upload_dirs)

    summary = identifier_migration.run_release_identifier_migration()

    assert summary["skipped"] is False
    assert summary["forced"] is False
    assert summary["marker_preexisted"] is True
    assert calls == {"db": 1, "uploads": 1}
    assert "rows_updated=1" in marker_file.read_text(encoding="utf-8")


def test_run_release_identifier_migration_marks_forced_runs(monkeypatch, tmp_path):
    marker_file = tmp_path / "release-identifiers-v1.done"
    uploads_root = tmp_path / "uploads"
    uploads_root.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(identifier_migration, "_MARKER_FILE", marker_file)
    monkeypatch.setattr(identifier_migration, "uploads_dir", lambda: str(uploads_root))
    monkeypatch.setattr(
        identifier_migration,
        "migrate_database",
        lambda: {"rows_updated": 0, "json_rows_updated": 0},
    )
    monkeypatch.setattr(
        identifier_migration,
        "migrate_upload_dirs",
        lambda root: {"directories_checked": 4, "files_moved": 0, "conflicts": 0},
    )

    summary = identifier_migration.run_release_identifier_migration(force=True)

    assert summary["forced"] is True
    assert summary["marker_preexisted"] is False
    assert marker_file.exists()
