<!--
SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

# Contributing

Thank you for helping! Bug reports, translations and pull requests are welcome.

## Reporting a problem

Please include your GNOME Shell version (`gnome-shell --version`), the extension version
(`version-name` in `metadata.json`) and the relevant log lines:

```sh
journalctl --user -b -o cat /usr/bin/gnome-shell | grep -i urosk-weather-indicator
```

For a wrong forecast value, mention the location (or coordinates) and the time — the data comes
from Open-Meteo, ARSO or GloFAS, and the extension only combines it.

## Pull requests

1. Keep changes focused; one topic per pull request.
2. Code, comments and user interface text are in English. User-visible strings go through
   `_()` (or `N_()` / `ngettext()`); then run `make pot` and translate what you can.
3. Logic that does not need the shell belongs in `src/lib/` and gets a unit test in `tests/`.
4. Before opening the pull request:

   ```sh
   npm ci
   make check        # ESLint, unit tests, translation check
   make screenshots  # if the user interface changed (needs GNOME Shell 48+)
   ```

5. Every source file starts with the SPDX header used in the project. By contributing you agree
   that your contribution is licensed under the Apache License 2.0.

## Translations

See [Translations](README.md#translations) in the README.
