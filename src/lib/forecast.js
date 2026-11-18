// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Multi-model forecast from Open-Meteo: one request returns six weather models, which are
 * combined into a median with a min–max range per value. Days where the models disagree
 * are flagged, because a single number would hide that the forecast is uncertain.
 *
 * Weather data by Open-Meteo.com (CC BY 4.0).
 */
import {N_} from './i18n.js';
import {precipitationDiverges, summarize, temperatureDiverges} from './stats.js';
import {combineCodes} from './weatherCodes.js';

const API_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * Models requested from Open-Meteo. ICON-D2 and ICON-EU are regional (Europe);
 * elsewhere fewer models contribute and the median is built from the rest.
 */
export const MODELS = Object.freeze([
    {id: 'icon_d2', name: 'ICON-D2', info: N_('DWD, 2 km, up to 2 days')},
    {id: 'icon_eu', name: 'ICON-EU', info: N_('DWD, 7 km, up to 5 days')},
    {id: 'ecmwf_ifs025', name: 'ECMWF', info: N_('IFS 0.25°, 7+ days')},
    {id: 'gfs_seamless', name: 'GFS', info: N_('NOAA, 7+ days')},
    {id: 'meteofrance_seamless', name: 'Météo-France', info: N_('AROME/ARPEGE, up to 4 days')},
    {id: 'ukmo_seamless', name: 'UKMO', info: N_('Met Office, up to 7 days')},
]);

const CURRENT_VARIABLES = [
    'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'wind_speed_10m', 'wind_gusts_10m',
    'wind_direction_10m', 'pressure_msl', 'precipitation', 'weather_code', 'is_day', 'cloud_cover',
];
const HOURLY_VARIABLES = [
    'temperature_2m', 'precipitation', 'precipitation_probability', 'weather_code', 'wind_speed_10m',
    'wind_gusts_10m', 'is_day',
];
const DAILY_VARIABLES = [
    'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum',
    'precipitation_probability_max', 'uv_index_max', 'sunrise', 'sunset', 'wind_speed_10m_max',
    'wind_gusts_10m_max',
];

/**
 * Request URL for a location. Times come back as Unix timestamps and the time zone is
 * resolved by Open-Meteo from the coordinates (`timezone=auto`).
 *
 * @param {object} location
 * @param {number} location.latitude
 * @param {number} location.longitude
 * @param {number} [days]
 * @returns {string}
 */
export function buildForecastUrl({latitude, longitude}, days = 7) {
    const params = [
        `latitude=${latitude.toFixed(4)}`,
        `longitude=${longitude.toFixed(4)}`,
        'timezone=auto',
        'timeformat=unixtime',
        `forecast_days=${days}`,
        `models=${MODELS.map(model => model.id).join(',')}`,
        `current=${CURRENT_VARIABLES.join(',')}`,
        `hourly=${HOURLY_VARIABLES.join(',')}`,
        `daily=${DAILY_VARIABLES.join(',')}`,
    ];
    return `${API_URL}?${params.join('&')}`;
}

const valueOrNull = value => value ?? null;
const nonNegative = value => value === null ? null : Math.max(0, value);

/** Values of one variable at index `i` for every model, in `MODELS` order. */
function perModel(block, variable, i) {
    return MODELS.map(model => valueOrNull(block[`${variable}_${model.id}`]?.[i]));
}

function parseCurrent(current = {}) {
    return {
        time: valueOrNull(current.time),
        temperature: valueOrNull(current.temperature_2m),
        apparentTemperature: valueOrNull(current.apparent_temperature),
        humidity: valueOrNull(current.relative_humidity_2m),
        windSpeed: valueOrNull(current.wind_speed_10m),
        windGusts: valueOrNull(current.wind_gusts_10m),
        windDirection: valueOrNull(current.wind_direction_10m),
        pressure: valueOrNull(current.pressure_msl),
        precipitation: valueOrNull(current.precipitation),
        code: valueOrNull(current.weather_code),
        isDay: current.is_day !== 0,
        cloudCover: valueOrNull(current.cloud_cover),
    };
}

