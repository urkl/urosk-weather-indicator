// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Statistics across forecast models: the median is what the indicator shows, the
 * minimum and maximum describe how much the models disagree.
 */

/**
 * @typedef {object} Summary
 * @property {number|null} median
 * @property {number|null} min
 * @property {number|null} max
 * @property {number} count number of models that delivered a value
 */

const isValue = value => value !== null && value !== undefined && !Number.isNaN(value);

/**
 * Summarizes the values of several models; missing values are ignored.
 *
 * @param {Array<number|null>} values
 * @returns {Summary}
 */
export function summarize(values) {
    const sorted = values.filter(isValue).sort((a, b) => a - b);
    if (sorted.length === 0)
        return {median: null, min: null, max: null, count: 0};

    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
    return {median, min: sorted[0], max: sorted.at(-1), count: sorted.length};
}

/**
 * Whether the models disagree noticeably about precipitation (mm): either "rain or not"
 * or a spread that is large compared to the median.
 *
 * @param {Summary} summary
 * @returns {boolean}
 */
export function precipitationDiverges(summary) {
    if (summary.count < 2 || summary.max < 2)
        return false;
    const rainOrNot = summary.min < 0.5 && summary.max >= 3;
    const wideSpread = summary.max - summary.min >= Math.max(4, 0.5 * summary.median);
    return rainOrNot || wideSpread;
}

/** Spread in °C from which a temperature forecast counts as uncertain. */
export const TEMPERATURE_SPREAD_C = 4;

/**
 * Whether the models disagree about a temperature by `TEMPERATURE_SPREAD_C` or more.
 *
 * @param {Summary} summary
 * @returns {boolean}
 */
export function temperatureDiverges(summary) {
    return summary.count >= 2 && summary.max - summary.min >= TEMPERATURE_SPREAD_C;
}
