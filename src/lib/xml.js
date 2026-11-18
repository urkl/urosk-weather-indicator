// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Minimal helpers for the flat, well-known XML feeds of ARSO. GNOME Shell has no XML parser
 * in its JavaScript environment, and these feeds are simple enough for targeted matching.
 */

const NAMED_ENTITIES = Object.freeze({amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"});

/**
 * Decodes named and numeric character references (`&amp;`, `&#x0161;`, `&#353;`).
 *
 * @param {string} text
 * @returns {string}
 */
export function decodeEntities(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
        if (entity[0] === '#') {
            const code = entity[1].toLowerCase() === 'x'
                ? parseInt(entity.slice(2), 16)
                : parseInt(entity.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : match;
        }
        return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    });
}

/** Text content with tags removed and whitespace collapsed. */
export function plainText(markup) {
    return decodeEntities(markup.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Text of the first `<tag>…</tag>` inside `xml`, or `null` when missing or empty.
 *
 * @param {string} xml
 * @param {string} tag
 * @returns {string|null}
 */
export function childText(xml, tag) {
    const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
    const text = match ? plainText(match[1]) : '';
    return text === '' ? null : text;
}

/**
 * Numeric content of `<tag>`, or `null` when missing, empty or not a number.
 *
 * @param {string} xml
 * @param {string} tag
 * @returns {number|null}
 */
export function childNumber(xml, tag) {
    const text = childText(xml, tag);
    const value = text === null ? NaN : Number(text);
    return Number.isFinite(value) ? value : null;
}

/** Attributes of an opening tag as an object, e.g. `{sifra: '4570'}`. */
export function attributes(openingTag) {
    const result = {};
    for (const [, name, value] of openingTag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g))
        result[name] = decodeEntities(value);
    return result;
}
