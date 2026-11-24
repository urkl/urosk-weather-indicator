// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/*
 * Reference values come from PyEphem 4.2.1 (VSOP87 and ELP 2000-82), computed once outside
 * the project; rise and set use the upper limb with standard refraction.
 */
import {assert, test} from './harness.js';
import {Formatter} from '../src/lib/format.js';
import {
    MoonPhase, elongation, illuminatedFraction, moonDays, moonNow, moonRiseSet,
    nextPrincipalPhase, phaseIcon, phaseName, phaseOfDay, previousPrincipalPhase, riseSetText,
} from '../src/lib/moon.js';

const utc = text => Date.parse(`${text}Z`) / 1000;
const MINUTE = 60;

const KOMENDA = {latitude: 46.20484, longitude: 14.53839};
const TROMSO = {latitude: 69.6492, longitude: 18.9553};

/** Local day in Ljubljana in November (CET, UTC+1): [start, end) in Unix seconds. */
function ljubljanaDay(day, month = 11) {
    const start = Date.UTC(2026, month - 1, day, -1) / 1000;
    return [start, start + 86400];
}

const FULL_MOONS_2026 = [
    '2026-01-03T10:02:51', '2026-02-01T22:09:10', '2026-03-03T11:37:50', '2026-04-02T02:11:54',
    '2026-05-01T17:23:07', '2026-05-31T08:45:08', '2026-06-29T23:56:36', '2026-07-29T14:35:37',
    '2026-08-28T04:18:27', '2026-09-26T16:48:58', '2026-10-26T04:11:45', '2026-11-24T14:53:29',
    '2026-12-24T01:28:09',
];
const NEW_MOONS_2026 = [
    '2026-01-18T19:51:55', '2026-02-17T12:01:05', '2026-03-19T01:23:25', '2026-04-17T11:51:44',
    '2026-05-16T20:00:58', '2026-06-15T02:54:05', '2026-07-14T09:43:31', '2026-08-12T17:36:39',
    '2026-09-11T03:26:55', '2026-10-10T15:50:01', '2026-11-09T07:02:03', '2026-12-09T00:51:47',
    '2027-01-07T20:24:19',
];

function assertSequence(phase, references) {
    let time = utc('2026-01-01T00:00:00');
    for (const reference of references) {
        time = nextPrincipalPhase(time, phase);
        assert.close(time, utc(reference), MINUTE, `${phase} ${reference}:`);
    }
}

test('every full moon of 2026 within a minute', () => assertSequence(MoonPhase.FULL, FULL_MOONS_2026));

test('every new moon of 2026 within a minute', () => assertSequence(MoonPhase.NEW, NEW_MOONS_2026));

test('quarters and the previous phase', () => {
    const now = utc('2026-11-24T07:00:00');
    assert.close(previousPrincipalPhase(now, MoonPhase.FIRST_QUARTER), utc('2026-11-17T11:47:45'), 2 * MINUTE);
    assert.close(nextPrincipalPhase(now, MoonPhase.LAST_QUARTER), utc('2026-12-01T06:08:35'), 2 * MINUTE);
    assert.close(previousPrincipalPhase(now, MoonPhase.LAST_QUARTER), utc('2026-11-01T20:28:22'), 2 * MINUTE);
    assert.close(previousPrincipalPhase(now, MoonPhase.NEW), utc('2026-11-09T07:02:03'), 2 * MINUTE);
});

test('the next phase is always in the future, also right after it happened', () => {
    const fullMoon = nextPrincipalPhase(utc('2026-11-24T00:00:00'), MoonPhase.FULL);
    const next = nextPrincipalPhase(fullMoon + 1, MoonPhase.FULL);
    assert.close(next, utc('2026-12-24T01:28:09'), 2 * MINUTE);
    assert.ok(previousPrincipalPhase(fullMoon + 1, MoonPhase.FULL) <= fullMoon + 1);
});

test('illuminated fraction', () => {
    const percent = text => illuminatedFraction(utc(text)) * 100;
    assert.close(percent('2026-11-24T07:00:00'), 99.651, 0.3, 'before the full moon:');
    assert.close(percent('2026-11-17T11:47:45'), 50.127, 0.3, 'first quarter:');
    assert.close(percent('2026-11-09T07:02:00'), 0.186, 0.3, 'new moon:');
    assert.close(percent('2026-11-12T12:00:00'), 9.551, 0.3, 'crescent:');
    assert.close(percent('2026-11-28T18:00:00'), 76.939, 0.3, 'gibbous:');
});

test('elongation grows from new (0°) through full (180°)', () => {
    assert.close(elongation(utc('2026-11-24T14:53:29')), 180, 0.05);
    const newMoon = elongation(utc('2026-11-09T07:02:03'));
    assert.ok(newMoon < 0.05 || newMoon > 359.95, `${newMoon}`);
});

