// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Place search for the location settings, backed by the Open-Meteo geocoding API
 * (GeoNames data). Coordinates typed as "46.2, 14.5" are accepted directly as well.
 */

const API_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/** Shortest query the geocoding service answers meaningfully. */
export const MIN_QUERY_LENGTH = 2;

/**
 * @param {string} query
 * @param {object} [options]
 * @param {string} [options.language] two-letter language for place names
 * @param {number} [options.count]
 * @returns {string}
 */
export function buildSearchUrl(query, {language = 'en', count = 10} = {}) {
    return `${API_URL}?name=${encodeURIComponent(query.trim())}&count=${count}` +
        `&language=${encodeURIComponent(language)}&format=json`;
}

/**
 * @typedef {object} Place
 * @property {string} name
 * @property {string} description region and country, e.g. "Upper Carniola, Slovenia"
 * @property {number} latitude
 * @property {number} longitude
 * @property {string|null} countryCode
 */

/**
 * @param {object} json geocoding response
 * @returns {Place[]}
 */
export function parseSearchResults(json) {
    return (json?.results ?? [])
        .filter(result => Number.isFinite(result.latitude) && Number.isFinite(result.longitude))
        .map(result => ({
            name: result.name,
            description: [result.admin1, result.country]
                .filter((part, i, parts) => part && parts.indexOf(part) === i && part !== result.name)
                .join(', '),
            latitude: result.latitude,
            longitude: result.longitude,
            countryCode: result.country_code ?? null,
        }));
}

/**
 * Parses coordinates typed by the user: "46.2048, 14.5384", "46.2048 14.5384" or "46,2048; 14,5384".
 *
 * @param {string} text
 * @returns {{latitude: number, longitude: number}|null}
 */
export function parseCoordinates(text) {
    const match = text.trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
    if (!match)
        return null;
    const latitude = Number(match[1].replace(',', '.'));
    const longitude = Number(match[2].replace(',', '.'));
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
        return null;
    return {latitude, longitude};
}
