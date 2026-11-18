// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Locale-aware formatting of numbers, units, dates and times. Every value shown in the
 * extension goes through a `Formatter`, so units, the clock format and the time zone of
 * the selected location are applied in exactly one place.
 */
import GLib from 'gi://GLib';

import {_, N_, fill, ngettext} from './i18n.js';
import {
    PrecipitationUnit, PressureUnit, TemperatureUnit, UNIT_SYMBOLS, WindSpeedUnit,
    convertPrecipitation, convertPressure, convertTemperature, convertWindSpeed,
} from './units.js';

const MISSING = '–';

const isValue = value => value !== null && value !== undefined && !Number.isNaN(value);

/**
 * Converts a POSIX locale name such as `sl_SI.UTF-8` into a BCP 47 tag (`sl-SI`).
 *
 * @param {string|null} name
 * @returns {string|null} `null` for the C/POSIX locale or an invalid name
 */
export function posixToBcp47(name) {
    if (!name || name === 'C' || name === 'POSIX' || name.startsWith('C.'))
        return null;
    const tag = name.split('.')[0].split('@')[0].replace('_', '-');
    try {
        return Intl.getCanonicalLocales(tag)[0] ?? null;
    } catch {
        return null;
    }
}

/**
 * Locale for number and date formatting: honours `LC_ALL`, then `LC_TIME`, then `LANG`,
 * so a user with an English interface and local date formats gets what they configured.
 *
 * @returns {string}
 */
export function formattingLocale() {
    for (const variable of ['LC_ALL', 'LC_TIME', 'LANG']) {
        const tag = posixToBcp47(GLib.getenv(variable));
        if (tag)
            return tag;
    }
    return 'en';
}

/**
 * Language for place names returned by the geocoding service (`sl`, `en`, …).
 *
 * @returns {string}
 */
export function interfaceLanguage() {
    for (const name of GLib.get_language_names()) {
        const tag = posixToBcp47(name);
        if (tag)
            return tag.split('-')[0];
    }
    return 'en';
}

/** Capitalizes the first letter (weekday names are lowercase in many languages). */
export function capitalize(text) {
    return text ? text[0].toLocaleUpperCase() + text.slice(1) : text;
}

const COMPASS_POINTS = [N_('N'), N_('NE'), N_('E'), N_('SE'), N_('S'), N_('SW'), N_('W'), N_('NW')];

export const DEFAULT_UNITS = Object.freeze({
    temperature: TemperatureUnit.CELSIUS,
    windSpeed: WindSpeedUnit.KMH,
    precipitation: PrecipitationUnit.MM,
    pressure: PressureUnit.HPA,
});

export class Formatter {
    /**
     * @param {object} [options]
     * @param {string} [options.locale] BCP 47 locale for numbers and dates
     * @param {string} [options.timeZone] IANA time zone of the displayed location
     * @param {string} [options.clockFormat] `24h` or `12h` (GNOME setting)
     * @param {object} [options.units] see `DEFAULT_UNITS`
     */
    constructor({locale = 'en', timeZone = 'UTC', clockFormat = '24h', units = {}} = {}) {
        this.locale = locale;
        this.timeZone = timeZone;
        this.clockFormat = clockFormat;
        this.units = {...DEFAULT_UNITS, ...units};
        this._formats = new Map();
    }

    /** A formatter with the same settings for another time zone. */
    withTimeZone(timeZone) {
        const {locale, clockFormat, units} = this;
        return new Formatter({locale, timeZone, clockFormat, units});
    }

    _cached(kind, options, create) {
        const key = `${kind}:${JSON.stringify(options)}`;
        let format = this._formats.get(key);
        if (!format) {
            format = create();
            this._formats.set(key, format);
        }
        return format;
    }

    _dateFormat(options) {
        return this._cached('date', options, () => {
            try {
                return new Intl.DateTimeFormat(this.locale, {timeZone: this.timeZone, ...options});
            } catch {
                // Unknown time zone from a stale setting: fall back to UTC rather than failing
                return new Intl.DateTimeFormat(this.locale, {timeZone: 'UTC', ...options});
            }
        });
    }

    _formatDate(unixSeconds, options) {
        return isValue(unixSeconds) ? this._dateFormat(options).format(new Date(unixSeconds * 1000)) : MISSING;
    }

    _part(unixSeconds, options, type) {
        return this._dateFormat(options).formatToParts(new Date(unixSeconds * 1000))
            .find(part => part.type === type)?.value;
    }

    get _hourCycle() {
        return this.clockFormat === '12h' ? 'h12' : 'h23';
    }

    /**
     * @param {number|null} value
     * @param {number} [fractionDigits]
     * @returns {string}
     */
    number(value, fractionDigits = 0) {
        if (!isValue(value))
            return MISSING;
        const format = this._cached('number', fractionDigits, () => new Intl.NumberFormat(this.locale, {
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits,
        }));
        // Avoid "−0" after rounding a small negative value
        const rounded = Number(value.toFixed(fractionDigits));
        return format.format(rounded === 0 ? 0 : rounded);
    }

    /** @param {number|null} percent 0–100 */
    percent(percent) {
        if (!isValue(percent))
            return MISSING;
        const format = this._cached('percent', null, () => new Intl.NumberFormat(this.locale, {
            style: 'percent', maximumFractionDigits: 0,
        }));
        return format.format(Math.round(percent) / 100);
    }

