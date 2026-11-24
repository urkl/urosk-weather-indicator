// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * The top bar button. It owns the data (forecasts per location, river readings, the ARSO
 * text forecast), refreshes it on timers and when the menu opens, and hands it to the views.
 */
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {ARSO_TEXT_FORECAST_URL, parseArsoTextForecast} from '../lib/arsoText.js';
import {buildForecastUrl, parseForecast} from '../lib/forecast.js';
import {Formatter, formattingLocale, unitsFromSettings} from '../lib/format.js';
import {HttpClient} from '../lib/http.js';
import {_, fill} from '../lib/i18n.js';
import {ACTIVE_LOCATION_KEY, LOCATIONS_KEY, activeLocationIndex, locationKey, readLocations} from '../lib/locations.js';
import {moonDays, moonNow} from '../lib/moon.js';
import {ARSO_GAUGES_URL, parseArsoGauges} from '../lib/rivers/arso.js';
import {GAUGES_KEY, GaugeSource, gaugeKey, readGauges} from '../lib/rivers/gauges.js';
import {GLOFAS_REFRESH_SECONDS, buildFloodUrl, parseFlood} from '../lib/rivers/glofas.js';
import {GaugeHistory} from '../lib/rivers/history.js';
import {arsoStatus, glofasStatus, panelText} from '../lib/rivers/status.js';
import {MenuView} from './menuView.js';
import {PanelView} from './panelView.js';
import {IconCache} from './widgets.js';

/** A forecast younger than this is reused when switching locations or opening the menu. */
const FORECAST_FRESH_SECONDS = 10 * 60;
/** ARSO publishes every 30 minutes, a few minutes after the full and half hour. */
const ARSO_POLL_SECONDS = 10 * 60;
const ARSO_TEXT_FRESH_SECONDS = 60 * 60;
/** River readings older than this are shown dimmed in the top bar. */
const RIVER_STALE_SECONDS = 2 * 3600;
const DAY_CHECK_SECONDS = 10 * 60;

const nowSeconds = () => Math.floor(Date.now() / 1000);

function isCancelled(error, cancellable) {
    return cancellable?.is_cancelled() || error?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
}

