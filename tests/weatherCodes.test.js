// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import GLib from 'gi://GLib';

import {assert, test} from './harness.js';
import {combineCodes, describeCode, iconFileName} from '../src/lib/weatherCodes.js';

test('icons switch between day and night', () => {
    assert.equal(iconFileName(0, true), 'clear-day.svg');
    assert.equal(iconFileName(0, false), 'clear-night.svg');
    assert.equal(iconFileName(63), 'rain.svg');
    assert.equal(iconFileName(1234), 'not-available.svg');
});

test('every icon referenced by a code exists', () => {
    const icons = GLib.build_filenamev([GLib.path_get_dirname(import.meta.url.replace('file://', '')), '..', 'src', 'icons']);
    const codes = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99, null];
    for (const code of codes) {
        for (const isDay of [true, false]) {
            const file = GLib.build_filenamev([icons, iconFileName(code, isDay)]);
            assert.ok(GLib.file_test(file, GLib.FileTest.EXISTS), `missing ${file}`);
        }
    }
});

test('descriptions are available for known and unknown codes', () => {
    assert.equal(describeCode(95), 'Thunderstorm');
    assert.equal(describeCode(null), 'No data');
});

test('combined code is the median by severity, the milder one for an even count', () => {
    assert.equal(combineCodes([0, 3, 63]), 3);
    assert.equal(combineCodes([0, 63]), 0);
    assert.equal(combineCodes([95, 95, 61, null]), 95);
    assert.equal(combineCodes([null, 1234]), null);
});
