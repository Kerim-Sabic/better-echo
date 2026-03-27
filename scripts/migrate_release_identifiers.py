#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.chdir(BACKEND_ROOT)

from app.services.release.identifier_migration import (  # noqa: E402
    migrate_database,
    migrate_upload_dirs,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Migrate legacy model-identifying result values and upload paths to neutral release identifiers.",
    )
    parser.add_argument(
        "--uploads-root",
        action="append",
        default=[],
        help="Optional uploads root to normalize. May be provided multiple times.",
    )
    args = parser.parse_args()

    upload_roots = [Path(path).resolve() for path in args.uploads_root if path]
    if not upload_roots:
        upload_roots = [BACKEND_ROOT / "app" / "uploads"]

    database_summary = migrate_database()
    upload_summary = {"directories_checked": 0, "files_moved": 0, "conflicts": 0}
    for root in upload_roots:
        summary = migrate_upload_dirs(root)
        upload_summary["directories_checked"] += summary["directories_checked"]
        upload_summary["files_moved"] += summary["files_moved"]
        upload_summary["conflicts"] += summary["conflicts"]

    print("Legacy identifier migration completed.")
    print(f" - DB rows updated: {database_summary['rows_updated']}")
    print(f" - DB JSON rows updated: {database_summary['json_rows_updated']}")
    print(f" - Upload directories checked: {upload_summary['directories_checked']}")
    print(f" - Upload files moved: {upload_summary['files_moved']}")
    print(f" - Upload conflicts: {upload_summary['conflicts']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
