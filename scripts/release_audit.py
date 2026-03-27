#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path


DEFAULT_TERMS = (
    "PanEcho",
    "EchoPrime",
    "EchonetDynamic",
    "PanEcho_AllTasks",
    "EchoPrime_AllTasks",
    "PanEcho_EchoPrime_Combined",
    "PanEcho_EchoPrime_Combined_Tasks",
    "EchonetDynamic_LV_Segmentation",
    "measurements_2D_keypoint_detection",
    "measurements_doppler",
    "llm_reports",
    "panecho_value_or_prob",
    "echoprime_value_or_prob",
    "panechoEchoprime",
    "LICENSE_ENFORCEMENT=",
    "Qwen/Qwen",
)

SKIP_SUFFIXES = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".dll",
    ".exe",
    ".pyd",
    ".so",
    ".ttf",
    ".woff",
    ".woff2",
    ".zip",
    ".7z",
    ".mp4",
    ".avi",
}


def iter_matches(root: Path, terms: tuple[str, ...]) -> list[str]:
    findings: list[str] = []
    term_bytes = [(term, term.encode("utf-8")) for term in terms]

    for path in root.rglob("*"):
        relative = path.relative_to(root).as_posix()

        for term, _ in term_bytes:
            if term.lower() in relative.lower():
                findings.append(f"path:{relative}:{term}")

        if not path.is_file() or path.suffix.lower() in SKIP_SUFFIXES:
            continue

        try:
            content = path.read_bytes()
        except Exception:
            continue

        for term, raw in term_bytes:
            if raw in content:
                findings.append(f"content:{relative}:{term}")

    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit packaged release output for banned names.")
    parser.add_argument("root", help="Package root to scan, for example dist/server/win-unpacked")
    parser.add_argument("--term", action="append", dest="terms", default=[], help="Additional banned term")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.exists():
        print(f"Package root does not exist: {root}", file=sys.stderr)
        return 1

    terms = tuple(dict.fromkeys([*DEFAULT_TERMS, *args.terms]))
    findings = iter_matches(root, terms)

    backend_source_tree = root / "resources" / "backend" / "app"
    if backend_source_tree.exists():
        findings.append(f"path:{backend_source_tree.relative_to(root).as_posix()}:readable-backend-source-tree")

    if findings:
        print("Release audit failed:")
        for finding in findings:
            print(f" - {finding}")
        return 1

    print(f"Release audit passed for {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
