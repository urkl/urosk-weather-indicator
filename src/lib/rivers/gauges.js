// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Saved river gauges. A gauge is either a live ARSO station (Slovenia: water level and
 * discharge) or any point on a river worldwide with modelled daily discharge from GloFAS.
 */
import {N_} from '../i18n.js';
import {readRecords, writeRecords} from '../records.js';

export const GAUGES_KEY = 'river-gauges';

export const GaugeSource = Object.freeze({ARSO: 'arso', GLOFAS: 'glofas'});

/** Names of alert levels 1–3; colours follow the Meteoalarm convention. */
export const ALERT_NAMES = Object.freeze([null, N_('Yellow alert'), N_('Orange alert'), N_('Red alert')]);
export const ALERT_CLASSES = Object.freeze(['normal', 'yellow', 'orange', 'red']);

/**
 * @typedef {object} Gauge
 * @property {string} source one of `GaugeSource`
 * @property {string} id ARSO station id (empty for GloFAS)
 * @property {string} name
 * @property {number} latitude
 * @property {number} longitude
 * @property {number[]} warnings custom yellow, orange and red thresholds (cm for ARSO level,
 *     m³/s for GloFAS); 0 = not set. All 0 = use the official ARSO thresholds where available.
 */

/**
 * Validates a stored record.
 *
 * @param {object} record
 * @returns {Gauge|null}
 */
export function normalizeGauge(record) {
    const source = record?.source;
    const latitude = Number(record?.latitude ?? NaN);
    const longitude = Number(record?.longitude ?? NaN);
    const id = String(record?.id ?? '').trim();
    if (source === GaugeSource.ARSO && !/^\d+$/.test(id))
        return null;
    if (source === GaugeSource.GLOFAS && !(Number.isFinite(latitude) && Number.isFinite(longitude)))
        return null;
    if (source !== GaugeSource.ARSO && source !== GaugeSource.GLOFAS)
        return null;

    const warnings = [record.warning1, record.warning2, record.warning3]
        .map(value => Number(value ?? 0))
        .map(value => Number.isFinite(value) && value > 0 ? value : 0);
    return {
        source,
        id,
        name: String(record.name ?? '').trim() || id,
        latitude: Number.isFinite(latitude) ? latitude : 0,
        longitude: Number.isFinite(longitude) ? longitude : 0,
        warnings,
    };
}

/** Identity of a gauge in the saved list and in the history cache. */
export function gaugeKey(gauge) {
    return gauge.source === GaugeSource.ARSO
        ? `arso:${gauge.id}`
        : `glofas:${gauge.latitude.toFixed(3)},${gauge.longitude.toFixed(3)}`;
}

/**
 * @param {import('gi://Gio').Settings} settings
 * @returns {Gauge[]}
 */
export function readGauges(settings) {
    return readRecords(settings, GAUGES_KEY).map(normalizeGauge).filter(Boolean);
}

/**
 * @param {import('gi://Gio').Settings} settings
 * @param {Gauge[]} gauges
 */
export function writeGauges(settings, gauges) {
    writeRecords(settings, GAUGES_KEY, gauges.map(gauge => ({
        source: gauge.source,
        id: gauge.id,
        name: gauge.name,
        latitude: gauge.latitude,
        longitude: gauge.longitude,
        warning1: gauge.warnings[0] ?? 0,
        warning2: gauge.warnings[1] ?? 0,
        warning3: gauge.warnings[2] ?? 0,
    })));
}

/**
 * Adds a gauge unless it is already saved.
 *
 * @param {Gauge[]} gauges
 * @param {object} gauge
 * @returns {{gauges: Gauge[], added: boolean}}
 */
export function addGauge(gauges, gauge) {
    const normalized = normalizeGauge(gauge);
    if (!normalized || gauges.some(saved => gaugeKey(saved) === gaugeKey(normalized)))
        return {gauges, added: false};
    return {gauges: [...gauges, normalized], added: true};
}

/**
 * Custom thresholds of a gauge as `[yellow, orange, red]` with `null` for levels that are
 * not set, or `null` when none is set.
 *
 * @param {Gauge} gauge
 * @returns {Array<number|null>|null}
 */
export function customThresholds(gauge) {
    const thresholds = gauge.warnings.map(value => value > 0 ? value : null);
    return thresholds.some(value => value !== null) ? thresholds : null;
}

/**
 * Alert level of a value: the highest level whose threshold it reaches (0 = normal).
 *
 * @param {number|null} value
 * @param {Array<number|null>|null} thresholds `[yellow, orange, red]`, `null` = not set
 * @returns {number|null} `null` when the value or all thresholds are unknown
 */
export function alertLevel(value, thresholds) {
    if (value === null || value === undefined || !thresholds?.some(threshold => threshold !== null))
        return null;
    let level = 0;
    thresholds.forEach((threshold, i) => {
        if (threshold !== null && value >= threshold)
            level = i + 1;
    });
    return level;
}

/** Thresholds as text, e.g. "120 / 150 / –". */
export function thresholdsText(thresholds) {
    return thresholds.map(value => value === null ? '–' : String(value)).join(' / ');
}
