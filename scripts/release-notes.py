#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
# SPDX-License-Identifier: Apache-2.0
#
# Checks that a source tree is ready to be released under a tag and prints the release notes
# (the section of CHANGELOG.md for that version plus how to install it). Used by
# .github/workflows/release.yml and by `make release-check`; only the Python standard library.
#
#   scripts/release-notes.py v1.2.0                      check versions and CHANGELOG, print notes
#   scripts/release-notes.py v1.2.0 --dist dist          also check the packages from `make zip`
#   scripts/release-notes.py v1.2.0 --output notes.md    write the notes to a file
#   --root DIR                                           the tree to check (default: current dir)
"""Check a tree for a release and write its release notes."""

import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

TAG = re.compile(r"^v(\d+\.\d+\.\d+)\Z")
INSTALL_URL = "https://raw.githubusercontent.com/urkl/urosk-weather-indicator/main/scripts/install-latest.sh"


class ReleaseError(Exception):
    """The tree cannot be released under the tag; the message lists every problem."""


def version_of(tag):
    match = TAG.match(tag)
    if not match:
        raise ReleaseError(f"{tag} is not a version tag like v1.2.0")
    return match.group(1)


def read_json(path, problems):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        problems.append(f"{path.name} not found")
    except ValueError as error:
        problems.append(f"{path.name} is not valid JSON: {error}")
    return None


def changelog_section(text, version):
    """Body of the `## [version]` section of a Keep a Changelog file, or None."""
    heading = re.compile(r"^## \[" + re.escape(version) + r"\](\s|$)")
    lines = text.splitlines()
    start = next((i for i, line in enumerate(lines) if heading.match(line)), None)
    if start is None:
        return None
    body = []
    for line in lines[start + 1:]:
        if line.startswith("## ") or re.match(r"^\[[^\]]+\]:\s", line):
            break
        # two trailing spaces are line breaks for the Markdown files in the repository; a
        # release body is rendered from list items alone
        body.append(line.rstrip())
    return "\n".join(body).strip("\n")


def install_asset_name(script, uuid):
    """Asset name that scripts/install-latest.sh downloads, with $UUID expanded."""
    values = dict(re.findall(r"^(UUID|ASSET)=(\S+)$", script, re.MULTILINE))
    if "ASSET" not in values:
        return None
    return re.sub(r"\$\{?UUID\}?", values.get("UUID", uuid), values["ASSET"])


def check_dist(dist, version, uuid, root, problems):
    package = dist / f"{uuid}.shell-extension.zip"
    sums = dist / "SHA256SUMS"
    for path in (package, sums):
        if not path.is_file():
            problems.append(f"{path} not found; run `make zip`")
    if problems:
        return
    digest = hashlib.sha256(package.read_bytes()).hexdigest()
    listed = [line.split() for line in sums.read_text(encoding="utf-8").splitlines() if line.strip()]
    if listed != [[digest, package.name]] and listed != [[digest, "*" + package.name]]:
        problems.append(f"SHA256SUMS does not list exactly {package.name} with its checksum {digest}")
    try:
        with zipfile.ZipFile(package) as archive:
            meta = json.loads(archive.read("metadata.json"))
        if meta.get("uuid") != uuid or meta.get("version-name") != version:
            problems.append(f"{package.name} contains {meta.get('uuid')} {meta.get('version-name')}, not {uuid} {version}")
    except (OSError, KeyError, ValueError, zipfile.BadZipFile) as error:
        problems.append(f"{package.name} is not an extension package: {error}")
    script = root / "scripts" / "install-latest.sh"
    if script.is_file():
        asset = install_asset_name(script.read_text(encoding="utf-8"), uuid)
        if asset != package.name:
            problems.append(f"scripts/install-latest.sh downloads {asset}, the release has {package.name}")


def release_notes(tag, root=Path("."), dist=None):
    """Checks the tree and returns the release notes as Markdown.

    :raises ReleaseError: listing every problem found
    """
    version = version_of(tag)
    root = Path(root)
    problems = []

    meta = read_json(root / "src" / "metadata.json", problems)
    uuid = meta.get("uuid") if meta else None
    if meta and meta.get("version-name") != version:
        problems.append(f"src/metadata.json has version-name {meta.get('version-name')!r}, the tag is {tag}")

    for name in ("package.json", "package-lock.json"):
        if (root / name).exists():
            data = read_json(root / name, problems)
            if data is not None and data.get("version") != version:
                problems.append(f"{name} has version {data.get('version')!r}, the tag is {tag}")

    section = None
    try:
        section = changelog_section((root / "CHANGELOG.md").read_text(encoding="utf-8"), version)
        if section is None:
            problems.append(f"CHANGELOG.md has no section ## [{version}]")
        elif not section:
            problems.append(f"the section ## [{version}] of CHANGELOG.md is empty")
    except FileNotFoundError:
        problems.append("CHANGELOG.md not found")

    if dist is not None and uuid:
        check_dist(Path(dist), version, uuid, root, problems)

    if problems:
        raise ReleaseError("\n".join(problems))

    shells = [str(shell) for shell in meta.get("shell-version", [])]
    supported = ", ".join(shells[:-1]) + f" or {shells[-1]}" if len(shells) > 1 else "".join(shells)
    lines = [
        section,
        "",
        "### Install or update",
        "",
        "```sh",
        f"curl -fsSL {INSTALL_URL} | bash",
        "```",
        "",
        f"This version in particular: `… | bash -s -- --version {version}`. Updating keeps your settings",
        "(they live in dconf). Log out and back in afterwards (Wayland).",
    ]
    if supported:
        lines.append(f"Requires GNOME Shell {supported}.")
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag", help="the tag to release, e.g. v1.2.0")
    parser.add_argument("--root", default=".", help="tree to check (default: current directory)")
    parser.add_argument("--dist", help="directory with the packages from `make zip`")
    parser.add_argument("--output", help="write the notes here instead of to standard output")
    args = parser.parse_args(argv)
    try:
        notes = release_notes(args.tag, Path(args.root), args.dist)
    except ReleaseError as error:
        for problem in str(error).splitlines():
            print(f"release-notes: {problem}", file=sys.stderr)
        return 1
    if args.output:
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        Path(args.output).write_text(notes, encoding="utf-8")
    else:
        sys.stdout.write(notes)
    return 0


if __name__ == "__main__":
    sys.exit(main())
