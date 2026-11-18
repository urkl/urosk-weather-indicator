// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import {assert, fixture, test} from './harness.js';
import {buildSearchUrl, parseCoordinates, parseSearchResults} from '../src/lib/geocoding.js';

test('search URL encodes the query and the language', () => {
    assert.equal(buildSearchUrl(' São Paulo ', {language: 'pt', count: 5}),
        'https://geocoding-api.open-meteo.com/v1/search?name=S%C3%A3o%20Paulo&count=5&language=pt&format=json');
});

test('real response: name, region and country, coordinates', () => {
    const [komenda] = parseSearchResults(JSON.parse(fixture('open-meteo-geocoding.json')));
    assert.equal(komenda.name, 'Komenda');
    assert.ok(komenda.description.endsWith('Slovenia'), komenda.description);
    assert.close(komenda.latitude, 46.2048, 0.001);
    assert.equal(komenda.countryCode, 'SI');
});

test('no results gives an empty list', () => {
    assert.deepEqual(parseSearchResults({generationtime_ms: 0.1}), []);
});

test('coordinates typed in several notations', () => {
    assert.deepEqual(parseCoordinates('46.2048, 14.5384'), {latitude: 46.2048, longitude: 14.5384});
    assert.deepEqual(parseCoordinates('46,2048; 14,5384'), {latitude: 46.2048, longitude: 14.5384});
    assert.deepEqual(parseCoordinates('-33.9 18.4'), {latitude: -33.9, longitude: 18.4});
    assert.equal(parseCoordinates('Komenda'), null);
    assert.equal(parseCoordinates('95, 10'), null);
});
