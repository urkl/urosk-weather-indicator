// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import GLib from 'gi://GLib';

import {assert, test} from './harness.js';
import {
    _, availableLanguages, chosenLanguageCode, fill, nativeLanguageName, ngettext, pluralIndexFor, setLanguage,
} from '../src/lib/i18n.js';
import {formattingLocale, Formatter} from '../src/lib/format.js';
import {describeCode} from '../src/lib/weatherCodes.js';

// `make test` compiles the translations here first
const LOCALE_DIR = GLib.getenv('UWI_TEST_LOCALE_DIR');

function withLanguage(language, fn) {
    setLanguage(language, LOCALE_DIR);
    try {
        fn();
    } finally {
        setLanguage(null);
    }
}

test('Slovenian plural forms follow CLDR: one, two, few, other', () => {
    const index = pluralIndexFor('sl');
    assert.deepEqual([1, 2, 3, 4, 5, 11, 101, 102, 0].map(index), [0, 1, 2, 2, 3, 3, 0, 1, 3]);
    assert.deepEqual([1, 2, 0].map(pluralIndexFor('en')), [0, 1, 1]);
});

test('placeholders are filled in order', () => {
    assert.equal(fill('%s – %d', 'a', 5), 'a – 5');
});

test('language names are shown in their own language', () => {
    assert.equal(nativeLanguageName('sl'), 'Slovenščina');
    assert.equal(nativeLanguageName('en'), 'English');
});

test('chosen language: Slovenian catalog, plural forms and date locale', () => {
    if (!LOCALE_DIR) {
        print('      (skipped: run through `make test` to compile the translations)');
        return;
    }
    assert.deepEqual(availableLanguages(LOCALE_DIR), ['en', 'sl']);
    withLanguage('sl', () => {
        assert.equal(chosenLanguageCode(), 'sl');
        assert.equal(_('Overcast'), 'Oblačno');
        assert.equal(describeCode(95), 'Nevihta');
        assert.equal(fill(ngettext('%d min ago', '%d min ago', 3), 3), 'pred 3 min');
        assert.equal(_('a string that is not translated'), 'a string that is not translated');
        assert.equal(formattingLocale(), 'sl');
        const fmt = new Formatter({locale: formattingLocale(), timeZone: 'Europe/Ljubljana'});
        assert.equal(fmt.weekday(Date.UTC(2026, 10, 16, 12) / 1000, {long: true}), 'ponedeljek');
        assert.equal(fmt.number(1.5, 1), '1,5');
    });
    withLanguage('en', () => assert.equal(_('Overcast'), 'Overcast'));
    assert.equal(chosenLanguageCode(), null, 'back to the desktop language');
});

test('a missing translation falls back to the desktop language', () => {
    setLanguage('xx', LOCALE_DIR ?? '/nonexistent');
    assert.equal(chosenLanguageCode(), null);
    assert.equal(_('Overcast'), 'Overcast');
});
