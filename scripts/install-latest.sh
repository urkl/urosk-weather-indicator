#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
# SPDX-License-Identifier: Apache-2.0
#
# Installs or updates Urosk Weather Indicator for the current user from a GitHub release.
# No sudo: the extension goes to ~/.local/share/gnome-shell/extensions. Your settings
# (locations, units, rivers …) live in dconf, not in the extension folder, so an update
# keeps them.
#
#   curl -fsSL https://raw.githubusercontent.com/urkl/urosk-weather-indicator/main/scripts/install-latest.sh | bash
#
# Options (with curl: … | bash -s -- --version 1.1.0):
#   --version X.Y.Z   install this release instead of the latest one
#   --file PATH       install a downloaded .shell-extension.zip
#   --force           install even if your GNOME Shell version is not listed as supported
#
# UWI_RELEASES_URL overrides https://github.com/urkl/urosk-weather-indicator/releases (for tests).
set -euo pipefail

UUID=urosk-weather-indicator@urosk.net
ASSET=$UUID.shell-extension.zip
RELEASES=${UWI_RELEASES_URL:-https://github.com/urkl/urosk-weather-indicator/releases}

say() { printf '%s\n' "$*"; }
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

VERSION='' FILE='' FORCE=0
while [ $# -gt 0 ]; do
    case $1 in
        --version) [ $# -ge 2 ] || fail '--version needs a value, e.g. --version 1.1.0'; VERSION=${2#v}; shift 2 ;;
        --file) [ $# -ge 2 ] || fail '--file needs a path'; FILE=$2; shift 2 ;;
        --force) FORCE=1; shift ;;
        -h|--help) sed -n '5,17s/^# \{0,1\}//p' "$0" 2>/dev/null || true; exit 0 ;;
        *) fail "unknown option $1 (see --help)" ;;
    esac
done
[ -z "$VERSION" ] || [[ $VERSION =~ ^[0-9]+(\.[0-9]+){1,2}$ ]] || fail "not a version number: $VERSION"

[ "$(id -u)" -ne 0 ] || fail 'run this as your own user, not as root: extensions are installed per user.'
command -v gnome-extensions >/dev/null || fail 'gnome-extensions not found; is GNOME Shell installed?'
command -v python3 >/dev/null || fail 'python3 not found.'

