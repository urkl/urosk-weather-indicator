// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Combines a saved gauge with the latest data into what the menu and the top bar show:
 * current value, trend, alert level and chart points.
 */
import {arsoAlert} from './arso.js';
import {GaugeSource, alertLevel, customThresholds} from './gauges.js';
import {dischargeOutlook} from './glofas.js';
import {levelTrend, trendArrow} from './history.js';

/** Relative daily change of discharge from which the trend counts as rising or falling. */
const DISCHARGE_TREND_RATIO = 0.1;

/**
 * @param {import('./gauges.js').Gauge} gauge
 * @param {import('./arso.js').ArsoGauge|null} station latest reading, `null` if missing
 * @param {import('./history.js').Sample[]} samples history of this gauge
 * @param {number} now Unix seconds
 * @returns {object}
 */
export function arsoStatus(gauge, station, samples, now) {
    if (!station)
        return {source: GaugeSource.ARSO, gauge, missing: true};
    const trend = levelTrend(samples);
    return {
        source: GaugeSource.ARSO,
        gauge,
        missing: false,
        station,
        level: station.level,
        flow: station.flow,
        waterTemperature: station.waterTemperature,
        flowCategory: station.flowCategory,
        age: station.time === null ? null : now - station.time,
        trend,
        arrow: trendArrow(trend),
        alert: arsoAlert(station, customThresholds(gauge)),
        points: samples
            .filter(sample => sample.level !== null && now - sample.t <= 48 * 3600)
            .map(sample => ({t: sample.t, v: sample.level})),
    };
}

/**
 * @param {import('./gauges.js').Gauge} gauge
 * @param {import('./glofas.js').DischargeSeries|null} series
 * @returns {object}
 */
export function glofasStatus(gauge, series) {
    if (!series || series.todayIndex < 0)
        return {source: GaugeSource.GLOFAS, gauge, missing: true};
    const {today, change, peak} = dischargeOutlook(series);
    const value = today?.median ?? today?.discharge ?? null;
    let arrow = '';
    if (change !== null && value) {
        const ratio = change / value;
        arrow = ratio >= DISCHARGE_TREND_RATIO ? '↑' : ratio <= -DISCHARGE_TREND_RATIO ? '↓' : '→';
    }
    const thresholds = customThresholds(gauge);
    const peakValue = peak?.median ?? peak?.discharge ?? null;
    return {
        source: GaugeSource.GLOFAS,
        gauge,
        missing: false,
        series,
        discharge: value,
        peak,
        arrow,
        alert: {level: alertLevel(value, thresholds), basis: thresholds ? 'flow' : null, thresholds},
        peakAlert: alertLevel(peakValue, thresholds),
    };
}

/**
 * Short text for the top bar, e.g. "60 cm ↑" or "3,3 m³/s ↓".
 *
 * @param {object} status from `arsoStatus` or `glofasStatus`
 * @param {import('../format.js').Formatter} fmt
 * @returns {string}
 */
export function panelText(status, fmt) {
    if (status.missing)
        return '–';
    const value = status.source === GaugeSource.ARSO
        ? status.level !== null ? fmt.waterLevel(status.level) : fmt.discharge(status.flow)
        : fmt.discharge(status.discharge);
    return `${value}${status.arrow ? ` ${status.arrow}` : ''}`;
}
