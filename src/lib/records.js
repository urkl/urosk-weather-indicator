// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Lists of small records (locations, river gauges) stored in GSettings as `aa{sv}`.
 * Each record is a flat object of strings, numbers and booleans.
 */
import GLib from 'gi://GLib';

function toVariant(value) {
    switch (typeof value) {
    case 'string':
        return new GLib.Variant('s', value);
    case 'number':
        return new GLib.Variant('d', value);
    case 'boolean':
        return new GLib.Variant('b', value);
    default:
        throw new TypeError(`Unsupported value in record: ${typeof value}`);
    }
}

/**
 * @param {object[]} records
 * @returns {GLib.Variant} `aa{sv}`
 */
export function recordsToVariant(records) {
    return new GLib.Variant('aa{sv}', records.map(record => {
        const dict = {};
        for (const [key, value] of Object.entries(record)) {
            if (value !== null && value !== undefined)
                dict[key] = toVariant(value);
        }
        return dict;
    }));
}

/**
 * @param {GLib.Variant} variant `aa{sv}`
 * @returns {object[]}
 */
export function recordsFromVariant(variant) {
    return variant.recursiveUnpack();
}

/**
 * @param {import('gi://Gio').Settings} settings
 * @param {string} key
 * @returns {object[]}
 */
export function readRecords(settings, key) {
    return recordsFromVariant(settings.get_value(key));
}

/**
 * @param {import('gi://Gio').Settings} settings
 * @param {string} key
 * @param {object[]} records
 */
export function writeRecords(settings, key, records) {
    settings.set_value(key, recordsToVariant(records));
}

/**
 * Returns a copy of `list` with the item at `from` moved to `to` (used by reorder buttons).
 *
 * @template T
 * @param {T[]} list
 * @param {number} from
 * @param {number} to
 * @returns {T[]}
 */
export function moveItem(list, from, to) {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length)
        return [...list];
    const copy = [...list];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
}
