// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Optional national text forecast for Slovenia by ARSO (Slovenian Environment Agency).
 * The text itself is published in Slovenian only.
 */
import {N_} from './i18n.js';
import {childText, plainText} from './xml.js';

export const ARSO_TEXT_FORECAST_URL =
    'https://meteo.arso.gov.si/uploads/probase/www/fproduct/text/sl/fcast_si_text.xml';

/** Sections of the feed that are shown, with their titles. */
const SECTIONS = Object.freeze({
    'fcast_SLOVENIA_d1': N_('Today'),
    'fcast_SLOVENIA_d2': N_('Tomorrow'),
    'fcast_SLOVENIA_d3-d5': N_('Outlook'),
});

/**
 * @typedef {object} TextForecast
 * @property {string} issued publication time as written by ARSO
 * @property {Array<{title: string, text: string}>} sections untranslated titles (use `_()`)
 */

/**
 * @param {string} xml content of `fcast_si_text.xml`
 * @returns {TextForecast}
 */
export function parseArsoTextForecast(xml) {
    const sections = [];
    for (const [, id, body] of xml.matchAll(/<section id='([^']+)'>([\s\S]*?)<\/section>/g)) {
        if (!SECTIONS[id])
            continue;
        const text = [...body.matchAll(/<para>([\s\S]*?)<\/para>/g)]
            .map(([, para]) => plainText(para))
            .filter(Boolean)
            .join(' ');
        if (text)
            sections.push({title: SECTIONS[id], text});
    }
    return {issued: childText(xml, 'pubdate') ?? '', sections};
}
