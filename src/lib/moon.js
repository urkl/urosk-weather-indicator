// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * The Moon, computed locally (no network request, no API key): phase, illuminated fraction,
 * age, the times of new moon, quarters and full moon, and moonrise and moonset for a place.
 *
 * Positions follow Jean Meeus, "Astronomical Algorithms" (2nd ed., 1998): the Moon with the
 * periodic terms of chapter 47 (about 10″), the Sun with a truncated VSOP87 series (about
 * 1″). Principal phases are found where the apparent longitudes of the Moon and the Sun
 * differ by 0°, 90°, 180° and 270°, so the phase times and the illuminated fraction come
 * from the same model; from 2020 to 2035 they are within 40 seconds of the full VSOP87 and
 * ELP theories. Moonrise and moonset use the standard altitude of chapter 15 (upper limb,
 * refraction and parallax) and agree with almanac values within a minute at mid latitudes;
 * near the poles, where the Moon grazes the horizon, a few minutes are possible.
 */
import {_, N_} from './i18n.js';

export const MoonPhase = Object.freeze({
    NEW: 'new',
    WAXING_CRESCENT: 'waxing-crescent',
    FIRST_QUARTER: 'first-quarter',
    WAXING_GIBBOUS: 'waxing-gibbous',
    FULL: 'full',
    WANING_GIBBOUS: 'waning-gibbous',
    LAST_QUARTER: 'last-quarter',
    WANING_CRESCENT: 'waning-crescent',
});

const PHASE_NAMES = {
    [MoonPhase.NEW]: N_('New moon'),
    [MoonPhase.WAXING_CRESCENT]: N_('Waxing crescent'),
    [MoonPhase.FIRST_QUARTER]: N_('First quarter'),
    [MoonPhase.WAXING_GIBBOUS]: N_('Waxing gibbous'),
    [MoonPhase.FULL]: N_('Full moon'),
    [MoonPhase.WANING_GIBBOUS]: N_('Waning gibbous'),
    [MoonPhase.LAST_QUARTER]: N_('Last quarter'),
    [MoonPhase.WANING_CRESCENT]: N_('Waning crescent'),
};

/** Elongation of the Moon from the Sun at each principal phase, in degrees. */
const PRINCIPAL_ANGLES = {
    [MoonPhase.NEW]: 0,
    [MoonPhase.FIRST_QUARTER]: 90,
    [MoonPhase.FULL]: 180,
    [MoonPhase.LAST_QUARTER]: 270,
};
const PRINCIPAL_PHASES = [MoonPhase.NEW, MoonPhase.FIRST_QUARTER, MoonPhase.FULL, MoonPhase.LAST_QUARTER];

/** Translated name of a phase, e.g. "Full moon". */
export function phaseName(phase) {
    return _(PHASE_NAMES[phase] ?? PHASE_NAMES[MoonPhase.NEW]);
}

/** File name of the bundled Meteocons icon of a phase. */
export function phaseIcon(phase) {
    return `moon-${phase}.svg`;
}

const DAY = 86400;
const RAD = Math.PI / 180;
const J2000 = 2451545.0;
const SYNODIC_MONTH = 29.530588853;
/** Mean rate of the elongation, degrees per day. */
const ELONGATION_RATE = 360 / SYNODIC_MONTH;
/**
 * Terrestrial Time minus Universal Time in seconds. About 69 s from 2015 and changing by
 * less than a second a year; an error of a few seconds moves the results by seconds.
 */
const DELTA_T = 69;
const EARTH_RADIUS_KM = 6378.14;
const AU_KM = 149597870.7;

const sin = degrees => Math.sin(degrees * RAD);
const cos = degrees => Math.cos(degrees * RAD);
const norm360 = degrees => ((degrees % 360) + 360) % 360;
const wrap180 = degrees => norm360(degrees + 180) - 180;

const julianDay = unixSeconds => unixSeconds / DAY + 2440587.5;
/** Julian centuries since J2000.0 in Terrestrial Time. */
const centuries = unixSeconds => (julianDay(unixSeconds + DELTA_T) - J2000) / 36525;

