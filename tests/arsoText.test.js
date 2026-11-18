// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import {assert, fixture, test} from './harness.js';
import {parseArsoTextForecast} from '../src/lib/arsoText.js';
import {decodeEntities, plainText} from '../src/lib/xml.js';

test('XML entities: named and numeric', () => {
    assert.equal(decodeEntities('P&#x0161;ata &amp; Sava &#269;ez &lt;3&gt;'), 'Pšata & Sava čez <3>');
    assert.equal(plainText('<p> a\n  <b>b</b> </p>'), 'a b');
});

test('ARSO text forecast: today, tomorrow and outlook for Slovenia only', () => {
    const forecast = parseArsoTextForecast(fixture('arso-text.xml'));
    assert.ok(forecast.issued.length > 0);
    assert.deepEqual(forecast.sections.map(section => section.title), ['Today', 'Tomorrow', 'Outlook']);
    assert.ok(forecast.sections.every(section => section.text.length > 10 && !section.text.includes('<')));
});