    /** Temperature in the configured unit, e.g. `12°`. */
    temperature(celsius) {
        return isValue(celsius) ? `${this.number(Math.round(this.temperatureValue(celsius)))}°` : MISSING;
    }

    temperatureValue(celsius) {
        return convertTemperature(celsius, this.units.temperature);
    }

    /** Precipitation amount with unit; small amounts keep one (mm) or two (inch) decimals. */
    precipitation(mm) {
        if (!isValue(mm))
            return MISSING;
        const unit = this.units.precipitation;
        const value = convertPrecipitation(mm, unit);
        const digits = unit === PrecipitationUnit.INCH ? (value < 1 ? 2 : 1) : (value < 10 ? 1 : 0);
        return `${this.number(value, digits)} ${UNIT_SYMBOLS[unit]}`;
    }

    /** Precipitation number without unit (hourly strip). */
    precipitationShort(mm) {
        if (!isValue(mm))
            return MISSING;
        const unit = this.units.precipitation;
        return this.number(convertPrecipitation(mm, unit), unit === PrecipitationUnit.INCH ? 2 : 1);
    }

    get precipitationSymbol() {
        return UNIT_SYMBOLS[this.units.precipitation];
    }

    windSpeed(kmh) {
        if (!isValue(kmh))
            return MISSING;
        const unit = this.units.windSpeed;
        const value = convertWindSpeed(kmh, unit);
        return `${this.number(value, unit === WindSpeedUnit.MS && value < 10 ? 1 : 0)} ${UNIT_SYMBOLS[unit]}`;
    }

    pressure(hpa) {
        if (!isValue(hpa))
            return MISSING;
        const unit = this.units.pressure;
        return `${this.number(convertPressure(hpa, unit), unit === PressureUnit.INHG ? 2 : 0)} ${UNIT_SYMBOLS[unit]}`;
    }

    /** River discharge in m³/s with precision that suits the magnitude. */
    discharge(cubicMetres) {
        if (!isValue(cubicMetres))
            return MISSING;
        const digits = cubicMetres < 10 ? 2 : cubicMetres < 100 ? 1 : 0;
        return `${this.number(cubicMetres, digits)} m³/s`;
    }

    /** Water level in cm (gauge zero), always metric as published by the gauge. */
    waterLevel(cm) {
        return isValue(cm) ? `${this.number(cm)} cm` : MISSING;
    }

    /** Wind direction in degrees (where the wind blows from) → compass point. */
    compass(degrees) {
        if (!isValue(degrees))
            return '';
        return _(COMPASS_POINTS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8]);
    }

    /** Time of day honouring the GNOME clock format, e.g. `07:12` or `7:12 AM`. */
    time(unixSeconds) {
        return this._formatDate(unixSeconds, {hour: '2-digit', minute: '2-digit', hourCycle: this._hourCycle});
    }

    /** Short hour label for charts and the hourly strip, e.g. `07` or `7 AM`. */
    hour(unixSeconds) {
        return this.clockFormat === '12h'
            ? this._formatDate(unixSeconds, {hour: 'numeric', hourCycle: 'h12'})
            : this._formatDate(unixSeconds, {hour: '2-digit', hourCycle: 'h23'});
    }

    /** Hour of day 0–23 in the location's time zone. */
    hourOfDay(unixSeconds) {
        return Number(this._part(unixSeconds, {hour: '2-digit', hourCycle: 'h23'}, 'hour')) % 24;
    }

    /** Stable key of the local calendar day, `YYYY-MM-DD`. */
    dayKey(unixSeconds) {
        const format = this._cached('dayKey', this.timeZone, () => {
            try {
                return new Intl.DateTimeFormat('en-CA', {timeZone: this.timeZone, year: 'numeric', month: '2-digit', day: '2-digit'});
            } catch {
                return new Intl.DateTimeFormat('en-CA', {timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit'});
            }
        });
        return format.format(new Date(unixSeconds * 1000));
    }

    date(unixSeconds) {
        return this._formatDate(unixSeconds, {day: 'numeric', month: 'numeric', year: 'numeric'});
    }

    shortDate(unixSeconds) {
        return this._formatDate(unixSeconds, {day: 'numeric', month: 'numeric'});
    }

    dateTime(unixSeconds) {
        return isValue(unixSeconds) ? `${this.date(unixSeconds)} ${this.time(unixSeconds)}` : MISSING;
    }

    /** Weekday name, short (`Mon`) or long (`Monday`). */
    weekday(unixSeconds, {long = false} = {}) {
        return this._formatDate(unixSeconds, {weekday: long ? 'long' : 'short'});
    }

    /** Age of a measurement, e.g. "just now", "7 min ago", "2 h ago". */
    age(seconds) {
        if (seconds < 90)
            return _('just now');
        if (seconds < 90 * 60) {
            const minutes = Math.round(seconds / 60);
            return fill(ngettext('%d min ago', '%d min ago', minutes), minutes);
        }
        const hours = Math.round(seconds / 3600);
        return fill(ngettext('%d h ago', '%d h ago', hours), hours);
    }
}

/**
 * Unit preferences from the extension settings.
 *
 * @param {import('gi://Gio').Settings} settings
 * @returns {object} see `DEFAULT_UNITS`
 */
export function unitsFromSettings(settings) {
    return {
        temperature: settings.get_string('temperature-unit'),
        windSpeed: settings.get_string('wind-speed-unit'),
        precipitation: settings.get_string('precipitation-unit'),
        pressure: settings.get_string('pressure-unit'),
    };
}
