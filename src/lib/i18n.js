// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Translation helpers shared by the shell extension, the preferences window and the tests.
 *
 * GNOME Shell binds the text domain when the extension object is constructed, so plain
 * modules can translate through the domain directly without access to the extension object.
 */
import Gettext from 'gettext';

export const DOMAIN = 'urosk-weather-indicator';

const domain = Gettext.domain(DOMAIN);

export const _ = domain.gettext;
export const ngettext = domain.ngettext;

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
