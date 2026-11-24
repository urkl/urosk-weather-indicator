<!--
SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
SPDX-License-Identifier: Apache-2.0
-->

# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/).

## [1.1.0] — 2026-11-24

### Added

- Moon: phase with icon, illuminated fraction, age, moonrise and moonset for the selected location, and the date and time of the next full and new moon. Computed locally (Meeus' lunar theory and a truncated VSOP87 Sun; phases within a minute), no extra requests.  
- Moon phase icon for every day in the 7-day list and the phase, moonrise and moonset in the summary of the selected day.  
- Optional moon phase in the top bar (Settings → General → Top bar → Moon phase, off by default).  
- Export and import of all settings as a JSON file (Settings → General → Transfer settings); invalid values and unknown keys are skipped.  
- `scripts/install-latest.sh`: install or update the latest (or a chosen) GitHub release with one command, without sudo, with SHA256 and GNOME Shell version checks.  
- `make zip` also writes `dist/SHA256SUMS`.

### Changed

- Dates are written as dd.mm.yyyy (and dd.mm. for short dates) in every language, in the time zone of the location.

## [1.0.0] — 2026-11-18

First public release, rewritten from a private extension for one location in Slovenia.

### Added

- Median of six Open-Meteo weather models with the model range and disagreement warnings.  
- Top bar with current temperature and up to seven days; menu with current conditions, 7-day
  list, hourly chart, hourly strip and the forecast of each model.  
- Several locations with place search (Open-Meteo geocoding) or coordinates; location switcher
  in the menu; times in each location's time zone.  
- River gauges: worldwide modelled discharge (GloFAS via the Open-Meteo Flood API) and live ARSO
  gauges in Slovenia with official thresholds, custom alert levels, trend and charts.  
- Units for temperature, wind speed, precipitation and pressure; 12/24-hour clock from GNOME.  
- Optional ARSO text forecast for Slovenia.  
- English and Slovenian, following the desktop or chosen in the settings (also sets the date and
  number format).  
- Unit tests, ESLint, GitHub Actions CI and automated screenshots in a headless GNOME Shell.
