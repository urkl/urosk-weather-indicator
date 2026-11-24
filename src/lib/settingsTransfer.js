// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Export and import of all extension settings as JSON, e.g. to copy the locations, units
 * and river gauges to another computer. Values are converted with the type of each key in
 * the schema and checked against its range before anything is written, so a damaged file
 * changes nothing; keys the schema does not know (from a newer version) are skipped.
 */
import GLib from 'gi://GLib';

import {_, isLanguageCode} from './i18n.js';
import {recordsToVariant} from './records.js';

export const SETTINGS_FILE_FORMAT = 'urosk-weather-indicator-settings';
export const SETTINGS_FILE_VERSION = 1;
export const SETTINGS_FILE_NAME = 'urosk-weather-indicator-settings.json';

/**
 * All settings as a JSON-ready object.
 *
 * @param {import('gi://Gio').Settings} settings
 * @param {object} [options]
 * @param {string|null} [options.extensionVersion] e.g. `1.1.0`
 * @param {Date} [options.now]
 * @returns {object}
 */
export function exportSettings(settings, {extensionVersion = null, now = new Date()} = {}) {
    const values = {};
    for (const key of settings.settings_schema.list_keys().sort())
        values[key] = settings.get_value(key).recursiveUnpack();
    return {
        format: SETTINGS_FILE_FORMAT,
        version: SETTINGS_FILE_VERSION,
        extensionVersion,
        exported: now.toISOString(),
        settings: values,
    };
}

/** Checks beyond the schema type for keys whose strings have a fixed form. */
const VALUE_CHECKS = {
    language: value => value === '' || isLanguageCode(value),
};

const SIMPLE_TYPES = {
    b: value => typeof value === 'boolean',
    i: value => Number.isInteger(value) && value >= -(2 ** 31) && value < 2 ** 31,
    d: value => typeof value === 'number' && Number.isFinite(value),
    s: value => typeof value === 'string',
};

/**
 * Converts a JSON value to a GVariant of the given type.
 *
 * @param {*} value
 * @param {string} type GVariant type string, e.g. `s` or `aa{sv}`
 * @returns {GLib.Variant}
 * @throws {TypeError} when the value does not fit the type
 */
export function jsonToVariant(value, type) {
    if (SIMPLE_TYPES[type]) {
        if (!SIMPLE_TYPES[type](value))
            throw new TypeError(`expected ${type}, got ${JSON.stringify(value)}`);
        return new GLib.Variant(type, value);
    }
    if (type === 'aa{sv}') {
        if (!Array.isArray(value) || !value.every(item => item !== null && typeof item === 'object' && !Array.isArray(item)))
            throw new TypeError('expected a list of records');
        return recordsToVariant(value);
    }
    return new GLib.Variant(type, value);
}

/**
 * Applies the settings of an exported file. Either every valid value is written (in one
 * batch) or, when the file is not a settings file, nothing.
 *
 * @param {import('gi://Gio').Settings} settings
 * @param {object} data parsed JSON of the file
 * @returns {{applied: string[], skipped: string[]}} keys written and keys left out
 * @throws {Error} when the file is not a settings file of this extension
 */
export function importSettings(settings, data) {
    if (data?.format !== SETTINGS_FILE_FORMAT || data.settings === null || typeof data.settings !== 'object' ||
        Array.isArray(data.settings))
        throw new Error(_('This is not a settings file of Urosk Weather Indicator.'));
    if (!Number.isInteger(data.version) || data.version > SETTINGS_FILE_VERSION)
        throw new Error(_('The settings file is from a newer version; update the extension first.'));

    const schema = settings.settings_schema;
    const changes = [];
    const skipped = [];
    for (const [key, value] of Object.entries(data.settings)) {
        if (!schema.has_key(key)) {
            skipped.push(key);
            continue;
        }
        const schemaKey = schema.get_key(key);
        if (VALUE_CHECKS[key] && !VALUE_CHECKS[key](value)) {
            skipped.push(key);
            continue;
        }
        try {
            const variant = jsonToVariant(value, schemaKey.get_value_type().dup_string());
            if (schemaKey.range_check(variant))
                changes.push([key, variant]);
            else
                skipped.push(key);
        } catch {
            skipped.push(key);
        }
    }

    settings.delay();
    try {
        for (const [key, variant] of changes)
            settings.set_value(key, variant);
    } finally {
        settings.apply();
    }
    return {applied: changes.map(([key]) => key), skipped};
}
