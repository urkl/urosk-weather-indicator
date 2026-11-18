// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Unit conversions. Forecasts are always requested and evaluated in metric units
 * (°C, km/h, mm, hPa); conversion happens only when values are displayed.
 */

export const TemperatureUnit = Object.freeze({CELSIUS: 'celsius', FAHRENHEIT: 'fahrenheit'});
export const WindSpeedUnit = Object.freeze({KMH: 'kmh', MS: 'ms', MPH: 'mph', KNOTS: 'kn'});
export const PrecipitationUnit = Object.freeze({MM: 'mm', INCH: 'inch'});
export const PressureUnit = Object.freeze({HPA: 'hpa', INHG: 'inhg', MMHG: 'mmhg'});

/** Symbols shown after a value. Units are international symbols and are not translated. */
export const UNIT_SYMBOLS = Object.freeze({
    [WindSpeedUnit.KMH]: 'km/h',
    [WindSpeedUnit.MS]: 'm/s',
    [WindSpeedUnit.MPH]: 'mph',
    [WindSpeedUnit.KNOTS]: 'kn',
    [PrecipitationUnit.MM]: 'mm',
    [PrecipitationUnit.INCH]: 'in',
    [PressureUnit.HPA]: 'hPa',
    [PressureUnit.INHG]: 'inHg',
    [PressureUnit.MMHG]: 'mmHg',
});

/**
 * @param {number} celsius
 * @param {string} unit one of `TemperatureUnit`
 * @returns {number}
 */
export function convertTemperature(celsius, unit) {
    return unit === TemperatureUnit.FAHRENHEIT ? celsius * 9 / 5 + 32 : celsius;
}

/**
 * @param {number} kmh
 * @param {string} unit one of `WindSpeedUnit`
 * @returns {number}
 */
export function convertWindSpeed(kmh, unit) {
    switch (unit) {
    case WindSpeedUnit.MS:
        return kmh / 3.6;
    case WindSpeedUnit.MPH:
        return kmh / 1.609344;
    case WindSpeedUnit.KNOTS:
        return kmh / 1.852;
    default:
        return kmh;
    }
}

/**
 * @param {number} mm
 * @param {string} unit one of `PrecipitationUnit`
 * @returns {number}
 */
export function convertPrecipitation(mm, unit) {
    return unit === PrecipitationUnit.INCH ? mm / 25.4 : mm;
}

/**
 * @param {number} hpa
 * @param {string} unit one of `PressureUnit`
 * @returns {number}
 */
export function convertPressure(hpa, unit) {
    switch (unit) {
    case PressureUnit.INHG:
        return hpa * 0.0295299830714;
    case PressureUnit.MMHG:
        return hpa * 0.750061683;
    default:
        return hpa;
    }
}
