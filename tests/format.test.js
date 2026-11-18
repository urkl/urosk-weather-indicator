// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import {assert, test} from './harness.js';
import {Formatter, capitalize, posixToBcp47} from '../src/lib/format.js';

// 18 Nov 2026 07:05 in Ljubljana (CET, UTC+1)
const MORNING = Date.UTC(2026, 10, 18, 6, 5) / 1000;

test('POSIX locale names become BCP 47 tags; C has none', () => {
    assert.equal(posixToBcp47('sl_SI.UTF-8'), 'sl-SI');
    assert.equal(posixToBcp47('de_DE@euro'), 'de-DE');
    assert.equal(posixToBcp47('C.UTF-8'), null);
    assert.equal(posixToBcp47(null), null);
});

test('numbers follow the locale and never show −0', () => {
    const sl = new Formatter({locale: 'sl-SI'});
    assert.equal(sl.number(12.345, 1), '12,3');
    assert.equal(new Formatter({locale: 'en-US'}).number(1234.5, 1), '1,234.5');
    assert.equal(sl.number(-0.04, 0), '0');
    assert.equal(sl.number(null), '–');
});

test('temperature, precipitation and wind in the configured units', () => {
    const metric = new Formatter({locale: 'en-US'});
    assert.equal(metric.temperature(21.6), '22°');
    assert.equal(metric.precipitation(2.34), '2.3 mm');
    assert.equal(metric.precipitation(12.4), '12 mm');
    assert.equal(metric.windSpeed(18.4), '18 km/h');

    const imperial = new Formatter({locale: 'en-US', units: {temperature: 'fahrenheit', precipitation: 'inch', windSpeed: 'mph', pressure: 'inhg'}});
    assert.equal(imperial.temperature(0), '32°');
    assert.equal(imperial.precipitation(25.4), '1.0 in');
    assert.equal(imperial.windSpeed(16.09344), '10 mph');
    assert.equal(imperial.pressure(1013.25), '29.92 inHg');
});

test('times are shown in the time zone of the location', () => {
    const ljubljana = new Formatter({locale: 'en-GB', timeZone: 'Europe/Ljubljana'});
    assert.equal(ljubljana.time(MORNING), '07:05');
    assert.equal(ljubljana.hourOfDay(MORNING), 7);
    assert.equal(ljubljana.dayKey(MORNING), '2026-11-18');

    const newYork = ljubljana.withTimeZone('America/New_York');
    assert.equal(newYork.hourOfDay(MORNING), 1);
    assert.equal(newYork.dayKey(MORNING), '2026-11-18');
    assert.equal(new Formatter({timeZone: 'Pacific/Auckland'}).dayKey(MORNING), '2026-11-18');
    assert.equal(new Formatter({timeZone: 'America/Los_Angeles'}).dayKey(MORNING), '2026-11-17');
});

test('12-hour clock follows the GNOME setting', () => {
    const fmt = new Formatter({locale: 'en-US', timeZone: 'Europe/Ljubljana', clockFormat: '12h'});
    assert.ok(/^07:05\sAM$/.test(fmt.time(MORNING)), fmt.time(MORNING));
});

test('an unknown time zone falls back to UTC instead of failing', () => {
    const fmt = new Formatter({locale: 'en-GB', timeZone: 'Mars/Olympus_Mons'});
    assert.equal(fmt.time(MORNING), '06:05');
});

test('compass points and helpers', () => {
    const fmt = new Formatter();
    assert.equal(fmt.compass(0), 'N');
    assert.equal(fmt.compass(225), 'SW');
    assert.equal(fmt.compass(359), 'N');
    assert.equal(fmt.compass(null), '');
    assert.equal(capitalize('ponedeljek'), 'Ponedeljek');
    assert.equal(fmt.age(30), 'just now');
    assert.equal(fmt.age(7 * 60), '7 min ago');
    assert.equal(fmt.age(2 * 3600), '2 h ago');
});

test('river values', () => {
    const fmt = new Formatter({locale: 'en-US'});
    assert.equal(fmt.discharge(0.458), '0.46 m³/s');
    assert.equal(fmt.discharge(49.1), '49.1 m³/s');
    assert.equal(fmt.discharge(1180), '1,180 m³/s');
    assert.equal(fmt.waterLevel(60), '60 cm');
});
