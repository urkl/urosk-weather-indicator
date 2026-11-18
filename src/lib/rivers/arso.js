// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Live river gauges in Slovenia from ARSO (Slovenian Environment Agency): the latest water
 * level, discharge and water temperature of about 200 stations, refreshed every 30 minutes,
 * including the official high-water thresholds of each station.
 *
 * Source: ARSO, https://www.arso.gov.si (open data).
 */
import {N_} from '../i18n.js';
import {attributes, childNumber, childText} from '../xml.js';
import {alertLevel} from './gauges.js';

export const ARSO_GAUGES_URL = 'https://www.arso.gov.si/xml/vode/hidro_podatki_zadnji.xml';
export const ARSO_GAUGES_PAGE = 'https://www.arso.gov.si/vode/podatki/';

/** ARSO publishes new values every 30 minutes. */
export const ARSO_REFRESH_SECONDS = 30 * 60;

/** ARSO flow categories (Slovenian in the feed) → translatable English names. */
const FLOW_CATEGORIES = Object.freeze({
    'mali pretok': N_('low flow'),
    'srednji pretok': N_('normal flow'),
    'običajni pretok': N_('normal flow'),
    'veliki pretok': N_('high flow'),
    'prvi visokovodni pretok': N_('first flood level'),
    'drugi visokovodni pretok': N_('second flood level'),
    'tretji visokovodni pretok': N_('third flood level'),
});

/**
 * Feed times are in CET without daylight saving (`datum_cet`), "YYYY-MM-DD HH:MM".
 *
 * @param {string|null} text
 * @returns {number|null} Unix seconds
 */
export function parseCetTime(text) {
    const match = text?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!match)
        return null;
    const [, year, month, day, hour, minute] = match.map(Number);
    return Date.UTC(year, month - 1, day, hour, minute) / 1000 - 3600;
}

/** Official thresholds `[first, second, third]` high water; `null` when the station has none. */
function thresholdTriple(xml, kind) {
    const values = ['prvi', 'drugi', 'tretji'].map(order => childNumber(xml, `${order}_vv_${kind}`));
    return values.every(value => value === null) ? null : values;
}

/**
 * @typedef {object} ArsoGauge
 * @property {string} id station id (`sifra`)
 * @property {string} river
 * @property {string} place measuring point
 * @property {string} name "River – Place"
 * @property {number} latitude
 * @property {number} longitude
 * @property {number|null} time Unix seconds of the measurement
 * @property {number|null} level water level in cm
 * @property {number|null} flow discharge in m³/s
 * @property {number|null} waterTemperature °C
 * @property {string|null} flowCategory untranslated English category (use `_()`)
 * @property {Array<number|null>|null} levelThresholds official high-water levels in cm
 * @property {Array<number|null>|null} flowThresholds official high-water discharges in m³/s
 */

/**
 * @param {string} xml content of `hidro_podatki_zadnji.xml`
 * @returns {ArsoGauge[]}
 */
export function parseArsoGauges(xml) {
    const gauges = [];
    for (const [, openingTag, body] of xml.matchAll(/(<postaja\s[^>]*>)([\s\S]*?)<\/postaja>/g)) {
        const attrs = attributes(openingTag);
        if (!attrs.sifra)
            continue;
        const river = childText(body, 'reka') ?? '';
        const place = childText(body, 'merilno_mesto') ?? '';
        const category = (childText(body, 'pretok_znacilni') ?? '').toLowerCase();
        gauges.push({
            id: attrs.sifra,
            river,
            place,
            name: [river, place].filter(Boolean).join(' – '),
            latitude: Number(attrs.wgs84_sirina),
            longitude: Number(attrs.wgs84_dolzina),
            time: parseCetTime(childText(body, 'datum_cet') ?? childText(body, 'datum')),
            level: childNumber(body, 'vodostaj'),
            flow: childNumber(body, 'pretok'),
            waterTemperature: childNumber(body, 'temp_vode'),
            flowCategory: FLOW_CATEGORIES[category] ?? null,
            levelThresholds: thresholdTriple(body, 'vodostaj'),
            flowThresholds: thresholdTriple(body, 'pretok'),
        });
    }
    return gauges;
}

/**
 * Alert level of an ARSO gauge. Custom level thresholds (cm) win; otherwise the official
 * level thresholds, otherwise the official discharge thresholds when discharge is measured.
 *
 * @param {ArsoGauge} gauge
 * @param {Array<number|null>|null} customThresholds from `customThresholds()`
 * @returns {{level: number|null, basis: 'level'|'flow'|null, thresholds: Array<number|null>|null}}
 */
export function arsoAlert(gauge, customThresholds = null) {
    if (customThresholds)
        return {level: alertLevel(gauge.level, customThresholds), basis: 'level', thresholds: customThresholds};
    if (gauge.levelThresholds)
        return {level: alertLevel(gauge.level, gauge.levelThresholds), basis: 'level', thresholds: gauge.levelThresholds};
    if (gauge.flowThresholds && gauge.flow !== null)
        return {level: alertLevel(gauge.flow, gauge.flowThresholds), basis: 'flow', thresholds: gauge.flowThresholds};
    return {level: null, basis: null, thresholds: null};
}

const fold = text => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Stations matching a query in river or place name, ignoring case and diacritics
 * ("psata" finds "Pšata"); all words must match.
 *
 * @param {ArsoGauge[]} gauges
 * @param {string} query
 * @param {number} [limit]
 * @returns {ArsoGauge[]}
 */
export function searchArsoGauges(gauges, query, limit = 20) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return [];
    return gauges
        .filter(gauge => {
            const haystack = fold(`${gauge.river} ${gauge.place}`);
            return words.every(word => haystack.includes(word));
        })
        .slice(0, limit);
}
