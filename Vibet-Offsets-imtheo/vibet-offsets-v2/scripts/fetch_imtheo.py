#!/usr/bin/env python3
"""
fetch_imtheo.py — Pull imtheo's live offset files and stage them in source-data/.

Sources pulled:
  - https://offsets.imtheo.lol/FFlags.hpp       (FFlag offsets, 14k+ entries)
  - https://offsets.imtheo.lol/Offsets.hpp       (general engine offsets, if available)
  - https://dev.imtheo.lol/Offsets/FFlags.hpp    (dev/unstable channel — fallback)

Usage:
    python scripts/fetch_imtheo.py

The script stages files into source-data/ ready for publish.py to pick up.
Run both in sequence (CI does this automatically via the workflow):
    python scripts/fetch_imtheo.py && python scripts/publish.py
"""

import hashlib
import json
import shutil
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

ROOT        = Path(__file__).resolve().parents[1]
SOURCE      = ROOT / "source-data"
META_FILE   = ROOT / "source-data" / "_imtheo_meta.json"

# ---------------------------------------------------------------------------
# Endpoint definitions
# Format: (group_folder, filename, url, fallback_url_or_None)
# ---------------------------------------------------------------------------
ENDPOINTS = [
    (
        "External Offsets (imtheo)",
        "FFlags.hpp",
        "https://offsets.imtheo.lol/FFlags.hpp",
        "https://dev.imtheo.lol/Offsets/FFlags.hpp",
    ),
    (
        "External Offsets (imtheo)",
        "Offsets.hpp",
        "https://offsets.imtheo.lol/Offsets.hpp",
        None,
    ),
    (
        "External Offsets (imtheo)",
        "Offsets.cs",
        "https://offsets.imtheo.lol/Offsets.cs",
        None,
    ),
    (
        "External Offsets (imtheo)",
        "Offsets.json",
        "https://offsets.imtheo.lol/Offsets.json",
        None,
    ),
]

TIMEOUT = 20   # seconds per request


def fetch_url(url: str, timeout: int = TIMEOUT) -> bytes | None:
    """Download URL; return bytes or None on error."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "vibet-offsets/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            print(f"  ✓ {url}  ({len(data):,} bytes)")
            return data
    except urllib.error.HTTPError as e:
        print(f"  ✗ {url}  HTTP {e.code}")
        return None
    except Exception as e:
        print(f"  ✗ {url}  {e}")
        return None


def extract_client_version(text: str) -> str | None:
    """Pull 'ClientVersion' string from imtheo's header comment block."""
    for line in text.splitlines():
        if "Roblox Version" in line and "version-" in line:
            # /*  Roblox Version  : version-cec3ad5889b447cf
            part = line.split(":")[-1].strip().strip("*/").strip()
            return part
        if 'ClientVersion' in line and '"version-' in line:
            # inline std::string ClientVersion = "version-cec3ad5889b447cf";
            start = line.index('"') + 1
            end   = line.rindex('"')
            return line[start:end]
    return None


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    print("Fetching imtheo offsets…")
    SOURCE.mkdir(parents=True, exist_ok=True)

    fetched        = 0
    skipped        = 0
    client_version = None
    results        = []

    for group, filename, primary_url, fallback_url in ENDPOINTS:
        group_dir = SOURCE / group
        group_dir.mkdir(parents=True, exist_ok=True)
        out_path = group_dir / filename

        data = fetch_url(primary_url)
        if data is None and fallback_url:
            print(f"  ↳ trying fallback: {fallback_url}")
            data = fetch_url(fallback_url)

        if data is None:
            print(f"  ⚠  Skipping {filename} — no data available")
            skipped += 1
            continue

        out_path.write_bytes(data)
        fetched += 1

        text = data.decode("utf-8", errors="replace")
        if client_version is None:
            client_version = extract_client_version(text)

        results.append({
            "group":    group,
            "file":     filename,
            "sha256":   sha256_bytes(data),
            "size":     len(data),
            "url":      primary_url,
        })

    # Write metadata sidecar so publish.py and the GitHub Action can read it
    meta = {
        "fetchedAt":     datetime.now(timezone.utc).isoformat(),
        "clientVersion": client_version or "unknown",
        "files":         results,
        "source":        "offsets.imtheo.lol",
    }
    META_FILE.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    print(f"\nDone: {fetched} fetched, {skipped} skipped")
    if client_version:
        print(f"Roblox client version: {client_version}")
    print(f"Metadata → {META_FILE.relative_to(ROOT)}")

    return 0 if fetched > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