/*
 * Meeus table 47.A: multiples of D, M, M′, F with the coefficients of the longitude
 * (10⁻⁶ degree) and of the distance (10⁻³ km).
 */
const LONGITUDE_DISTANCE_TERMS = [
    [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
    [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
    [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
    [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
    [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
    [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
    [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
    [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
    [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
    [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
    [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884], [0, 1, 2, 0, -2120, 5751],
    [0, 2, 0, 0, -2069, 0], [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
    [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958], [0, 0, 2, 2, -1110, 0],
    [3, 0, -1, 0, -892, 3258], [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897],
    [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354], [2, 1, -2, 0, 691, 0],
    [2, -1, 0, -2, 596, 0], [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
    [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739], [2, 1, 0, -2, -399, 0],
    [0, 0, 2, -2, -381, -4421], [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0],
    [4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0], [0, 2, 1, 0, -323, 1165],
    [1, 1, -1, 0, 299, 0], [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752],
];

/* Meeus table 47.B: multiples of D, M, M′, F with the coefficient of the latitude (10⁻⁶ degree). */
const LATITUDE_TERMS = [
    [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
    [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
    [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
    [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
    [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
    [0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
    [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335], [0, 0, 3, 1, 1107],
    [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833], [0, 0, 1, -3, 777], [4, 0, -2, 1, 671],
    [2, 0, 0, -3, 607], [2, 0, 2, -1, 596], [2, -1, 1, -1, 491], [2, 0, -2, 1, -451],
    [0, 0, 3, -1, 439], [2, 0, 2, 1, 422], [2, 0, -3, -1, 421], [2, 1, -1, 1, -366],
    [2, 1, 0, 1, -351], [4, 0, 0, 1, 331], [2, -1, 1, 1, 315], [2, -2, 0, -1, 302],
    [0, 0, 1, 3, -283], [2, 1, 1, -1, -229], [1, 1, 0, -1, 223], [1, 1, 0, 1, 223],
    [0, 1, -2, -1, -220], [2, 1, -1, -1, -220], [1, 0, 1, 1, -185], [2, -1, -2, -1, 181],
    [0, 1, 2, 1, -177], [4, 0, -2, -1, 176], [4, -1, -1, -1, 166], [1, 0, 1, -1, -164],
    [4, 0, 1, -1, 132], [1, 0, -1, -1, -119], [4, -1, 0, -1, 115], [2, -2, 0, 1, 107],
];

/*
 * VSOP87D series for the Earth (Meeus appendix III), truncated to the terms above about
 * 0.1″: [amplitude in 10⁻⁸ rad or AU, phase in rad, frequency in rad per millennium].
 */
const EARTH_LONGITUDE = [
    [
        [175347046, 0, 0], [3341656, 4.6692568, 6283.07585], [34894, 4.6261, 12566.1517],
        [3497, 2.7441, 5753.3849], [3418, 2.8289, 3.5231], [3136, 3.6277, 77713.7715],
        [2676, 4.4181, 7860.4194], [2343, 6.1352, 3930.2097], [1324, 0.7425, 11506.7698],
        [1273, 2.0371, 529.691], [1199, 1.1096, 1577.3435], [990, 5.233, 5884.927],
        [902, 2.045, 26.298], [857, 3.508, 398.149], [780, 1.179, 5223.694],
        [753, 2.533, 5507.553], [505, 4.583, 18849.228], [492, 4.205, 775.523],
        [357, 2.92, 0.067], [317, 5.849, 11790.629], [284, 1.899, 796.298],
        [271, 0.315, 10977.079], [243, 0.345, 5486.778], [206, 4.806, 2544.314],
        [205, 1.869, 5573.143], [202, 2.458, 6069.777], [156, 0.833, 213.299],
        [132, 3.411, 2942.463], [126, 1.083, 20.775], [115, 0.645, 0.98],
        [103, 0.636, 4694.003], [102, 0.976, 15720.839], [102, 4.267, 7.114],
        [99, 6.21, 2146.17], [98, 0.68, 155.42], [86, 5.98, 161000.69],
        [85, 1.3, 6275.96], [85, 3.67, 71430.7], [80, 1.81, 17260.15],
        [79, 3.04, 12036.46], [75, 1.76, 5088.63], [74, 3.5, 3154.69],
        [74, 4.68, 801.82], [70, 0.83, 9437.76], [62, 3.98, 8827.39],
        [61, 1.82, 7084.9], [57, 2.78, 6286.6], [56, 4.39, 14143.5],
        [56, 3.47, 6279.55], [52, 0.19, 12139.55], [52, 1.33, 1748.02],
        [51, 0.28, 5856.48], [49, 0.49, 1194.45], [41, 5.37, 8429.24],
        [41, 2.4, 19651.05], [39, 6.17, 10447.39], [37, 6.04, 10213.29],
        [37, 2.57, 1059.38], [36, 1.71, 2352.87], [36, 1.78, 6812.77],
        [33, 0.59, 17789.85], [30, 0.44, 83996.85], [30, 2.74, 1349.87],
        [25, 3.16, 4690.48],
    ],
    [
        [628331966747, 0, 0], [206059, 2.678235, 6283.07585], [4303, 2.6351, 12566.1517],
        [425, 1.59, 3.523], [119, 5.796, 26.298], [109, 2.966, 1577.344],
        [93, 2.59, 18849.23], [72, 1.14, 529.69], [68, 1.87, 398.15],
        [67, 4.41, 5507.55], [59, 2.89, 5223.69], [56, 2.17, 155.42],
        [45, 0.4, 796.3], [36, 0.47, 775.52], [29, 2.65, 7.11],
        [21, 5.34, 0.98], [19, 1.85, 5486.78], [19, 4.97, 213.3],
        [17, 2.99, 6275.96], [16, 0.03, 2544.31],
    ],
    [
        [52919, 0, 0], [8720, 1.0721, 6283.0758], [309, 0.867, 12566.152],
        [27, 0.05, 3.52], [16, 5.19, 26.3], [16, 3.68, 155.42],
        [10, 0.76, 18849.23], [9, 2.06, 77713.77], [7, 0.83, 775.52],
    ],
    [[289, 5.844, 6283.076], [35, 0, 0], [17, 5.49, 12566.15]],
    [[114, 3.142, 0], [8, 4.13, 6283.08]],
];
const EARTH_RADIUS = [
    [
        [100013989, 0, 0], [1670700, 3.0984635, 6283.07585], [13956, 3.05525, 12566.1517],
        [3084, 5.1985, 77713.7715], [1628, 1.1739, 5753.3849], [1576, 2.8469, 7860.4194],
        [925, 5.453, 11506.77], [542, 4.564, 3930.21], [472, 3.661, 5884.927],
        [346, 0.964, 5507.553], [329, 5.9, 5223.694], [307, 0.299, 5573.143],
        [243, 4.273, 11790.629], [212, 5.847, 1577.344], [186, 5.022, 10977.079],
        [175, 3.012, 18849.228], [110, 5.055, 5486.778],
    ],
    [[103019, 1.10749, 6283.07585], [1721, 1.0644, 12566.1517], [702, 3.142, 0]],
    [[4359, 5.7846, 6283.0758], [124, 5.579, 12566.152]],
    [[145, 4.273, 6283.076]],
];

/** Nutation in longitude and obliquity (degrees), the two largest terms. */
function nutation(T) {
    const omega = 125.04452 - 1934.136261 * T;
    const sunLongitude = 280.4665 + 36000.7698 * T;
    const moonLongitude = 218.3165 + 481267.8813 * T;
    return {
        longitude: (-17.2 * sin(omega) - 1.32 * sin(2 * sunLongitude) - 0.23 * sin(2 * moonLongitude) + 0.21 * sin(2 * omega)) / 3600,
        obliquity: (9.2 * cos(omega) + 0.57 * cos(2 * sunLongitude) + 0.1 * cos(2 * moonLongitude) - 0.09 * cos(2 * omega)) / 3600,
    };
}

/**
 * Geocentric ecliptic position of the Moon, referred to the mean equinox of the date.
 *
 * @param {number} unixSeconds
 * @returns {{longitude: number, latitude: number, distance: number}} degrees and km
 */
export function moonPosition(unixSeconds) {
    const T = centuries(unixSeconds);
    const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    const L = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000);
    const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000);
    const M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000);
    const Mm = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000);
    const F = norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000);
    const A1 = 119.75 + 131.849 * T;
    const A2 = 53.09 + 479264.290 * T;
    const A3 = 313.45 + 481266.484 * T;
    // Terms with the Sun's anomaly shrink with the decreasing eccentricity of the Earth's orbit
    const E = 1 - 0.002516 * T - 0.0000074 * T2;
    const eccentricity = m => (m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E);

    let longitude = 0, distance = 0, latitude = 0;
    for (const [d, m, mm, f, l, r] of LONGITUDE_DISTANCE_TERMS) {
        const argument = d * D + m * M + mm * Mm + f * F;
        const factor = eccentricity(m);
        longitude += l * factor * sin(argument);
        distance += r * factor * cos(argument);
    }
    for (const [d, m, mm, f, b] of LATITUDE_TERMS)
        latitude += b * eccentricity(m) * sin(d * D + m * M + mm * Mm + f * F);

    longitude += 3958 * sin(A1) + 1962 * sin(L - F) + 318 * sin(A2);
    latitude += -2235 * sin(L) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) +
        127 * sin(L - Mm) - 115 * sin(L + Mm);

    return {
        longitude: norm360(L + longitude / 1e6),
        latitude: latitude / 1e6,
        distance: 385000.56 + distance / 1000,
    };
}

/**
 * Geocentric position of the Sun (Meeus chapter 25, higher accuracy): longitude referred to
 * the mean equinox of the date and corrected for aberration.
 *
 * @param {number} unixSeconds
 * @returns {{longitude: number, distance: number}} degrees and km
 */
export function sunPosition(unixSeconds) {
    const tau = centuries(unixSeconds) / 10;
    const series = terms => terms.reduce((sum, [a, b, c]) => sum + a * Math.cos(b + c * tau), 0);
    const polynomial = parts => parts.reduceRight((sum, terms) => sum * tau + series(terms), 0) / 1e8;
    // Heliocentric longitude of the Earth + 180° = geocentric longitude of the Sun
    const longitude = polynomial(EARTH_LONGITUDE) / RAD + 180;
    const radius = polynomial(EARTH_RADIUS);
    // FK5 frame (−0.09033″) and aberration (−20.4898″ / R)
    return {longitude: norm360(longitude - (0.09033 + 20.4898 / radius) / 3600), distance: radius * AU_KM};
}

/**
 * Elongation of the Moon east of the Sun in ecliptic longitude: 0° new moon, 90° first
 * quarter, 180° full moon, 270° last quarter.
 *
 * @param {number} unixSeconds
 * @returns {number} degrees, 0–360
 */
export function elongation(unixSeconds) {
    return norm360(moonPosition(unixSeconds).longitude - sunPosition(unixSeconds).longitude);
}

/**
 * Illuminated fraction of the Moon's disk (Meeus chapter 48).
 *
 * @param {number} unixSeconds
 * @returns {number} 0–1
 */
export function illuminatedFraction(unixSeconds) {
    const moon = moonPosition(unixSeconds);
    const sun = sunPosition(unixSeconds);
    const cosPsi = cos(moon.latitude) * cos(moon.longitude - sun.longitude);
    const psi = Math.acos(Math.max(-1, Math.min(1, cosPsi)));
    const phaseAngle = Math.atan2(sun.distance * Math.sin(psi), moon.distance - sun.distance * cosPsi);
    return (1 + Math.cos(phaseAngle)) / 2;
}

/** Phase times are solved to better than this many seconds. */
const PHASE_PRECISION = 2;

/** Time near `guess` when the elongation equals `angle` (Newton steps with the mean rate). */
function solveElongation(angle, guess) {
    let time = guess;
    for (let i = 0; i < 40; i++) {
        const step = -wrap180(elongation(time) - angle) / ELONGATION_RATE * DAY;
        time += step;
        if (Math.abs(step) < PHASE_PRECISION / 4)
            break;
    }
    return time;
}

/**
 * Time of the next principal phase after `unixSeconds`.
 *
 * @param {number} unixSeconds
 * @param {string} phase `MoonPhase.NEW`, `FIRST_QUARTER`, `FULL` or `LAST_QUARTER`
 * @returns {number} Unix seconds
 */
export function nextPrincipalPhase(unixSeconds, phase) {
    const angle = PRINCIPAL_ANGLES[phase];
    const ahead = norm360(angle - elongation(unixSeconds));
    let time = solveElongation(angle, unixSeconds + ahead / ELONGATION_RATE * DAY);
    // Starting at (or within the solver's precision of) a phase finds that phase again
    if (time - unixSeconds < PHASE_PRECISION)
        time = solveElongation(angle, time + SYNODIC_MONTH * DAY);
    return time;
}

/**
 * Time of the last principal phase at or before `unixSeconds`.
 *
 * @param {number} unixSeconds
 * @param {string} phase see `nextPrincipalPhase`
 * @returns {number} Unix seconds
 */
export function previousPrincipalPhase(unixSeconds, phase) {
    const angle = PRINCIPAL_ANGLES[phase];
    const behind = norm360(elongation(unixSeconds) - angle);
    let time = solveElongation(angle, unixSeconds - behind / ELONGATION_RATE * DAY);
    if (time > unixSeconds)
        time = solveElongation(angle, time - SYNODIC_MONTH * DAY);
    return time;
}

/** Days since the last new moon. */
export function moonAge(unixSeconds) {
    return (unixSeconds - previousPrincipalPhase(unixSeconds, MoonPhase.NEW)) / DAY;
}

/**
 * Phase of a local calendar day. A day on which a principal phase happens is named after
 * it (the full moon day is "Full moon"); the days between are crescent or gibbous.
 *
 * @param {number} start Unix seconds of the local midnight
 * @param {number} end Unix seconds of the next local midnight
 * @returns {{phase: string, principalTime: number|null}}
 */
export function phaseOfDay(start, end) {
    const first = elongation(start);
    // The elongation grows by 10–15° a day, so the day never spans a whole cycle
    const span = norm360(elongation(end) - first);
    const quarter = Math.floor(first / 90);
    if (Math.floor((first + span) / 90) > quarter) {
        const phase = PRINCIPAL_PHASES[(quarter + 1) % 4];
        return {phase, principalTime: nextPrincipalPhase(start, phase)};
    }
    const middle = norm360(first + span / 2);
    const phase = middle < 90 ? MoonPhase.WAXING_CRESCENT
        : middle < 180 ? MoonPhase.WAXING_GIBBOUS
            : middle < 270 ? MoonPhase.WANING_GIBBOUS : MoonPhase.WANING_CRESCENT;
    return {phase, principalTime: null};
}

/** Right ascension and declination of the Moon (apparent, degrees) and its distance (km). */
function moonEquatorial(unixSeconds) {
    const T = centuries(unixSeconds);
    const {longitude, latitude, distance} = moonPosition(unixSeconds);
    const nutations = nutation(T);
    const lambda = longitude + nutations.longitude;
    const epsilon = 23.4392911 - 0.0130042 * T + nutations.obliquity;
    const rightAscension = Math.atan2(sin(lambda) * cos(epsilon) - Math.tan(latitude * RAD) * sin(epsilon), cos(lambda)) / RAD;
    const declination = Math.asin(sin(latitude) * cos(epsilon) + cos(latitude) * sin(epsilon) * sin(lambda)) / RAD;
    return {rightAscension, declination, distance, nutation: nutations.longitude * cos(epsilon)};
}

/** Apparent sidereal time at Greenwich in degrees (Meeus 12.4 plus the equation of the equinoxes). */
function siderealTime(unixSeconds, equationOfEquinoxes) {
    const jd = julianDay(unixSeconds);
    const T = (jd - J2000) / 36525;
    return norm360(280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * T * T - T * T * T / 38710000 +
        equationOfEquinoxes);
}

/**
 * Geocentric altitude of the Moon's centre above the horizon minus the standard altitude
 * of moonrise (upper limb on the horizon after refraction and parallax, Meeus 15).
 */
function altitudeAboveRiseLevel(unixSeconds, latitude, longitude) {
    const moon = moonEquatorial(unixSeconds);
    const hourAngle = siderealTime(unixSeconds, moon.nutation) + longitude - moon.rightAscension;
    const altitude = Math.asin(sin(latitude) * sin(moon.declination) +
        cos(latitude) * cos(moon.declination) * cos(hourAngle)) / RAD;
    const parallax = Math.asin(EARTH_RADIUS_KM / moon.distance) / RAD;
    return altitude - (0.7275 * parallax - 34 / 60);
}

const RISE_SET_STEP = 20 * 60;

/**
 * Moonrise and moonset between `start` and `end` (a local day) for a place. The Moon rises
 * about 50 minutes later every day, so once a month a day has no moonrise and another no
 * moonset; near the poles it can stay above or below the horizon for days.
 *
 * @param {number} start Unix seconds
 * @param {number} end Unix seconds (exclusive)
 * @param {number} latitude degrees north
 * @param {number} longitude degrees east
 * @returns {{rise: number|null, set: number|null, alwaysUp: boolean, alwaysDown: boolean}}
 */
export function moonRiseSet(start, end, latitude, longitude) {
    const height = time => altitudeAboveRiseLevel(time, latitude, longitude);
    const refine = (from, to, rising) => {
        for (let i = 0; i < 12; i++) {
            const middle = (from + to) / 2;
            if ((height(middle) >= 0) === rising)
                to = middle;
            else
                from = middle;
        }
        return Math.round((from + to) / 2);
    };

    let rise = null, set = null, crossed = false;
    let time = start, value = height(start);
    const startsUp = value >= 0;
    while (time < end && (rise === null || set === null)) {
        const next = Math.min(time + RISE_SET_STEP, end);
        const nextValue = height(next);
        if (value < 0 && nextValue >= 0) {
            crossed = true;
            const found = refine(time, next, true);
            if (rise === null && found < end)
                rise = found;
        } else if (value >= 0 && nextValue < 0) {
            crossed = true;
            const found = refine(time, next, false);
            if (set === null && found < end)
                set = found;
        }
        time = next;
        value = nextValue;
    }
    return {rise, set, alwaysUp: !crossed && startsUp, alwaysDown: !crossed && !startsUp};
}

/**
 * The Moon on each forecast day of a location: phase, illuminated fraction at midday,
 * moonrise and moonset. Days are the local midnights returned with the forecast.
 *
 * @param {Array<{time: number}>} days
 * @param {{latitude: number, longitude: number}} location
 * @returns {Array<object>}
 */
export function moonDays(days, {latitude, longitude}) {
    return days.map((day, i) => {
        const start = day.time;
        const end = days[i + 1]?.time ?? start + DAY;
        return {
            ...phaseOfDay(start, end),
            illumination: illuminatedFraction((start + end) / 2),
            ...moonRiseSet(start, end, latitude, longitude),
        };
    });
}

/**
 * Moonrise and moonset of a day as text, e.g. `{rise: '15:45', set: '07:14'}`; a missing
 * event is `–`, and a day without either says that the Moon stays up or down.
 *
 * @param {object} day an entry of `moonDays`
 * @param {import('./format.js').Formatter} fmt
 * @returns {{rise: string, set: string}}
 */
export function riseSetText(day, fmt) {
    if (day.alwaysUp)
        return {rise: _('up all day'), set: '–'};
    if (day.alwaysDown)
        return {rise: _('down all day'), set: '–'};
    return {rise: fmt.time(day.rise), set: fmt.time(day.set)};
}

/**
 * The Moon right now.
 *
 * @param {number} unixSeconds
 * @returns {{illumination: number, age: number, nextFull: number, nextNew: number}}
 */
export function moonNow(unixSeconds) {
    return {
        illumination: illuminatedFraction(unixSeconds),
        age: moonAge(unixSeconds),
        nextFull: nextPrincipalPhase(unixSeconds, MoonPhase.FULL),
        nextNew: nextPrincipalPhase(unixSeconds, MoonPhase.NEW),
    };
}
