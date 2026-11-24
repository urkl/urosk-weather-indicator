// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {assert, test} from './harness.js';
import {readLocations} from '../src/lib/locations.js';
import {readGauges} from '../src/lib/rivers/gauges.js';
import {
    SETTINGS_FILE_FORMAT, exportSettings, importSettings, jsonToVariant,
} from '../src/lib/settingsTransfer.js';

// `make test` compiles the schema here first
const SCHEMA_DIR = GLib.getenv('UWI_TEST_SCHEMA_DIR');
const SCHEMA_ID = 'org.gnome.shell.extensions.urosk-weather-indicator';

/** Settings of the extension in memory, separate for every call. */
function memorySettings() {
    const source = Gio.SettingsSchemaSource.new_from_directory(SCHEMA_DIR, null, false);
    return new Gio.Settings({settings_schema: source.lookup(SCHEMA_ID, false), backend: Gio.memory_settings_backend_new()});
}

function withSchema(fn) {
    return () => {
        if (!SCHEMA_DIR) {
            print('      (skipped: run through `make test` to compile the schema)');
            return;
        }
        fn();
    };
}

function homeSettings() {
    const settings = memorySettings();
    settings.set_value('locations', new GLib.Variant('aa{sv}', [
        {name: new GLib.Variant('s', 'Komenda'), description: new GLib.Variant('s', 'Slovenija'),
            latitude: new GLib.Variant('d', 46.20484), longitude: new GLib.Variant('d', 14.53839)},
        {name: new GLib.Variant('s', 'Ljubljana'), description: new GLib.Variant('s', ''),
            latitude: new GLib.Variant('d', 46.05108), longitude: new GLib.Variant('d', 14.50513)},
    ]));
    settings.set_int('active-location', 1);
    settings.set_string('language', 'sl');
    settings.set_string('wind-speed-unit', 'ms');
    settings.set_int('panel-days', 5);
    settings.set_boolean('panel-show-moon', true);
    settings.set_boolean('rivers-enabled', true);
    settings.set_value('river-gauges', new GLib.Variant('aa{sv}', [{
        source: new GLib.Variant('s', 'arso'), id: new GLib.Variant('s', '4570'), name: new GLib.Variant('s', 'Pšata – Topole'),
        latitude: new GLib.Variant('d', 46.17373), longitude: new GLib.Variant('d', 14.56263),
        warning1: new GLib.Variant('d', 0), warning2: new GLib.Variant('d', 0), warning3: new GLib.Variant('d', 180),
    }]));
    return settings;
}

test('export and import copy every setting to another computer', withSchema(() => {
    const home = homeSettings();
    const file = JSON.parse(JSON.stringify(exportSettings(home, {extensionVersion: '1.1.0', now: new Date(Date.UTC(2026, 10, 24))})));
    assert.equal(file.format, SETTINGS_FILE_FORMAT);
    assert.equal(file.extensionVersion, '1.1.0');
    assert.equal(file.exported, '2026-11-24T00:00:00.000Z');
    assert.deepEqual(Object.keys(file.settings), [...home.settings_schema.list_keys()].sort(), 'all keys are exported');

    const work = memorySettings();
    const {applied, skipped} = importSettings(work, file);
    assert.equal(skipped.length, 0, `skipped ${skipped}`);
    assert.equal(applied.length, Object.keys(file.settings).length);
    for (const key of home.settings_schema.list_keys())
        assert.ok(home.get_value(key).equal(work.get_value(key)), key);
    assert.deepEqual(readLocations(work).map(location => location.name), ['Komenda', 'Ljubljana']);
    assert.deepEqual(readGauges(work)[0].warnings, [0, 0, 180]);
    assert.equal(work.get_string('wind-speed-unit'), 'ms');
    assert.equal(work.get_boolean('panel-show-moon'), true);
}));

test('invalid values and unknown keys are skipped, the rest is applied', withSchema(() => {
    const work = memorySettings();
    const result = importSettings(work, {
        format: SETTINGS_FILE_FORMAT,
        version: 1,
        settings: {
            'panel-days': 99,
            'temperature-unit': 'kelvin',
            'locations': 'Komenda',
            'refresh-interval': 45,
            'pressure-unit': 'mmhg',
            'a-key-from-a-newer-version': true,
        },
    });
    assert.deepEqual(result.applied.sort(), ['pressure-unit', 'refresh-interval']);
    assert.deepEqual(result.skipped.sort(), ['a-key-from-a-newer-version', 'locations', 'panel-days', 'temperature-unit']);
    assert.equal(work.get_int('panel-days'), 7, 'default kept');
    assert.equal(work.get_int('refresh-interval'), 45);
    assert.equal(work.get_string('pressure-unit'), 'mmhg');
}));

test('a file that is not a settings file changes nothing', withSchema(() => {
    const work = memorySettings();
    assert.throws(() => importSettings(work, {settings: {'panel-days': 3}}));
    assert.throws(() => importSettings(work, null));
    assert.throws(() => importSettings(work, {format: SETTINGS_FILE_FORMAT, version: 2, settings: {'panel-days': 3}}), 'newer format');
    assert.throws(() => importSettings(work, {format: SETTINGS_FILE_FORMAT, version: 1, settings: []}));
    assert.equal(work.get_int('panel-days'), 7);
}));

test('JSON values become variants of the schema type', () => {
    assert.equal(jsonToVariant(true, 'b').get_boolean(), true);
    assert.equal(jsonToVariant(5, 'i').get_int32(), 5);
    assert.throws(() => jsonToVariant(5.5, 'i'));
    assert.throws(() => jsonToVariant('5', 'i'));
    assert.throws(() => jsonToVariant(null, 's'));
    assert.equal(jsonToVariant([{name: 'A', latitude: 1}], 'aa{sv}').recursiveUnpack()[0].latitude, 1);
    assert.throws(() => jsonToVariant([{name: ['nested']}], 'aa{sv}'));
    assert.throws(() => jsonToVariant([null], 'aa{sv}'));
});