test('a day is named after the principal phase that happens on it', () => {
    const phaseOn = (day, month) => phaseOfDay(...ljubljanaDay(day, month)).phase;
    assert.equal(phaseOn(24), MoonPhase.FULL);
    assert.equal(phaseOn(17), MoonPhase.FIRST_QUARTER);
    assert.equal(phaseOn(9), MoonPhase.NEW);
    assert.equal(phaseOn(1, 12), MoonPhase.LAST_QUARTER);
    assert.equal(phaseOn(12), MoonPhase.WAXING_CRESCENT);
    assert.equal(phaseOn(20), MoonPhase.WAXING_GIBBOUS);
    assert.equal(phaseOn(28), MoonPhase.WANING_GIBBOUS);
    assert.equal(phaseOn(5, 12), MoonPhase.WANING_CRESCENT);
    assert.equal(phaseOn(23), MoonPhase.WAXING_GIBBOUS, 'the day before is not yet full');
    assert.equal(phaseOn(25), MoonPhase.WANING_GIBBOUS, 'the day after is no longer full');
    assert.close(phaseOfDay(...ljubljanaDay(24)).principalTime, utc('2026-11-24T14:53:29'), 2 * MINUTE);
    assert.equal(phaseOfDay(...ljubljanaDay(12)).principalTime, null);
});

test('moonrise and moonset in Komenda within two minutes', () => {
    const cases = [
        [24, '2026-11-24T14:45:29', '2026-11-24T06:14:16'],
        [25, '2026-11-25T15:38:32', '2026-11-25T07:35:32'],
        [26, '2026-11-26T16:46:51', '2026-11-26T08:45:53'],
        [19, '2026-11-19T12:37:12', '2026-11-18T23:46:34'],
        [4, '2026-11-04T00:19:01', '2026-11-04T13:29:11'],
    ];
    for (const [day, rise, set] of cases) {
        const result = moonRiseSet(...ljubljanaDay(day), KOMENDA.latitude, KOMENDA.longitude);
        assert.close(result.rise, utc(rise), 2 * MINUTE, `rise ${day}.11.:`);
        assert.close(result.set, utc(set), 2 * MINUTE, `set ${day}.11.:`);
        assert.ok(!result.alwaysUp && !result.alwaysDown);
    }
});

test('days without a moonrise or a moonset', () => {
    const noRise = moonRiseSet(...ljubljanaDay(2), KOMENDA.latitude, KOMENDA.longitude);
    assert.equal(noRise.rise, null);
    assert.close(noRise.set, utc('2026-11-02T12:49:02'), 3 * MINUTE);

    const noSet = moonRiseSet(...ljubljanaDay(18), KOMENDA.latitude, KOMENDA.longitude);
    assert.close(noSet.rise, utc('2026-11-18T12:20:05'), 3 * MINUTE);
    assert.equal(noSet.set, null);
});

test('polar days: the moon stays above or below the horizon', () => {
    const up = moonRiseSet(...ljubljanaDay(24), TROMSO.latitude, TROMSO.longitude);
    assert.deepEqual([up.rise, up.set, up.alwaysUp, up.alwaysDown], [null, null, true, false]);
    const down = moonRiseSet(...ljubljanaDay(12), TROMSO.latitude, TROMSO.longitude);
    assert.deepEqual([down.rise, down.set, down.alwaysUp, down.alwaysDown], [null, null, false, true]);
});

test('moon now: illumination, age and the next full and new moon', () => {
    const now = moonNow(utc('2026-11-24T07:00:00'));
    assert.close(now.illumination, 0.9965, 0.003);
    assert.close(now.age, 15.0, 0.01);
    assert.close(now.nextFull, utc('2026-11-24T14:53:29'), 2 * MINUTE);
    assert.close(now.nextNew, utc('2026-12-09T00:51:47'), 2 * MINUTE);

    const later = moonNow(utc('2026-11-24T15:00:00'));
    assert.close(later.nextFull, utc('2026-12-24T01:28:09'), 2 * MINUTE);
});

test('moon days follow the forecast days of the location', () => {
    const starts = [23, 24, 25].map(day => ljubljanaDay(day)[0]);
    const days = moonDays(starts.map(time => ({time})), KOMENDA);
    assert.deepEqual(days.map(day => day.phase), [MoonPhase.WAXING_GIBBOUS, MoonPhase.FULL, MoonPhase.WANING_GIBBOUS]);
    assert.close(days[1].rise, utc('2026-11-24T14:45:29'), 3 * MINUTE);
    assert.close(days[2].set, utc('2026-11-25T07:35:32'), 3 * MINUTE, 'last day ends 24 h after its start:');
    assert.ok(days[1].illumination > 0.995);
});

test('every phase has a name and a bundled icon', () => {
    for (const phase of Object.values(MoonPhase)) {
        assert.ok(phaseName(phase).length > 0, phase);
        assert.equal(phaseIcon(phase), `moon-${phase}.svg`);
    }
    assert.equal(phaseName(MoonPhase.FULL), 'Full moon');
});

test('moonrise and moonset as text in the time zone of the location', () => {
    const fmt = new Formatter({locale: 'en-GB', timeZone: 'Europe/Ljubljana'});
    const day = {rise: Date.UTC(2026, 10, 24, 14, 45, 29) / 1000, set: Date.UTC(2026, 10, 24, 6, 14, 16) / 1000};
    assert.deepEqual(riseSetText(day, fmt), {rise: '15:45', set: '07:14'});
    assert.deepEqual(riseSetText({rise: null, set: day.set}, fmt), {rise: '–', set: '07:14'});
    assert.deepEqual(riseSetText({alwaysUp: true}, fmt), {rise: 'up all day', set: '–'});
    assert.deepEqual(riseSetText({alwaysDown: true}, fmt), {rise: 'down all day', set: '–'});
});
