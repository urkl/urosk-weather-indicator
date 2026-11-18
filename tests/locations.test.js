// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import {assert, test} from './harness.js';
import {addLocation, locationKey, normalizeLocation} from '../src/lib/locations.js';
import {moveItem, recordsFromVariant, recordsToVariant} from '../src/lib/records.js';

const komenda = {name: 'Komenda', description: 'Slovenia', latitude: 46.20484, longitude: 14.53839};

test('records survive the round trip through GVariant aa{sv}', () => {
    const records = [komenda, {name: 'Ljubljana', description: '', latitude: 46.05, longitude: 14.51}];
    const variant = recordsToVariant(records);
    assert.equal(variant.get_type_string(), 'aa{sv}');
    assert.deepEqual(recordsFromVariant(variant), records);
});

test('invalid locations are dropped, missing names get coordinates', () => {
    assert.equal(normalizeLocation({name: 'X', latitude: 91, longitude: 0}), null);
    assert.equal(normalizeLocation({name: 'X'}), null);
    assert.equal(normalizeLocation({latitude: 1, longitude: 2}).name, '1.000, 2.000');
});

test('adding a location twice keeps one entry', () => {
    const first = addLocation([], komenda);
    assert.ok(first.added);
    assert.equal(first.index, 0);
    const again = addLocation(first.locations, {...komenda, name: 'Komenda (again)'});
    assert.ok(!again.added);
    assert.equal(again.locations.length, 1);
    assert.equal(locationKey(komenda), '46.2048,14.5384');
});

test('moveItem reorders without touching the original list', () => {
    const list = ['a', 'b', 'c'];
    assert.deepEqual(moveItem(list, 0, 2), ['b', 'c', 'a']);
    assert.deepEqual(moveItem(list, 2, 1), ['a', 'c', 'b']);
    assert.deepEqual(moveItem(list, 0, 5), ['a', 'b', 'c']);
    assert.deepEqual(list, ['a', 'b', 'c']);
});
