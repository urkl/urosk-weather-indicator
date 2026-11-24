# SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
# SPDX-License-Identifier: Apache-2.0
"""Tests for scripts/release-notes.py (run by `make test`)."""

import hashlib
import importlib.util
import json
import shutil
import tempfile
import unittest
import unittest.mock
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("release_notes", ROOT / "scripts" / "release-notes.py")
release_notes = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(release_notes)

UUID = "urosk-weather-indicator@urosk.net"

CHANGELOG = """# Changelog

## [Unreleased]

- Not released yet.

## [1.2.0] — 2026-12-01

### Added

- Snow depth.
- A second line.

## [1.1.0] — 2026-11-24

- Moon.
"""


class Tree:
    """A minimal source tree of version 1.2.0 in a temporary directory."""

    def __init__(self, version="1.2.0"):
        self.root = Path(tempfile.mkdtemp(prefix="uwi-release-"))
        (self.root / "src").mkdir()
        (self.root / "scripts").mkdir()
        self.write_json("src/metadata.json", {"uuid": UUID, "shell-version": ["48", "49", "50"], "version-name": version})
        self.write_json("package.json", {"name": "urosk-weather-indicator", "version": version})
        self.write_json("package-lock.json", {"name": "urosk-weather-indicator", "version": version})
        (self.root / "CHANGELOG.md").write_text(CHANGELOG, encoding="utf-8")
        shutil.copy(ROOT / "scripts" / "install-latest.sh", self.root / "scripts" / "install-latest.sh")

    def write_json(self, name, data):
        (self.root / name).write_text(json.dumps(data), encoding="utf-8")

    def dist(self, version="1.2.0", checksum=None):
        dist = self.root / "dist"
        dist.mkdir(exist_ok=True)
        package = dist / f"{UUID}.shell-extension.zip"
        with zipfile.ZipFile(package, "w") as archive:
            archive.writestr("metadata.json", json.dumps({"uuid": UUID, "version-name": version}))
        digest = checksum or hashlib.sha256(package.read_bytes()).hexdigest()
        (dist / "SHA256SUMS").write_text(f"{digest}  {package.name}\n", encoding="utf-8")
        return dist

    def cleanup(self):
        shutil.rmtree(self.root)


class ReleaseNotesTest(unittest.TestCase):
    def setUp(self):
        self.tree = Tree()
        self.addCleanup(self.tree.cleanup)

    def problems(self, tag="v1.2.0", dist=None):
        with self.assertRaises(release_notes.ReleaseError) as caught:
            release_notes.release_notes(tag, self.tree.root, dist)
        return str(caught.exception)

    def test_notes_are_the_changelog_section_and_how_to_install(self):
        notes = release_notes.release_notes("v1.2.0", self.tree.root, self.tree.dist())
        self.assertTrue(notes.startswith("### Added\n\n- Snow depth.\n- A second line.\n\n### Install or update"), notes)
        self.assertNotIn("Moon", notes)
        self.assertNotIn("Not released", notes)
        self.assertIn("install-latest.sh | bash", notes)
        self.assertIn("--version 1.2.0", notes)
        self.assertIn("Requires GNOME Shell 48, 49 or 50.", notes)

    def test_the_last_section_ends_at_link_references(self):
        (self.tree.root / "CHANGELOG.md").write_text(
            "## [1.2.0] — 2026-12-01\n\n- Snow.\n\n[1.2.0]: https://example.org/v1.2.0\n", encoding="utf-8")
        notes = release_notes.release_notes("v1.2.0", self.tree.root)
        self.assertTrue(notes.startswith("- Snow.\n\n### Install"), notes)

    def test_only_version_tags(self):
        for tag in ("1.2.0", "v1.2", "v1.2.0-rc1", "v1.2.0\n", "latest"):
            with self.subTest(tag=tag):
                self.assertIn("not a version tag", self.problems(tag))

    def test_every_version_must_match_the_tag(self):
        self.tree.write_json("src/metadata.json", {"uuid": UUID, "version-name": "1.1.0"})
        self.tree.write_json("package.json", {"version": "1.1.0"})
        problems = self.problems()
        self.assertIn("src/metadata.json has version-name '1.1.0'", problems)
        self.assertIn("package.json has version '1.1.0'", problems)
        self.assertNotIn("package-lock.json", problems)

    def test_changelog_must_have_the_section(self):
        self.assertIn("CHANGELOG.md has no section ## [1.3.0]", self.problems_for_version("1.3.0"))
        (self.tree.root / "CHANGELOG.md").write_text("## [1.2.0] — 2026-12-01\n\n## [1.1.0]\n- Moon.\n", encoding="utf-8")
        self.assertIn("is empty", self.problems())

    def problems_for_version(self, version):
        tree = Tree(version)
        self.addCleanup(tree.cleanup)
        with self.assertRaises(release_notes.ReleaseError) as caught:
            release_notes.release_notes(f"v{version}", tree.root)
        return str(caught.exception)

    def test_packages_are_checked(self):
        self.assertIn("run `make zip`", self.problems(dist=self.tree.root / "dist"))
        self.assertIn("SHA256SUMS does not list", self.problems(dist=self.tree.dist(checksum="0" * 64)))
        self.assertIn("contains urosk-weather-indicator@urosk.net 1.1.0", self.problems(dist=self.tree.dist(version="1.1.0")))

    def test_asset_name_must_be_what_install_latest_downloads(self):
        script = self.tree.root / "scripts" / "install-latest.sh"
        script.write_text(script.read_text(encoding="utf-8").replace("ASSET=$UUID.shell-extension.zip", "ASSET=$UUID.zip"),
                          encoding="utf-8")
        self.assertIn(f"downloads {UUID}.zip", self.problems(dist=self.tree.dist()))

    def test_the_real_install_script_downloads_the_package_of_make_zip(self):
        script = (ROOT / "scripts" / "install-latest.sh").read_text(encoding="utf-8")
        self.assertEqual(release_notes.install_asset_name(script, UUID), f"{UUID}.shell-extension.zip")

    def test_the_repository_is_ready_for_its_own_version(self):
        version = json.loads((ROOT / "src" / "metadata.json").read_text(encoding="utf-8"))["version-name"]
        notes = release_notes.release_notes(f"v{version}", ROOT)
        self.assertIn("### Install or update", notes)

    def test_command_line_reports_problems_on_stderr(self):
        output = self.tree.root / "out" / "notes.md"
        self.assertEqual(release_notes.main(["v1.2.0", "--root", str(self.tree.root), "--output", str(output)]), 0)
        self.assertIn("Snow depth", output.read_text(encoding="utf-8"))
        with unittest.mock.patch("sys.stderr") as stderr:
            self.assertEqual(release_notes.main(["v9.9.9", "--root", str(self.tree.root)]), 1)
        self.assertIn("release-notes: ", "".join(call.args[0] for call in stderr.write.call_args_list))


if __name__ == "__main__":
    unittest.main()
