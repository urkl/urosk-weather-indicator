# SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
# SPDX-License-Identifier: Apache-2.0
#
# make            build into build/ (compiled schemas and translations)
# make install    install for the current user (log out and in to load it on Wayland)
# make zip        package for extensions.gnome.org / GitHub releases (with SHA256SUMS)
# make check      lint, unit tests and translation check
# make release-check   everything a release of the version in src/metadata.json needs

UUID     := urosk-weather-indicator@urosk.net
BUILD    := build/$(UUID)
DIST     := dist
ZIP      := $(DIST)/$(UUID).shell-extension.zip
INSTALL  := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
VERSION   = $(shell python3 -I -c 'import json; print(json.load(open("src/metadata.json"))["version-name"])')

.PHONY: all build install uninstall zip test lint i18n-check pot check release-check screenshots clean

all: build

build:
	rm -rf $(BUILD)
	mkdir -p $(BUILD)
	cp -r src/. $(BUILD)/
	cp LICENSE NOTICE $(BUILD)/
	glib-compile-schemas $(BUILD)/schemas
	python3 scripts/i18n.py compile $(BUILD)/locale

install: build
	rm -rf $(INSTALL)
	mkdir -p $(INSTALL)
	cp -r $(BUILD)/. $(INSTALL)/
	@echo "Installed to $(INSTALL). Log out and back in, then: gnome-extensions enable $(UUID)"

uninstall:
	rm -rf $(INSTALL)

# GNOME Shell 44+ compiles schemas itself, so the package ships only the XML
zip: build
	mkdir -p $(DIST)
	rm -f $(ZIP)
	cd $(BUILD) && zip -qr ../../$(ZIP) . -x schemas/gschemas.compiled
	cd $(DIST) && sha256sum $(notdir $(ZIP)) > SHA256SUMS
	@echo "Created $(ZIP) and $(DIST)/SHA256SUMS"

test:
	python3 scripts/i18n.py compile build/test-locale >/dev/null
	mkdir -p build/test-schemas
	glib-compile-schemas --strict --targetdir=build/test-schemas src/schemas
	UWI_TEST_LOCALE_DIR=build/test-locale UWI_TEST_SCHEMA_DIR=build/test-schemas gjs -m tests/run.js
	python3 -I -m unittest discover --start-directory tests --pattern 'test_*.py' --quiet

lint:
	npx eslint src tests scripts

i18n-check:
	python3 scripts/i18n.py check

pot:
	python3 scripts/i18n.py extract
	python3 scripts/i18n.py update

check: lint test i18n-check

# The same checks as .github/workflows/release.yml before it publishes v$(VERSION)
release-check: check zip
	python3 -I scripts/release-notes.py v$(VERSION) --dist $(DIST) --output build/release-notes.md
	@echo "Ready to tag v$(VERSION); release notes in build/release-notes.md"

screenshots:
	scripts/screenshots.sh
	UWI_LANGUAGE=sl scripts/screenshots.sh

clean:
	rm -rf build $(DIST)
