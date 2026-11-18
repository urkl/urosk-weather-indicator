// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Saved forecast locations. The panel shows the active one; the menu switches between them.
 */
import {readRecords, writeRecords} from './records.js';

export const LOCATIONS_KEY = 'locations';
export const ACTIVE_LOCATION_KEY = 'active-location';

/**
 * @typedef {object} Location
 * @property {string} name
 * @property {string} description region and country (may be empty)
 * @property {number} latitude
 * @property {number} longitude
 */

/**
 * Validates a stored record; invalid records (e.g. edited by hand) are dropped.
 *
 * @param {object} record
 * @returns {Location|null}
 */
export function normalizeLocation(record) {
    const latitude = Number(record?.latitude);
    const longitude = Number(record?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
        return null;
    const name = String(record.name ?? '').trim() || `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
    return {name, description: String(record.description ?? ''), latitude, longitude};
}

/** Identity of a location; two entries closer than ~10 m count as the same place. */
export function locationKey(location) {
    return `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
}

/**
 * @param {import('gi://Gio').Settings} settings
 * @returns {Location[]}
 */
export function readLocations(settings) {
    return readRecords(settings, LOCATIONS_KEY).map(normalizeLocation).filter(Boolean);
}

/**
 * @param {import('gi://Gio').Settings} settings
 * @param {Location[]} locations
 */
export function writeLocations(settings, locations) {
    writeRecords(settings, LOCATIONS_KEY, locations.map(({name, description, latitude, longitude}) =>
        ({name, description, latitude, longitude})));
}

/**
 * Adds a place unless it is already saved.
 *
 * @param {Location[]} locations
 * @param {Location} place
 * @returns {{locations: Location[], index: number, added: boolean}}
 */
export function addLocation(locations, place) {
    const location = normalizeLocation(place);
    if (!location)
        return {locations, index: -1, added: false};
    const existing = locations.findIndex(saved => locationKey(saved) === locationKey(location));
    if (existing >= 0)
        return {locations, index: existing, added: false};
    return {locations: [...locations, location], index: locations.length, added: true};
}

/**
 * Index of the active location, clamped to the saved list.
 *
 * @param {import('gi://Gio').Settings} settings
 * @param {number} count number of saved locations
 * @returns {number} -1 when there are no locations
 */
export function activeLocationIndex(settings, count) {
    if (count === 0)
        return -1;
    return Math.min(Math.max(settings.get_int(ACTIVE_LOCATION_KEY), 0), count - 1);
}
