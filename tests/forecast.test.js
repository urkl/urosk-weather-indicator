// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import {assert, fixture, test} from './harness.js';
import {MODELS, buildForecastUrl, parseForecast} from '../src/lib/forecast.js';
import {Formatter} from '../src/lib/format.js';

const forecast = () => parseForecast(JSON.parse(fixture('open-meteo-forecast.json')));

test('request asks for all models, local time zone and Unix times', () => {
    const url = buildForecastUrl({latitude: 46.20484, longitude: 14.53839});
    assert.ok(url.includes('latitude=46.2048&longitude=14.5384'));
    assert.ok(url.includes('timezone=auto') && url.includes('timeformat=unixtime'));
    for (const model of MODELS)
        assert.ok(url.includes(model.id), model.id);
});

test('real response (Komenda): 7 days, 24 hours each, local time zone', () => {
    const result = forecast();
    assert.equal(result.timeZone, 'Europe/Ljubljana');
    assert.equal(result.days.length, 7);
    const fmt = new Formatter({timeZone: result.timeZone});
    for (const day of result.days) {
        assert.equal(day.hours.length, 24, fmt.dayKey(day.time));
        assert.ok(day.hours.every(hour => fmt.dayKey(hour.time) === fmt.dayKey(day.time)), 'hours belong to their day');
        assert.equal(fmt.hourOfDay(day.time), 0, 'days start at local midnight');
    }
});

test('daily values are medians within the model range', () => {
    for (const day of forecast().days) {
        for (const summary of [day.maxTemperature, day.minTemperature, day.precipitation]) {
            if (summary.median === null)
                continue;
            assert.ok(summary.min <= summary.median && summary.median <= summary.max);
        }
        assert.ok(day.maxTemperature.median >= day.minTemperature.median);
        assert.ok(day.precipitation.min === null || day.precipitation.min >= 0, 'no negative precipitation');
    }
});

test('current conditions and model list are filled', () => {
    const result = forecast();
    assert.ok(Number.isFinite(result.current.temperature));
    assert.ok(Number.isFinite(result.current.time));
    assert.ok(result.modelsWithData.length >= 4, `${result.modelsWithData.length} models`);
    assert.ok(result.days[0].models.length >= 4);
    assert.ok(Number.isFinite(result.days[0].sunrise) && result.days[0].sunrise < result.days[0].sunset);
});

test('regional models drop out on later days', () => {
    const result = forecast();
    const lastDay = result.days.at(-1);
    assert.ok(!lastDay.models.some(model => model.id === 'icon_d2'), 'ICON-D2 reaches only 2 days');
});

test('an API error is reported', () => {
    assert.throws(() => parseForecast({error: true, reason: 'Latitude must be in range'}));
});
