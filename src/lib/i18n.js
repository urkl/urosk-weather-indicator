// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Translation helpers shared by the shell extension, the preferences window and the tests.
 *
 * By default the extension follows the desktop language through gettext (GNOME Shell binds
 * the text domain when the extension object is constructed). The user can also choose a
 * language in the settings; gettext only knows the language of the whole process, so the
 * chosen catalog is then loaded and looked up here directly.
 */
import Gettext from 'gettext';
import GLib from 'gi://GLib';

export const DOMAIN = 'urosk-weather-indicator';

/** Language of the source strings. */
export const SOURCE_LANGUAGE = 'en';

const domain = Gettext.domain(DOMAIN);

/** `null` follows the desktop (gettext); a Map holds the catalog of the chosen language. */
let catalog = null;
let chosenLanguage = null;
let pluralIndex = count => (count === 1 ? 0 : 1);

/** Translates a string. */
export function _(msgid) {
    if (catalog === null)
        return domain.gettext(msgid);
    return catalog.get(msgid) ?? msgid;
}

/** Translates a string with a plural form for `count`. */
export function ngettext(singular, plural, count) {
    if (catalog === null)
        return domain.ngettext(singular, plural, count);
    const forms = catalog.get(`${singular}\u0000${plural}`);
    return forms?.[pluralIndex(count)] ?? (count === 1 ? singular : plural);
}

/** Marks a string for extraction without translating it (translated later with `_()`). */
export const N_ = text => text;

/**
 * Fills `%d` and `%s` placeholders in order. Used instead of `String.prototype.format`,
 * which exists inside GNOME Shell but not in the preferences process or in tests.
 *
 * @param {string} template
 * @param {...(string|number)} values
 * @returns {string}
 */
export function fill(template, ...values) {
    let index = 0;
    return template.replace(/%[ds]/g, () => String(values[index++] ?? ''));
}

/**
 * Parses a compiled gettext catalog (`.mo`).
 *
 * @param {Uint8Array} bytes
 * @returns {Map<string, string|string[]>} plural entries are keyed `singular\0plural`
 */
export function parseMo(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let littleEndian = true;
    if (view.getUint32(0, true) !== 0x950412de) {
        if (view.getUint32(0, false) !== 0x950412de)
            throw new Error('not a gettext catalog');
        littleEndian = false;
    }
    const read = offset => view.getUint32(offset, littleEndian);
    const decoder = new TextDecoder();
    const text = (table, i) => {
        const length = read(table + i * 8);
        const offset = read(table + i * 8 + 4);
        return decoder.decode(bytes.subarray(offset, offset + length));
    };

    const messages = new Map();
    const [count, ids, strings] = [read(8), read(12), read(16)];
    for (let i = 0; i < count; i++) {
        const id = text(ids, i);
        if (id === '')
            continue;
        const translation = text(strings, i);
        messages.set(id, id.includes('\u0000') ? translation.split('\u0000') : translation);
    }
    return messages;
}

/**
 * Index of the plural form for a count, derived from the CLDR plural rules of the language.
 * Gettext catalogs list the forms in CLDR order (zero, one, two, few, many, other) for the
 * languages shipped here, e.g. Slovenian: one (1, 101), two (2), few (3, 4), other.
 *
 * @param {string} language
 * @returns {(count: number) => number}
 */
export function pluralIndexFor(language) {
    const rules = new Intl.PluralRules(language);
    const present = rules.resolvedOptions().pluralCategories;
    const categories = ['zero', 'one', 'two', 'few', 'many', 'other'].filter(category => present.includes(category));
    return count => Math.max(0, categories.indexOf(rules.select(count)));
}

/**
 * Whether `language` looks like a language code (`sl`, `pt_BR`, `sr-Latn`), so a setting can
 * never point the catalog path outside the locale directory.
 *
 * @param {string} language
 * @returns {boolean}
 */
export function isLanguageCode(language) {
    return typeof language === 'string' && /^[a-z]{2,3}([_-][A-Za-z0-9]{2,8})?$/.test(language);
}

/**
 * Chooses the language of the extension.
 *
 * @param {string|null} language e.g. `sl`; empty or `null` follows the desktop
 * @param {string} localeDir the extension's `locale` directory
 */
export function setLanguage(language, localeDir) {
    if (!language) {
        catalog = null;
        chosenLanguage = null;
        return;
    }
    try {
        if (!isLanguageCode(language))
            throw new Error('not a language code');
        catalog = language === SOURCE_LANGUAGE
            ? new Map()
            : parseMo(GLib.file_get_contents(`${localeDir}/${language}/LC_MESSAGES/${DOMAIN}.mo`)[1]);
        chosenLanguage = language;
        pluralIndex = pluralIndexFor(language);
    } catch (error) {
        console.warn(`${DOMAIN}: translation "${language}" not loaded, following the desktop: ${error.message}`);
        catalog = null;
        chosenLanguage = null;
    }
}

/** The language chosen in the settings, or `null` when following the desktop. */
export function chosenLanguageCode() {
    return chosenLanguage;
}

/**
 * Languages the extension can show: the source language and every compiled translation.
 *
 * @param {string} localeDir
 * @returns {string[]}
 */
export function availableLanguages(localeDir) {
    const languages = [SOURCE_LANGUAGE];
    try {
        const dir = GLib.Dir.open(localeDir, 0);
        let name;
        while ((name = dir.read_name()) !== null) {
            if (GLib.file_test(`${localeDir}/${name}/LC_MESSAGES/${DOMAIN}.mo`, GLib.FileTest.EXISTS))
                languages.push(name);
        }
        dir.close();
    } catch {
        // No compiled translations (e.g. running from the source tree)
    }
    return [...new Set(languages)].sort();
}

/** Name of a language in that language, e.g. "Slovenščina", "English". */
export function nativeLanguageName(language) {
    try {
        const name = new Intl.DisplayNames([language], {type: 'language'}).of(language) ?? language;
        return name[0].toLocaleUpperCase(language) + name.slice(1);
    } catch {
        return language;
    }
}
