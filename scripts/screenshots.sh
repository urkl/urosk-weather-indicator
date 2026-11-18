#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
# SPDX-License-Identifier: Apache-2.0
#
# Regenerates docs/screenshots/*.png: starts a headless GNOME Shell with its own D-Bus,
# runtime and config directories (your session is not touched), installs the extension and
# the screenshot helper, and lets the helper capture the top bar, the menu and the
# preferences with live data for Komenda, Slovenia.
#
# Usage: scripts/screenshots.sh
#   UWI_LANGUAGE=sl UWI_OUTPUT_DIR=/tmp/shots scripts/screenshots.sh   (another language, elsewhere)
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
UUID=urosk-weather-indicator@urosk.net
HELPER=screenshot-helper@urosk.net
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

export XDG_DATA_HOME=$WORK/data XDG_CONFIG_HOME=$WORK/config XDG_CACHE_HOME=$WORK/cache XDG_RUNTIME_DIR=$WORK/runtime
export UWI_SCREENSHOT_DIR=$WORK/shots
OUTPUT=${UWI_OUTPUT_DIR:-$ROOT/docs/screenshots}
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 LANGUAGE=${UWI_LANGUAGE:-en}
mkdir -p "$XDG_RUNTIME_DIR" "$UWI_SCREENSHOT_DIR" && chmod 700 "$XDG_RUNTIME_DIR"

EXTENSIONS=$XDG_DATA_HOME/gnome-shell/extensions
mkdir -p "$EXTENSIONS/$UUID" "$EXTENSIONS/$HELPER"
make -C "$ROOT" --quiet build >/dev/null
cp -r "$ROOT/build/$UUID/." "$EXTENSIONS/$UUID/"
cp "$ROOT"/scripts/screenshot-helper/* "$ROOT"/scripts/prefs-demo.js "$EXTENSIONS/$HELPER/"

session() {
    local schema=org.gnome.shell.extensions.urosk-weather-indicator
    local ext="gsettings --schemadir $EXTENSIONS/$UUID/schemas"
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.shell enabled-extensions "['$UUID', '$HELPER']"
    gsettings set org.gnome.shell welcome-dialog-last-shown-version '999'
    gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
    gsettings set org.gnome.desktop.interface clock-format '24h'
    $ext set $schema locations "[
        {'name': <'Komenda'>, 'description': <'Komenda, Slovenia'>, 'latitude': <46.20484>, 'longitude': <14.53839>},
        {'name': <'Ljubljana'>, 'description': <'Slovenia'>, 'latitude': <46.05108>, 'longitude': <14.50513>},
        {'name': <'Kranjska Gora'>, 'description': <'Slovenia'>, 'latitude': <46.48455>, 'longitude': <13.78557>}]"
    $ext set $schema rivers-enabled true
    $ext set $schema river-gauges "[
        {'source': <'arso'>, 'id': <'4570'>, 'name': <'Pšata – Topole'>, 'latitude': <46.17373>, 'longitude': <14.56263>,
         'warning1': <0.0>, 'warning2': <0.0>, 'warning3': <0.0>},
        {'source': <'arso'>, 'id': <'3570'>, 'name': <'Sava – Šentjakob'>, 'latitude': <46.08396>, 'longitude': <14.58251>,
         'warning1': <0.0>, 'warning2': <0.0>, 'warning3': <0.0>},
        {'source': <'glofas'>, 'id': <''>, 'name': <'Sava near Medno'>, 'latitude': <46.12252>, 'longitude': <14.44047>,
         'warning1': <0.0>, 'warning2': <0.0>, 'warning3': <0.0>}]"
    timeout 240 gnome-shell --headless --virtual-monitor 1920x1200 --wayland --no-x11 >"$WORK/shell.log" 2>&1 || true
}
export -f session
export WORK EXTENSIONS UUID HELPER
dbus-run-session -- bash -c session

if [ ! -f "$UWI_SCREENSHOT_DIR/.done" ] || grep -q 'screenshot-helper: FAILED' "$WORK/shell.log"; then
    echo "Screenshots failed. Shell log:" >&2
    grep -E 'screenshot-helper|urosk-weather-indicator|JS ERROR|Error' "$WORK/shell.log" >&2 || tail -40 "$WORK/shell.log" >&2
    exit 1
fi

mkdir -p "$OUTPUT"
cp "$UWI_SCREENSHOT_DIR"/*.png "$OUTPUT/"
grep -E 'screenshot-helper|urosk-weather-indicator|JS (ERROR|WARNING)' "$WORK/shell.log" || true
echo "Screenshots saved to $OUTPUT"