export const WeatherIndicator = GObject.registerClass(
class WeatherIndicator extends PanelMenu.Button {
    /** @param {import('resource:///org/gnome/shell/extensions/extension.js').Extension} extension */
    _init(extension) {
        super._init(0.5, _('Weather'));
        this._extension = extension;
        this._settings = extension.getSettings();
        this._interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._http = new HttpClient();
        this._icons = new IconCache(`${extension.path}/icons`);
        this._history = new GaugeHistory();
        this._historyLoaded = this._history.load();

        this._forecasts = new Map();
        this._forecastError = null;
        this._arsoStations = null;
        this._arsoFetchedAt = 0;
        this._glofas = new Map();
        this._riverError = null;
        this._arsoText = null;
        this._arsoTextFetchedAt = 0;
        this._timers = [];

        this._panel = new PanelView(this, this._icons);
        this._menuView = new MenuView(this.menu, this._icons, {
            selectLocation: index => this._settings.set_int(ACTIVE_LOCATION_KEY, index),
            refresh: () => {
                this._refreshForecast({force: true});
                this._refreshRivers({force: true});
            },
            openPreferences: () => this._extension.openPreferences(),
            openUri: uri => this._openUri(uri),
        });

        this.menu.connect('open-state-changed', (_menu, open) => {
            if (!open)
                return;
            this._menuView.resetDay();
            this._refreshForecast();
            this._refreshRivers();
        });

        this._buildFormatter();
        this._loadLocations();
        this._loadGauges();
        this._connectSettings();
        this._startTimers();
        this._refreshForecast();
        this._refreshRivers();
    }

    // ---------- settings ----------

    _connectSettings() {
        const render = () => this._render();
        const reformat = () => {
            this._buildFormatter();
            this._render();
        };
        this._settings.connectObject(
            `changed::${LOCATIONS_KEY}`, () => {
                this._loadLocations();
                this._refreshForecast();
            },
            `changed::${ACTIVE_LOCATION_KEY}`, () => {
                this._loadLocations();
                this._refreshForecast();
            },
            `changed::${GAUGES_KEY}`, () => {
                this._loadGauges();
                this._refreshRivers();
            },
            'changed::rivers-enabled', () => this._refreshRivers(),
            'changed::river-in-panel', render,
            'changed::panel-days', render,
            'changed::panel-style', render,
            'changed::panel-show-current', render,
            'changed::panel-show-moon', render,
            'changed::show-arso-text', () => this._refreshForecast(),
            'changed::refresh-interval', () => this._startTimers(),
            'changed::temperature-unit', reformat,
            'changed::wind-speed-unit', reformat,
            'changed::precipitation-unit', reformat,
            'changed::pressure-unit', reformat,
            this);
        this._interfaceSettings.connectObject('changed::clock-format', reformat, this);
    }

    _buildFormatter() {
        this._formatter = new Formatter({
            locale: formattingLocale(),
            timeZone: GLib.TimeZone.new_local().get_identifier() || 'UTC',
            clockFormat: this._interfaceSettings.get_string('clock-format'),
            units: unitsFromSettings(this._settings),
        });
    }

    _loadLocations() {
        this._locations = readLocations(this._settings);
        this._activeIndex = activeLocationIndex(this._settings, this._locations.length);
        // Forget forecasts of removed locations
        const keys = new Set(this._locations.map(locationKey));
        for (const key of this._forecasts.keys()) {
            if (!keys.has(key))
                this._forecasts.delete(key);
        }
    }

    _loadGauges() {
        this._gauges = readGauges(this._settings);
    }

    get _activeLocation() {
        return this._locations[this._activeIndex] ?? null;
    }

    get _riversEnabled() {
        return this._settings.get_boolean('rivers-enabled') && this._gauges.length > 0;
    }

    // ---------- data ----------

    async _refreshForecast({force = false} = {}) {
        const location = this._activeLocation;
        if (!location) {
            this._render();
            return;
        }
        const key = locationKey(location);
        const cached = this._forecasts.get(key);
        if (!force && cached && nowSeconds() - cached.fetchedAt < FORECAST_FRESH_SECONDS) {
            this._render();
            this._refreshArsoText();
            return;
        }

        this._cancellable?.cancel();
        const cancellable = this._cancellable = new Gio.Cancellable();
        this._render();
        try {
            const json = await this._http.getJson(buildForecastUrl(location), cancellable);
            const forecast = parseForecast(json);
            // The Moon is computed locally, once per forecast, for the same local days
            const moon = moonDays(forecast.days, location);
            forecast.days.forEach((day, i) => {
                day.moon = moon[i];
            });
            this._forecasts.set(key, {forecast, fetchedAt: nowSeconds()});
            this._forecastError = null;
        } catch (error) {
            if (isCancelled(error, cancellable))
                return;
            this._forecastError = error.message;
            console.warn(`urosk-weather-indicator: forecast: ${error.message}`);
        } finally {
            if (this._cancellable === cancellable)
                this._cancellable = null;
        }
        if (this._destroyed)
            return;
        this._render();
        this._refreshArsoText();
    }

    async _refreshArsoText() {
        if (!this._settings.get_boolean('show-arso-text') ||
            nowSeconds() - this._arsoTextFetchedAt < ARSO_TEXT_FRESH_SECONDS)
            return;
        try {
            this._arsoText = parseArsoTextForecast(await this._http.getText(ARSO_TEXT_FORECAST_URL));
            this._arsoTextFetchedAt = nowSeconds();
        } catch (error) {
            console.warn(`urosk-weather-indicator: ARSO text forecast: ${error.message}`);
        }
        if (!this._destroyed)
            this._render();
    }

    async _refreshRivers({force = false} = {}) {
        if (!this._riversEnabled) {
            this._render();
            return;
        }
        await this._historyLoaded;
        if (this._riverRefreshRunning)
            return;
        this._riverRefreshRunning = true;
        const errors = [];
        const now = nowSeconds();
        try {
            const arsoGauges = this._gauges.filter(gauge => gauge.source === GaugeSource.ARSO);
            if (arsoGauges.length && (force || now - this._arsoFetchedAt >= ARSO_POLL_SECONDS)) {
                try {
                    const stations = parseArsoGauges(await this._http.getText(ARSO_GAUGES_URL));
                    this._arsoStations = new Map(stations.map(station => [station.id, station]));
                    this._arsoFetchedAt = now;
                    for (const gauge of arsoGauges) {
                        const station = this._arsoStations.get(gauge.id);
                        if (station)
                            this._history.add(gaugeKey(gauge), {t: station.time, level: station.level, flow: station.flow}, now);
                    }
                    this._history.retain(arsoGauges.map(gaugeKey));
                    await this._history.save();
                } catch (error) {
                    errors.push(`ARSO: ${error.message}`);
                }
            }

            for (const gauge of this._gauges.filter(item => item.source === GaugeSource.GLOFAS)) {
                const key = gaugeKey(gauge);
                const cached = this._glofas.get(key);
                if (!force && cached && now - cached.fetchedAt < GLOFAS_REFRESH_SECONDS)
                    continue;
                try {
                    const json = await this._http.getJson(buildFloodUrl(gauge));
                    this._glofas.set(key, {series: parseFlood(json, now), fetchedAt: now});
                } catch (error) {
                    errors.push(`GloFAS: ${error.message}`);
                }
            }
        } finally {
            this._riverRefreshRunning = false;
        }
        for (const error of errors)
            console.warn(`urosk-weather-indicator: rivers: ${error}`);
        this._riverError = errors.length ? errors.join('; ') : null;
        if (!this._destroyed)
            this._render();
    }

    _riverStatuses() {
        const now = nowSeconds();
        return this._gauges.map(gauge => gauge.source === GaugeSource.ARSO
            ? arsoStatus(gauge, this._arsoStations?.get(gauge.id) ?? null, this._history.series(gaugeKey(gauge)), now)
            : glofasStatus(gauge, this._glofas.get(gaugeKey(gauge))?.series ?? null));
    }

    // ---------- rendering ----------

    _render() {
        if (this._destroyed)
            return;
        const statuses = this._riversEnabled ? this._riverStatuses() : [];
        const first = statuses[0];
        const river = first && this._settings.get_boolean('river-in-panel')
            ? {
                text: panelText(first, this._formatter),
                alertLevel: first.missing ? null : first.alert.level,
                stale: !first.missing && first.age > RIVER_STALE_SECONDS,
            }
            : null;

        this._menuView.setLocations(this._locations, this._activeIndex);
        this._menuView.showRivers(statuses.length > 0);
        this._menuView.showArsoText(this._settings.get_boolean('show-arso-text') ? this._arsoText : null);

        const location = this._activeLocation;
        const entry = location ? this._forecasts.get(locationKey(location)) : null;
        if (!location) {
            this._panel.showMessage(_('Set a location'), river);
            this._menuView.showMessage(_('No location'), _('Add a location in the settings.'));
            this._menuView.setStatus(_('Open Settings and search for a place.'));
        } else if (!entry) {
            this._panel.showMessage(this._forecastError ? '⚠' : '…', river);
            this._menuView.showMessage(location.name, this._forecastError
                ? fill(_('Forecast not available: %s'), this._forecastError)
                : _('Loading the forecast…'));
            this._menuView.setStatus(this._forecastError ? fill(_('Error: %s'), this._forecastError) : _('Loading…'));
        } else {
            const fmt = this._formatter.withTimeZone(entry.forecast.timeZone);
            this._panel.update({
                forecast: entry.forecast,
                fmt,
                days: this._settings.get_int('panel-days'),
                compact: this._settings.get_string('panel-style') === 'compact',
                showCurrent: this._settings.get_boolean('panel-show-current'),
                moonPhase: this._settings.get_boolean('panel-show-moon') ? entry.forecast.days[0]?.moon?.phase ?? null : null,
                stale: Boolean(this._forecastError),
                river,
            });
            this._menuView.showForecast(entry.forecast, fmt, location.name, moonNow(nowSeconds()));
            this._menuView.setStatus(this._statusText(entry));
        }

        if (statuses.length) {
            const fmt = entry ? this._formatter.withTimeZone(entry.forecast.timeZone) : this._formatter;
            this._menuView.rivers.update(statuses, fmt, nowSeconds(), this._riverError);
        }
    }

    _statusText(entry) {
        const fmt = this._formatter;
        const models = entry.forecast.modelsWithData.map(model => model.name).join(', ');
        const updated = this._forecastError
            ? fill(_('Update failed: %s · last forecast %s'), this._forecastError, fmt.dateTime(entry.fetchedAt))
            : fill(_('Updated %s · %s'), fmt.time(entry.fetchedAt), models);
        return `${updated}\n${_('Weather data by Open-Meteo.com (CC BY 4.0)')}`;
    }

    // ---------- timers ----------

    _startTimers() {
        this._stopTimers();
        const every = (seconds, callback) => this._timers.push(
            GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
                callback();
                return GLib.SOURCE_CONTINUE;
            }));

        every(this._settings.get_int('refresh-interval') * 60, () => this._refreshForecast({force: true}));
        every(ARSO_POLL_SECONDS, () => this._refreshRivers());
        // After midnight or a resume from suspend "today" changes: refresh then
        this._dayKey = this._formatter.dayKey(nowSeconds());
        every(DAY_CHECK_SECONDS, () => {
            const dayKey = this._formatter.dayKey(nowSeconds());
            if (dayKey !== this._dayKey) {
                this._dayKey = dayKey;
                this._refreshForecast({force: true});
            }
        });
    }

    _stopTimers() {
        this._timers.forEach(id => GLib.source_remove(id));
        this._timers = [];
    }

    _openUri(uri) {
        try {
            Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
        } catch (error) {
            console.warn(`urosk-weather-indicator: cannot open ${uri}: ${error.message}`);
        }
        this.menu.close();
    }

    _onDestroy() {
        this._destroyed = true;
        this._stopTimers();
        this._cancellable?.cancel();
        this._http.destroy();
        super._onDestroy();
    }
});