WORK=$(mktemp -d "${TMPDIR:-/tmp}/uwi-install.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

download() { # url target → 0 when downloaded
    if command -v curl >/dev/null; then
        curl -fsSL --retry 2 -o "$2" "$1" 2>/dev/null
    elif command -v wget >/dev/null; then
        wget -q -O "$2" "$1"
    else
        fail 'curl or wget is needed to download the release.'
    fi
}

if [ -n "$FILE" ]; then
    [ -f "$FILE" ] || fail "no such file: $FILE"
    cp "$FILE" "$WORK/$ASSET"
    say "Installing $FILE"
else
    if [ -n "$VERSION" ]; then
        BASE=$RELEASES/download/v$VERSION
        say "Downloading Urosk Weather Indicator $VERSION …"
    else
        BASE=$RELEASES/latest/download
        say 'Downloading the latest release of Urosk Weather Indicator …'
    fi
    download "$BASE/$ASSET" "$WORK/$ASSET" || fail "could not download $BASE/$ASSET"
    if download "$BASE/SHA256SUMS" "$WORK/SHA256SUMS"; then
        EXPECTED=$(awk -v asset="$ASSET" '$2 == asset || $2 == "*" asset {print $1}' "$WORK/SHA256SUMS")
        [ -n "$EXPECTED" ] || fail "SHA256SUMS of the release does not list $ASSET"
        ACTUAL=$(python3 -I -c 'import hashlib, sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "$WORK/$ASSET")
        [ "$EXPECTED" = "$ACTUAL" ] || fail 'checksum mismatch: the download is damaged or not the published file.'
        say 'Checksum OK.'
    else
        say 'Note: this release publishes no SHA256SUMS; the checksum was not verified.'
    fi
fi

# uuid, version and supported shells from the package itself
read_metadata() { # zip → "uuid<TAB>version<TAB>shells…"
    python3 -I - "$1" <<'PY'
import json, sys, zipfile
try:
    with zipfile.ZipFile(sys.argv[1]) as package:
        meta = json.loads(package.read('metadata.json'))
except (OSError, KeyError, ValueError, zipfile.BadZipFile) as error:
    sys.exit(f'not an extension package: {error}')
print(meta.get('uuid', ''), meta.get('version-name', meta.get('version', '?')), ' '.join(map(str, meta.get('shell-version', []))), sep='\t')
PY
}
IFS=$'\t' read -r PACKAGE_UUID PACKAGE_VERSION PACKAGE_SHELLS < <(read_metadata "$WORK/$ASSET") ||
    fail 'the file is not a GNOME Shell extension package.'
[ "$PACKAGE_UUID" = "$UUID" ] || fail "the package is $PACKAGE_UUID, not $UUID."

SHELL_MAJOR=$(gnome-shell --version 2>/dev/null | sed -n 's/^GNOME Shell \([0-9][0-9]*\).*/\1/p' || true)
if [ -n "$SHELL_MAJOR" ] && ! [[ " $PACKAGE_SHELLS " == *" $SHELL_MAJOR "* ]]; then
    [ "$FORCE" -eq 1 ] || fail "version $PACKAGE_VERSION supports GNOME Shell $PACKAGE_SHELLS, you have $SHELL_MAJOR. Use --version for another release, or --force to install anyway."
    say "Warning: GNOME Shell $SHELL_MAJOR is not listed as supported ($PACKAGE_SHELLS)."
fi

INSTALLED_META=${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID/metadata.json
PREVIOUS=''
if [ -f "$INSTALLED_META" ]; then
    PREVIOUS=$(python3 -I -c 'import json, sys; m = json.load(open(sys.argv[1])); print(m.get("version-name", m.get("version", "?")))' "$INSTALLED_META" 2>/dev/null || echo '?')
fi

gnome-extensions install --force "$WORK/$ASSET"

if [ "$PREVIOUS" = "$PACKAGE_VERSION" ]; then
    say "Reinstalled Urosk Weather Indicator $PACKAGE_VERSION. Your settings are kept."
elif [ -n "$PREVIOUS" ]; then
    say "Updated Urosk Weather Indicator $PREVIOUS → $PACKAGE_VERSION. Your settings are kept."
else
    say "Installed Urosk Weather Indicator $PACKAGE_VERSION."
    # The running shell does not know a new extension yet, so enabling over D-Bus may fail:
    # then add it to the list it reads at the next login
    if ! gnome-extensions enable "$UUID" 2>/dev/null; then
        python3 -I - "$UUID" <<'PY' || say "Enable it after logging in: gnome-extensions enable $UUID"
import ast, subprocess, sys
uuid = sys.argv[1]
def get(key):
    value = subprocess.run(['gsettings', 'get', 'org.gnome.shell', key], check=True, capture_output=True, text=True).stdout.strip()
    return list(ast.literal_eval(value.removeprefix('@as ')))
enabled, disabled = get('enabled-extensions'), get('disabled-extensions')
if uuid not in enabled:
    subprocess.run(['gsettings', 'set', 'org.gnome.shell', 'enabled-extensions', str(enabled + [uuid])], check=True)
if uuid in disabled:
    subprocess.run(['gsettings', 'set', 'org.gnome.shell', 'disabled-extensions', str([u for u in disabled if u != uuid])], check=True)
PY
    fi
fi

if [ "${XDG_SESSION_TYPE:-}" = x11 ]; then
    say 'Restart GNOME Shell to load it: Alt+F2, type r, press Enter (or log out and back in).'
else
    say 'Log out and back in to load it (on Wayland GNOME Shell loads extensions only at login).'
fi
