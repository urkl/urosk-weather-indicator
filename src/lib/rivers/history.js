// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Local history of ARSO gauge readings. The ARSO feed only contains the latest value, so the
 * extension keeps the readings it has seen (72 hours) to draw a chart and compute the trend.
 * Stored in `~/.cache/urosk-weather-indicator/arso-history.json`.
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const HISTORY_SECONDS = 72 * 3600;

/** Rise in cm per hour from which the trend is shown as a fast rise (⇈). */
export const FAST_RISE_CM_PER_HOUR = 10;

/**
 * @typedef {object} Sample
 * @property {number} t Unix seconds
 * @property {number|null} level cm
 * @property {number|null} flow m³/s
 */

/**
 * Adds a sample (replacing one with the same time) and drops samples older than the window.
 *
 * @param {Sample[]} series
 * @param {Sample} sample
 * @param {number} now Unix seconds
 * @returns {Sample[]} new sorted series
 */
export function mergeSample(series, sample, now) {
    const merged = series.filter(existing => existing.t !== sample.t);
    if (sample.t !== null && (sample.level !== null || sample.flow !== null))
        merged.push(sample);
    return merged
        .filter(existing => now - existing.t <= HISTORY_SECONDS)
        .sort((a, b) => a.t - b.t);
}

/**
 * Change of the water level per hour, from the latest reading and the reading closest to
 * one hour earlier (between 20 and 90 minutes earlier).
 *
 * @param {Sample[]} series sorted
 * @returns {number|null} cm per hour
 */
export function levelTrend(series) {
    const withLevel = series.filter(sample => sample.level !== null);
    const last = withLevel.at(-1);
    if (!last)
        return null;
    const candidates = withLevel.filter(sample => {
        const age = last.t - sample.t;
        return age >= 20 * 60 && age <= 90 * 60;
    });
    if (candidates.length === 0)
        return null;
    const earlier = candidates.reduce((best, sample) =>
        Math.abs(last.t - sample.t - 3600) < Math.abs(last.t - best.t - 3600) ? sample : best);
    return (last.level - earlier.level) * 3600 / (last.t - earlier.t);
}

/**
 * Arrow for a level trend: ⇈ fast rise, ↑ rising, → steady, ↓ falling.
 *
 * @param {number|null} cmPerHour
 * @returns {string}
 */
export function trendArrow(cmPerHour) {
    if (cmPerHour === null || cmPerHour === undefined)
        return '';
    if (cmPerHour >= FAST_RISE_CM_PER_HOUR)
        return '⇈';
    if (cmPerHour >= 2)
        return '↑';
    if (cmPerHour <= -2)
        return '↓';
    return '→';
}

function defaultPath() {
    return GLib.build_filenamev([GLib.get_user_cache_dir(), 'urosk-weather-indicator', 'arso-history.json']);
}

export class GaugeHistory {
    /** @param {string} [path] */
    constructor(path = defaultPath()) {
        this._file = Gio.File.new_for_path(path);
        this._series = {};
    }

    /** Loads the cache; a missing or broken file simply starts an empty history. */
    async load() {
        try {
            const [contents] = await new Promise((resolve, reject) => {
                this._file.load_contents_async(null, (file, result) => {
                    try {
                        const [, bytes, etag] = file.load_contents_finish(result);
                        resolve([bytes, etag]);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            const parsed = JSON.parse(new TextDecoder().decode(contents));
            this._series = parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                console.warn(`urosk-weather-indicator: river history not loaded: ${error.message}`);
            this._series = {};
        }
    }

    async save() {
        try {
            const parent = this._file.get_parent();
            if (parent && !parent.query_exists(null))
                parent.make_directory_with_parents(null);
            const bytes = new TextEncoder().encode(JSON.stringify(this._series));
            await new Promise((resolve, reject) => {
                this._file.replace_contents_bytes_async(new GLib.Bytes(bytes), null, false,
                    Gio.FileCreateFlags.REPLACE_DESTINATION, null, (file, result) => {
                        try {
                            file.replace_contents_finish(result);
                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    });
            });
        } catch (error) {
            console.warn(`urosk-weather-indicator: river history not saved: ${error.message}`);
        }
    }

    /**
     * @param {string} key gauge key
     * @param {Sample} sample
     * @param {number} now
     */
    add(key, sample, now) {
        this._series[key] = mergeSample(this._series[key] ?? [], sample, now);
    }

    /** @returns {Sample[]} */
    series(key) {
        return this._series[key] ?? [];
    }

    /** Forgets gauges that are no longer saved. */
    retain(keys) {
        for (const key of Object.keys(this._series)) {
            if (!keys.includes(key))
                delete this._series[key];
        }
    }
}
