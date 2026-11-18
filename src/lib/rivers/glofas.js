// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Worldwide modelled river discharge from the Open-Meteo Flood API (GloFAS, Copernicus
 * Emergency Management Service): daily values for recent days and an ensemble forecast.
 * The model grid is about 5 km, so a point should lie on (or very close to) the river.
 *
 * Contains modified Copernicus Emergency Management Service information.
 */

const API_URL = 'https://flood-api.open-meteo.com/v1/flood';

/** GloFAS publishes one run per day; refreshing more often brings nothing new. */
export const GLOFAS_REFRESH_SECONDS = 6 * 3600;

/**
 * @param {{latitude: number, longitude: number}} point
 * @param {object} [options]
 * @param {number} [options.pastDays]
 * @param {number} [options.forecastDays]
 * @returns {string}
 */
export function buildFloodUrl({latitude, longitude}, {pastDays = 10, forecastDays = 10} = {}) {
    return `${API_URL}?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
        '&daily=river_discharge,river_discharge_median,river_discharge_min,river_discharge_max' +
        `&past_days=${pastDays}&forecast_days=${forecastDays}&timeformat=unixtime`;
}

/**
 * @typedef {object} DischargeDay
 * @property {number} time Unix seconds (00:00 UTC)
 * @property {number|null} discharge control run, m³/s
 * @property {number|null} median ensemble median, m³/s
 * @property {number|null} min ensemble minimum, m³/s
 * @property {number|null} max ensemble maximum, m³/s
 */

/**
 * @typedef {object} DischargeSeries
 * @property {number} latitude grid cell actually used by the model
 * @property {number} longitude
 * @property {DischargeDay[]} days
 * @property {number} todayIndex index of today in `days` (-1 if missing)
 */

/**
 * @param {object} json Flood API response
 * @param {number} [now] Unix seconds
 * @returns {DischargeSeries}
 */
export function parseFlood(json, now = Date.now() / 1000) {
    if (json?.error)
        throw new Error(`Open-Meteo Flood: ${json.reason ?? 'error'}`);
    const daily = json.daily ?? {};
    const pick = (name, i) => daily[name]?.[i] ?? null;
    const days = (daily.time ?? []).map((time, i) => ({
        time,
        discharge: pick('river_discharge', i),
        median: pick('river_discharge_median', i),
        min: pick('river_discharge_min', i),
        max: pick('river_discharge_max', i),
    }));
    const todayIndex = days.findIndex(day => now >= day.time && now < day.time + 86400);
    return {latitude: json.latitude, longitude: json.longitude, days, todayIndex};
}

/**
 * Today's value and the change expected by tomorrow (forecast median).
 *
 * @param {DischargeSeries} series
 * @returns {{today: DischargeDay|null, change: number|null, peak: DischargeDay|null}}
 */
export function dischargeOutlook(series) {
    const today = series.days[series.todayIndex] ?? null;
    const tomorrow = series.days[series.todayIndex + 1] ?? null;
    const valueOf = day => day?.median ?? day?.discharge ?? null;
    const change = today && tomorrow && valueOf(today) !== null && valueOf(tomorrow) !== null
        ? valueOf(tomorrow) - valueOf(today)
        : null;
    const ahead = series.todayIndex >= 0 ? series.days.slice(series.todayIndex) : [];
    const peak = ahead.reduce((best, day) =>
        valueOf(day) !== null && (best === null || valueOf(day) > valueOf(best)) ? day : best, null);
    return {today, change, peak};
}
