#!/usr/bin/env python3
"""Publish user-provided/generated offset files into the static Vibet site.

Groups are inferred from the first directory level under source-data/.
Any group whose name contains 'external' or 'ext' is tagged kind=external.
Any group whose name contains 'internal' or 'int' is tagged kind=internal.
Everything else is kind=other.

Usage:
    python scripts/publish.py

Environment variables:
    VIBET_VERSION   Optional release version string, e.g. v1.0.1
"""

import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT    = Path(__file__).resolve().parents[1]
SOURCE  = ROOT / "source-data"
PUBLIC  = ROOT / "public"
DEST    = PUBLIC / "downloads"
MANIFEST = PUBLIC / "manifest.json"
VERSION = os.environ.get("VIBET_VERSION", "").strip()


def safe_url(path: Path) -> str:
    return "/" + path.relative_to(PUBLIC).as_posix()


def infer_kind(group_name: str) -> str:
    g = group_name.lower()
    if "external" in g or g.startswith("ext"):
        return "external"
    if "internal" in g or g.startswith("int"):
        return "internal"
    return "other"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing source-data directory: {SOURCE}")

    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir(parents=True, exist_ok=True)

    groups: dict[str, list[dict]] = {}
    all_files = sorted(p for p in SOURCE.rglob("*") if p.is_file() and p.name.lower() != "readme.md")

    for src in all_files:
        rel   = src.relative_to(SOURCE)
        parts = rel.parts
        group = parts[0] if len(parts) > 1 else "Misc"
        kind  = infer_kind(group)

        dest_rel = Path(*parts)
        out = DEST / dest_rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, out)

        groups.setdefault(group, {
            "__kind": kind,
            "__files": [],
        })
        groups[group]["__files"].append({
            "name":   src.name,
            "url":    safe_url(out),
            "size":   src.stat().st_size,
            "sha256": sha256_file(src),
            "kind":   kind,
        })

    # Flatten to the manifest shape the frontend expects
    flat_groups: dict[str, list[dict]] = {}
    for group_name, meta in groups.items():
        flat_groups[group_name] = meta["__files"]

    version  = VERSION or datetime.now(timezone.utc).strftime("build-%Y%m%d-%H%M%S-utc")
    fc       = sum(len(v) for v in flat_groups.values())
    manifest = {
        "version":   version,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "fileCount": fc,
        "groups":    flat_groups,
    }

    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Published {fc} files as {version}")
    for group_name, items in flat_groups.items():
        kind = infer_kind(group_name)
        print(f"  [{kind:8s}] {group_name}: {len(items)} file(s)")


if __name__ == "__main__":
    main()