function parseHour(hourly, i) {
    const isDayVotes = perModel(hourly, 'is_day', i).filter(value => value !== null);
    return {
        time: hourly.time[i],
        temperature: summarize(perModel(hourly, 'temperature_2m', i)),
        precipitation: summarize(perModel(hourly, 'precipitation', i).map(nonNegative)),
        precipitationProbability: summarize(perModel(hourly, 'precipitation_probability', i)),
        code: combineCodes(perModel(hourly, 'weather_code', i)),
        windSpeed: summarize(perModel(hourly, 'wind_speed_10m', i)),
        windGusts: summarize(perModel(hourly, 'wind_gusts_10m', i)),
        isDay: isDayVotes.length === 0 || isDayVotes.filter(Boolean).length * 2 >= isDayVotes.length,
    };
}

function parseDay(daily, i, hours) {
    const codes = perModel(daily, 'weather_code', i);
    const maxTemperature = summarize(perModel(daily, 'temperature_2m_max', i));
    const minTemperature = summarize(perModel(daily, 'temperature_2m_min', i));
    const precipitation = summarize(perModel(daily, 'precipitation_sum', i).map(nonNegative));
    const firstOf = variable => perModel(daily, variable, i).find(value => value !== null) ?? null;

    return {
        time: daily.time[i],
        code: combineCodes(codes),
        maxTemperature,
        minTemperature,
        precipitation,
        precipitationProbability: summarize(perModel(daily, 'precipitation_probability_max', i)),
        uvIndex: summarize(perModel(daily, 'uv_index_max', i)),
        windSpeed: summarize(perModel(daily, 'wind_speed_10m_max', i)),
        windGusts: summarize(perModel(daily, 'wind_gusts_10m_max', i)),
        sunrise: firstOf('sunrise'),
        sunset: firstOf('sunset'),
        divergence: {
            precipitation: precipitationDiverges(precipitation),
            temperature: temperatureDiverges(maxTemperature) || temperatureDiverges(minTemperature),
        },
        models: MODELS.map((model, k) => ({
            ...model,
            code: codes[k],
            maxTemperature: valueOrNull(daily[`temperature_2m_max_${model.id}`]?.[i]),
            minTemperature: valueOrNull(daily[`temperature_2m_min_${model.id}`]?.[i]),
            precipitation: nonNegative(valueOrNull(daily[`precipitation_sum_${model.id}`]?.[i])),
        })).filter(model => model.maxTemperature !== null || model.precipitation !== null),
        hours,
    };
}

/**
 * @typedef {object} Forecast
 * @property {string} timeZone IANA time zone of the location
 * @property {object} current current conditions (best-match model)
 * @property {Array<object>} days daily summaries, each with its `hours`
 * @property {Array<object>} modelsWithData models that delivered at least one day
 */

/**
 * Parses an Open-Meteo response (requested with `buildForecastUrl`).
 *
 * @param {object} json
 * @returns {Forecast}
 */
export function parseForecast(json) {
    if (json?.error)
        throw new Error(`Open-Meteo: ${json.reason ?? 'error'}`);

    const daily = json.daily ?? {};
    const hourly = json.hourly ?? {};
    const dayStarts = daily.time ?? [];
    const hourTimes = hourly.time ?? [];

    // Hours are grouped by the local midnights Open-Meteo returns as daily times
    const hoursByDay = dayStarts.map(() => []);
    hourTimes.forEach((time, i) => {
        for (let d = dayStarts.length - 1; d >= 0; d--) {
            if (time >= dayStarts[d]) {
                if (d < dayStarts.length - 1 || time < dayStarts[d] + 86400)
                    hoursByDay[d].push(parseHour(hourly, i));
                break;
            }
        }
    });

    return {
        timeZone: json.timezone ?? 'UTC',
        current: parseCurrent(json.current),
        days: dayStarts.map((_time, i) => parseDay(daily, i, hoursByDay[i])),
        modelsWithData: MODELS.filter(model =>
            (daily[`temperature_2m_max_${model.id}`] ?? []).some(value => value !== null)),
    };
}
