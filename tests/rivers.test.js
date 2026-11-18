// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import {assert, fixture, test} from './harness.js';
import {Formatter} from '../src/lib/format.js';
import {arsoAlert, parseArsoGauges, parseCetTime, searchArsoGauges} from '../src/lib/rivers/arso.js';
import {addGauge, alertLevel, customThresholds, gaugeKey, normalizeGauge} from '../src/lib/rivers/gauges.js';
import {buildFloodUrl, dischargeOutlook, parseFlood} from '../src/lib/rivers/glofas.js';
import {levelTrend, mergeSample, trendArrow} from '../src/lib/rivers/history.js';
import {arsoStatus, glofasStatus, panelText} from '../src/lib/rivers/status.js';

const stations = () => parseArsoGauges(fixture('arso-gauges.xml'));
const station = id => stations().find(gauge => gauge.id === id);

test('ARSO feed: names with diacritics, values, thresholds and CET time', () => {
    const loka = station('4575');
    assert.equal(loka.name, 'Pšata – Loka');
    assert.equal(loka.level, 22);
    assert.equal(loka.flow, 0.458);
    assert.equal(loka.waterTemperature, 10.3);
    assert.equal(loka.flowCategory, 'normal flow');
    assert.deepEqual(loka.flowThresholds, [14.1, 20, 30]);
    assert.equal(loka.time, Date.UTC(2026, 10, 18, 11, 0) / 1000);
    assert.close(loka.latitude, 46.14348, 1e-6);
});

test('ARSO feed: empty values are null, not zero', () => {
    const topole = station('4570');
    assert.equal(topole.flow, null);
    assert.equal(topole.flowCategory, null);
    const hrusica = station('3105');
    assert.equal(hrusica.level, null);
    assert.equal(hrusica.levelThresholds, null);
});

test('CET times ignore daylight saving', () => {
    assert.equal(parseCetTime('2026-07-01 12:00'), Date.UTC(2026, 6, 1, 11, 0) / 1000);
    assert.equal(parseCetTime('nonsense'), null);
});

test('station search ignores case and diacritics, all words must match', () => {
    const all = stations();
    assert.deepEqual(searchArsoGauges(all, 'psata').map(gauge => gauge.id), ['4570', '4575']);
    assert.deepEqual(searchArsoGauges(all, 'PŠATA loka').map(gauge => gauge.id), ['4575']);
    assert.deepEqual(searchArsoGauges(all, '  '), []);
});

test('alert levels: highest threshold reached, unset levels skipped', () => {
    assert.equal(alertLevel(10, [14.1, 20, 30]), 0);
    assert.equal(alertLevel(25, [14.1, 20, 30]), 2);
    assert.equal(alertLevel(35, [14.1, 20, 30]), 3);
    assert.equal(alertLevel(130, [null, 120, null]), 2);
    assert.equal(alertLevel(5, null), null);
    assert.equal(alertLevel(null, [1, 2, 3]), null);
});

test('ARSO alert: custom level thresholds win over official discharge thresholds', () => {
    const loka = station('4575');
    assert.deepEqual(arsoAlert(loka), {level: 0, basis: 'flow', thresholds: [14.1, 20, 30]});
    assert.deepEqual(arsoAlert(loka, [20, 40, null]), {level: 1, basis: 'level', thresholds: [20, 40, null]});
    assert.deepEqual(arsoAlert(station('4570')), {level: null, basis: null, thresholds: null}, 'no discharge measured');
});

test('saved gauges: validation, positional warnings and duplicates', () => {
    assert.equal(normalizeGauge({source: 'arso', id: 'abc'}), null);
    assert.equal(normalizeGauge({source: 'other', id: '1'}), null);
    const gauge = normalizeGauge({source: 'arso', id: '4570', name: 'Pšata – Topole', warning2: 120});
    assert.deepEqual(gauge.warnings, [0, 120, 0]);
    assert.deepEqual(customThresholds(gauge), [null, 120, null]);
    assert.equal(customThresholds({...gauge, warnings: [0, 0, 0]}), null);
    assert.equal(gaugeKey(gauge), 'arso:4570');
    const {gauges} = addGauge([], gauge);
    assert.ok(!addGauge(gauges, {source: 'arso', id: '4570'}).added);
    assert.equal(gaugeKey(normalizeGauge({source: 'glofas', latitude: 46.1737, longitude: 14.5626})), 'glofas:46.174,14.563');
});

test('history keeps 72 hours and computes the hourly level trend', () => {
    const now = 1_000_000;
    let series = [];
    series = mergeSample(series, {t: now - 80 * 3600, level: 50, flow: null}, now);
    assert.equal(series.length, 0, 'older than 72 h');
    series = mergeSample(series, {t: now - 3600, level: 50, flow: null}, now);
    series = mergeSample(series, {t: now - 1800, level: 55, flow: null}, now);
    series = mergeSample(series, {t: now, level: 62, flow: null}, now);
    series = mergeSample(series, {t: now, level: 62, flow: null}, now);
    assert.equal(series.length, 3, 'same time is stored once');
    assert.equal(levelTrend(series), 12);
    assert.equal(trendArrow(12), '⇈');
    assert.equal(trendArrow(3), '↑');
    assert.equal(trendArrow(0), '→');
    assert.equal(trendArrow(-5), '↓');
    assert.equal(levelTrend([{t: now, level: 1, flow: null}]), null);
});

test('GloFAS: request, real response, today and outlook', () => {
    assert.ok(buildFloodUrl({latitude: 46.1737, longitude: 14.5626}).includes('past_days=10&forecast_days=10'));
    const json = JSON.parse(fixture('open-meteo-flood.json'));
    const today = json.daily.time[10] + 3600;
    const series = parseFlood(json, today);
    assert.equal(series.days.length, 20);
    assert.equal(series.todayIndex, 10);
    const outlook = dischargeOutlook(series);
    assert.equal(outlook.today.time, json.daily.time[10]);
    assert.ok(outlook.change !== null);
    assert.ok(outlook.peak.time >= outlook.today.time);
});

test('status and top bar text for both sources', () => {
    const fmt = new Formatter({locale: 'en-US'});
    const now = Date.UTC(2026, 10, 18, 11, 10) / 1000;
    const topole = normalizeGauge({source: 'arso', id: '4570', name: 'Pšata – Topole', warning1: 55});
    const samples = [{t: now - 3600 - 600, level: 52, flow: null}, {t: now - 600, level: 60, flow: null}];
    const status = arsoStatus(topole, station('4570'), samples, now);
    assert.equal(status.alert.level, 1);
    assert.equal(status.arrow, '↑');
    assert.equal(panelText(status, fmt), '60 cm ↑');
    assert.ok(arsoStatus(topole, null, [], now).missing);

    const json = JSON.parse(fixture('open-meteo-flood.json'));
    const point = normalizeGauge({source: 'glofas', name: 'Pšata', latitude: 46.17, longitude: 14.56});
    const flood = glofasStatus(point, parseFlood(json, json.daily.time[10] + 60));
    assert.ok(/ m³\/s [↑↓→]$/.test(panelText(flood, fmt)), panelText(flood, fmt));
    assert.equal(flood.alert.level, null, 'no thresholds set');
});
