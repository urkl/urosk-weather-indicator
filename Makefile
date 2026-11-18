# SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
# SPDX-License-Identifier: Apache-2.0
#
# make            build into build/ (compiled schemas and translations)
# make install    install for the current user (log out and in to load it on Wayland)
# make zip        package for extensions.gnome.org / GitHub releases
# make check      lint, unit tests and translation check

UUID     := urosk-weather-indicator@urosk.net
BUILD    := build/$(UUID)
DIST     := dist
ZIP      := $(DIST)/$(UUID).shell-extension.zip
INSTALL  := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: all build install uninstall zip test lint i18n-check pot check screenshots clean

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
	@echo "Created $(ZIP)"

test:
	gjs -m tests/run.js

lint:
	npx eslint src tests scripts

i18n-check:
	python3 scripts/i18n.py check

pot:
	python3 scripts/i18n.py extract
	python3 scripts/i18n.py update

check: lint test i18n-check

screenshots:
	scripts/screenshots.sh

clean:
	rm -rf build $(DIST)
