// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import {assert, test} from './harness.js';
import {
    convertPrecipitation, convertPressure, convertTemperature, convertWindSpeed,
} from '../src/lib/units.js';

test('temperature: Celsius stays, Fahrenheit converts', () => {
    assert.equal(convertTemperature(20, 'celsius'), 20);
    assert.equal(convertTemperature(100, 'fahrenheit'), 212);
    assert.equal(convertTemperature(-40, 'fahrenheit'), -40);
});

test('wind speed conversions from km/h', () => {
    assert.equal(convertWindSpeed(36, 'ms'), 10);
    assert.close(convertWindSpeed(1.609344, 'mph'), 1);
    assert.close(convertWindSpeed(1.852, 'kn'), 1);
    assert.equal(convertWindSpeed(50, 'kmh'), 50);
});

test('precipitation and pressure conversions', () => {
    assert.equal(convertPrecipitation(25.4, 'inch'), 1);
    assert.close(convertPressure(1013.25, 'inhg'), 29.92, 0.01);
    assert.close(convertPressure(1013.25, 'mmhg'), 760, 0.1);
});
