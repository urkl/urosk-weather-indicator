// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * WMO weather interpretation codes (as delivered by Open-Meteo) → description, Meteocons icon
 * and severity. Severity orders the codes from fair to severe weather, which lets the
 * indicator pick a representative code when several models disagree.
 *
 * Icons: Meteocons by Bas Milius, MIT licence (see icons/LICENSE-meteocons).
 */
import {_, N_} from './i18n.js';

/** `{dn}` in an icon name is replaced by `day` or `night`. */
const CODES = Object.freeze({
    0: {description: N_('Clear sky'), icon: 'clear-{dn}', severity: 0},
    1: {description: N_('Mainly clear'), icon: 'partly-cloudy-{dn}', severity: 1},
    2: {description: N_('Partly cloudy'), icon: 'partly-cloudy-{dn}', severity: 2},
    3: {description: N_('Overcast'), icon: 'overcast', severity: 3},
    45: {description: N_('Fog'), icon: 'fog-{dn}', severity: 4},
    48: {description: N_('Freezing fog'), icon: 'fog-{dn}', severity: 4},
    51: {description: N_('Light drizzle'), icon: 'partly-cloudy-{dn}-drizzle', severity: 5},
    53: {description: N_('Drizzle'), icon: 'drizzle', severity: 6},
    55: {description: N_('Heavy drizzle'), icon: 'drizzle', severity: 7},
    56: {description: N_('Freezing drizzle'), icon: 'sleet', severity: 9},
    57: {description: N_('Heavy freezing drizzle'), icon: 'sleet', severity: 10},
    61: {description: N_('Light rain'), icon: 'partly-cloudy-{dn}-rain', severity: 8},
    63: {description: N_('Rain'), icon: 'rain', severity: 10},
    65: {description: N_('Heavy rain'), icon: 'rain', severity: 12},
    66: {description: N_('Light freezing rain'), icon: 'sleet', severity: 10},
    67: {description: N_('Freezing rain'), icon: 'sleet', severity: 12},
    71: {description: N_('Light snowfall'), icon: 'partly-cloudy-{dn}-snow', severity: 9},
    73: {description: N_('Snowfall'), icon: 'snow', severity: 11},
    75: {description: N_('Heavy snowfall'), icon: 'snow', severity: 13},
    77: {description: N_('Snow grains'), icon: 'snow', severity: 9},
    80: {description: N_('Light showers'), icon: 'partly-cloudy-{dn}-rain', severity: 9},
    81: {description: N_('Showers'), icon: 'rain', severity: 11},
    82: {description: N_('Violent showers'), icon: 'rain', severity: 13},
    85: {description: N_('Snow showers'), icon: 'partly-cloudy-{dn}-snow', severity: 10},
    86: {description: N_('Heavy snow showers'), icon: 'snow', severity: 12},
    95: {description: N_('Thunderstorm'), icon: 'thunderstorms-{dn}-rain', severity: 14},
    96: {description: N_('Thunderstorm with hail'), icon: 'hail', severity: 15},
    99: {description: N_('Severe thunderstorm with hail'), icon: 'hail', severity: 16},
});

const UNKNOWN = Object.freeze({description: N_('No data'), icon: 'not-available', severity: -1});

function entry(code) {
    return CODES[code] ?? UNKNOWN;
}

/**
 * File name of the icon for a code, e.g. `partly-cloudy-night.svg`.
 *
 * @param {number|null} code
 * @param {boolean} [isDay]
 * @returns {string}
 */
export function iconFileName(code, isDay = true) {
    return `${entry(code).icon.replace('{dn}', isDay ? 'day' : 'night')}.svg`;
}

/**
 * Translated description of a code.
 *
 * @param {number|null} code
 * @returns {string}
 */
export function describeCode(code) {
    return _(entry(code).description);
}

/**
 * Combines the codes of several models into one: the median by severity
 * (with an even count, the milder of the two middle codes).
 *
 * @param {Array<number|null>} codes
 * @returns {number|null}
 */
export function combineCodes(codes) {
    const known = codes.filter(code => code !== null && code !== undefined && CODES[code]);
    if (known.length === 0)
        return null;
    known.sort((a, b) => CODES[a].severity - CODES[b].severity || a - b);
    return known[Math.floor((known.length - 1) / 2)];
}
