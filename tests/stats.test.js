// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import {assert, test} from './harness.js';
import {precipitationDiverges, summarize, temperatureDiverges} from '../src/lib/stats.js';

test('summarize: median of an odd and an even number of models', () => {
    assert.deepEqual(summarize([3, 1, 2]), {median: 2, min: 1, max: 3, count: 3});
    assert.deepEqual(summarize([4, 1, 2, 3]), {median: 2.5, min: 1, max: 4, count: 4});
});

test('summarize: missing values are ignored, all missing gives nulls', () => {
    assert.deepEqual(summarize([null, 5, undefined, NaN]), {median: 5, min: 5, max: 5, count: 1});
    assert.deepEqual(summarize([null, null]), {median: null, min: null, max: null, count: 0});
});

test('precipitation diverges for "rain or not" and for a wide spread only', () => {
    assert.ok(precipitationDiverges(summarize([0, 0.2, 4, 5])), 'rain or not');
    assert.ok(precipitationDiverges(summarize([2, 10, 12])), 'wide spread');
    assert.ok(!precipitationDiverges(summarize([10, 11, 12])), 'models agree');
    assert.ok(!precipitationDiverges(summarize([0, 0.4, 1.5])), 'little rain is not a disagreement');
    assert.ok(!precipitationDiverges(summarize([8])), 'one model cannot disagree');
});

test('temperature diverges from a 4 °C spread', () => {
    assert.ok(temperatureDiverges(summarize([10, 14])));
    assert.ok(!temperatureDiverges(summarize([10, 13.9])));
});
