// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Cairo drawings used in the menu: the hourly chart of a day, the temperature bar of the
 * week list and the river charts. Text and grid use the theme's foreground colour (`fg`),
 * so the charts work with both the dark and the light shell style.
 */
import Cairo from 'cairo';

export const COLORS = Object.freeze({
    temperature: [1.0, 0.64, 0.28],
    temperatureBand: [1.0, 0.64, 0.28, 0.22],
    precipitation: [0.38, 0.63, 0.92, 0.85],
    precipitationRange: [0.38, 0.63, 0.92, 0.35],
    water: [0.36, 0.71, 0.96],
    alert: [null, [0.97, 0.83, 0.18], [1.0, 0.56, 0.12], [0.93, 0.20, 0.23]],
});

const withAlpha = (rgb, alpha) => [rgb[0], rgb[1], rgb[2], alpha];

function setColor(cr, color) {
    if (color.length === 4)
        cr.setSourceRGBA(...color);
    else
        cr.setSourceRGB(...color);
}

function text(cr, x, y, value, {size = 10, align = 'left', color, bold = false}) {
    cr.selectFontFace('Sans', Cairo.FontSlant.NORMAL, bold ? Cairo.FontWeight.BOLD : Cairo.FontWeight.NORMAL);
    cr.setFontSize(size);
    const width = cr.textExtents(value).xAdvance;
    const x0 = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    setColor(cr, color);
    cr.moveTo(x0, y);
    cr.showText(value);
}

function verticalLine(cr, x, top, bottom, color, dash = null) {
    setColor(cr, color);
    cr.setLineWidth(1);
    if (dash)
        cr.setDash(dash, 0);
    cr.moveTo(Math.round(x) + 0.5, top);
    cr.lineTo(Math.round(x) + 0.5, bottom);
    cr.stroke();
    if (dash)
        cr.setDash([], 0);
}

function horizontalThresholds(cr, thresholds, {left, right, y, min, max, fg}) {
    cr.setDash([4, 3], 0);
    thresholds.forEach((value, i) => {
        if (value === null || value < min || value > max)
            return;
        const color = COLORS.alert[i + 1] ?? fg;
        setColor(cr, withAlpha(color, 0.85));
        cr.setLineWidth(1);
        cr.moveTo(left, Math.round(y(value)) + 0.5);
        cr.lineTo(right, Math.round(y(value)) + 0.5);
        cr.stroke();
    });
    cr.setDash([], 0);
}

/**
 * Hourly chart of one day: median temperature with the band of model spread, precipitation
 * bars (median, lighter up to the wettest model), hour labels, extremes and a "now" marker.
 *
 * @param {Cairo.Context} cr
 * @param {number} width
 * @param {number} height
 * @param {object} data
 * @param {object[]} data.hours parsed hours of the day
 * @param {number|null} data.now Unix seconds
 * @param {import('./format.js').Formatter} data.fmt
 * @param {number[]} data.fg theme foreground RGB
 */
export function drawHourlyChart(cr, width, height, {hours, now, fmt, fg}) {
    if (!hours?.length)
        return;
    const left = 6, right = 6, top = 16, bottom = 16;
    const w = width - left - right, h = height - top - bottom;
    const n = hours.length;
    const x = i => left + (n === 1 ? w / 2 : i * w / (n - 1));
    const temp = value => value === null ? null : fmt.temperatureValue(value);

    const values = hours.flatMap(hour => [hour.temperature.min, hour.temperature.max, hour.temperature.median])
        .filter(value => value !== null).map(temp);
    if (values.length === 0)
        return;
    let tMin = Math.min(...values), tMax = Math.max(...values);
    if (tMax - tMin < 4) {
        const middle = (tMax + tMin) / 2;
        tMin = middle - 2;
        tMax = middle + 2;
    }
    const yT = t => top + h * 0.08 + h * 0.62 * (1 - (t - tMin) / (tMax - tMin));

    // Precipitation uses the lower 40 %, scaled to at least 2 mm/h
    const pMax = Math.max(2, ...hours.map(hour => hour.precipitation.max ?? 0));
    const yP = mm => top + h - h * 0.40 * Math.min(1, mm / pMax);
    const barWidth = Math.max(2, w / n * 0.6);

    hours.forEach((hour, i) => {
        const hourOfDay = fmt.hourOfDay(hour.time);
        if (hourOfDay % 3 !== 0)
            return;
        verticalLine(cr, x(i), top, top + h, withAlpha(fg, 0.10));
        // Keep the first and last label inside the chart
        const align = i === 0 ? 'left' : i === n - 1 ? 'right' : 'center';
        text(cr, x(i), height - 3, fmt.hour(hour.time), {size: 9, align, color: withAlpha(fg, 0.62)});
    });

    hours.forEach((hour, i) => {
        for (const [value, color] of [[hour.precipitation.max, COLORS.precipitationRange],
            [hour.precipitation.median, COLORS.precipitation]]) {
            if ((value ?? 0) > 0.05) {
                setColor(cr, color);
                cr.rectangle(x(i) - barWidth / 2, yP(value), barWidth, top + h - yP(value));
                cr.fill();
            }
        }
    });

    const banded = hours.map((hour, i) => ({i, hour}))
        .filter(({hour}) => hour.temperature.min !== null && hour.temperature.max !== null);
    if (banded.length > 1) {
        setColor(cr, COLORS.temperatureBand);
        banded.forEach(({i, hour}, k) => {
            const y = yT(temp(hour.temperature.max));
            if (k === 0)
                cr.moveTo(x(i), y);
            else
                cr.lineTo(x(i), y);
        });
        [...banded].reverse().forEach(({i, hour}) => cr.lineTo(x(i), yT(temp(hour.temperature.min))));
        cr.closePath();
        cr.fill();
    }

    setColor(cr, COLORS.temperature);
    cr.setLineWidth(2);
    let started = false;
    hours.forEach((hour, i) => {
        if (hour.temperature.median === null)
            return;
        const y = yT(temp(hour.temperature.median));
        if (started)
            cr.lineTo(x(i), y);
        else
            cr.moveTo(x(i), y);
        started = true;
    });
    cr.stroke();

    const medians = hours.map((hour, i) => ({i, t: hour.temperature.median})).filter(point => point.t !== null);
    if (medians.length) {
        const warmest = medians.reduce((a, b) => b.t > a.t ? b : a);
        const coldest = medians.reduce((a, b) => b.t < a.t ? b : a);
        const alignAt = i => i < n * 0.1 ? 'left' : i > n * 0.9 ? 'right' : 'center';
        text(cr, x(warmest.i), yT(temp(warmest.t)) - 5, fmt.temperature(warmest.t),
            {align: alignAt(warmest.i), bold: true, color: withAlpha(fg, 0.9)});
        if (coldest.i !== warmest.i) {
            text(cr, x(coldest.i), yT(temp(coldest.t)) + 13, fmt.temperature(coldest.t),
                {align: alignAt(coldest.i), color: withAlpha(fg, 0.7)});
        }
    }

    if (now !== null && now >= hours[0].time && now <= hours.at(-1).time + 3600) {
        const step = n > 1 ? hours[1].time - hours[0].time : 3600;
        const xNow = left + (now - hours[0].time) / (step * Math.max(1, n - 1)) * w;
        verticalLine(cr, xNow, top - 4, top + h, withAlpha(fg, 0.55), [3, 3]);
    }
}

/** Colour of a temperature (°C) for the week bars: cold violet → blue → green → yellow → red. */
export function temperatureColor(celsius) {
    const stops = [[-10, [0.55, 0.45, 0.95]], [0, [0.36, 0.71, 0.96]], [10, [0.34, 0.83, 0.62]],
        [20, [0.97, 0.83, 0.18]], [30, [0.93, 0.20, 0.23]]];
    if (celsius <= stops[0][0])
        return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
        const [t1, c1] = stops[i];
        const [t0, c0] = stops[i - 1];
        if (celsius <= t1) {
            const k = (celsius - t0) / (t1 - t0);
            return c0.map((value, j) => value + (c1[j] - value) * k);
        }
    }
    return stops.at(-1)[1];
}

/**
 * The day's min–max bar on the scale of the whole week, with a colour gradient.
 *
 * @param {Cairo.Context} cr
 * @param {number} width
 * @param {number} height
 * @param {object} data temperatures in °C
 */
export function drawTemperatureBar(cr, width, height, {min, max, weekMin, weekMax, fg}) {
    const r = height / 2;
    setColor(cr, withAlpha(fg, 0.12));
    cr.arc(r, r, r, Math.PI / 2, 3 * Math.PI / 2);
    cr.arc(width - r, r, r, -Math.PI / 2, Math.PI / 2);
    cr.closePath();
    cr.fill();
    if (min === null || max === null || weekMax <= weekMin)
        return;
    const x = t => r + (width - 2 * r) * (t - weekMin) / (weekMax - weekMin);
    const x0 = x(min), x1 = Math.max(x(max), x0 + 0.5);
    const gradient = new Cairo.LinearGradient(x0, 0, x1, 0);
    gradient.addColorStopRGB(0, ...temperatureColor(min));
    gradient.addColorStopRGB(1, ...temperatureColor(max));
    cr.setSource(gradient);
    cr.arc(x0, r, r, Math.PI / 2, 3 * Math.PI / 2);
    cr.arc(x1, r, r, -Math.PI / 2, Math.PI / 2);
    cr.closePath();
    cr.fill();
}

function drawSeries(cr, points, {x, y, bottom, color}) {
    cr.moveTo(x(points[0].t), bottom);
    points.forEach(point => cr.lineTo(x(point.t), y(point.v)));
    cr.lineTo(x(points.at(-1).t), bottom);
    cr.closePath();
    setColor(cr, withAlpha(color, 0.18));
    cr.fill();

    setColor(cr, color);
    cr.setLineWidth(2);
    points.forEach((point, i) => (i ? cr.lineTo(x(point.t), y(point.v)) : cr.moveTo(x(point.t), y(point.v))));
    cr.stroke();
    const last = points.at(-1);
    cr.arc(x(last.t), y(last.v), 3, 0, 2 * Math.PI);
    cr.fill();
}

/**
 * Water level of the last 48 hours with dashed alert thresholds. The next threshold above
 * the highest value is kept in view, so it is clear how much is missing to it.
 *
 * @param {Cairo.Context} cr
 * @param {number} width
 * @param {number} height
 * @param {object} data
 * @param {Array<{t: number, v: number}>} data.points level in cm
 * @param {Array<number|null>|null} data.thresholds cm, `[yellow, orange, red]`
 * @param {number} data.now Unix seconds
 * @param {number|null} data.alertLevel 0–3
 * @param {number[]} data.fg
 * @param {(hours: number) => string} data.label axis label for "hours ago" (0 = now)
 */
export function drawLevelChart(cr, width, height, {points, thresholds, now, alertLevel, fg, label}) {
    if (!points?.length)
        return;
    const left = 4, right = 30, top = 6, bottom = 14;
    const w = width - left - right, h = height - top - bottom;
    const end = now, start = end - 48 * 3600;
    const values = points.map(point => point.v);
    let vMin = Math.min(...values), vMax = Math.max(...values);
    const next = (thresholds ?? []).find(value => value !== null && value > vMax);
    if (next !== undefined)
        vMax = Math.max(vMax, next);
    vMin = Math.max(0, vMin - 10);
    vMax += 10;
    const x = t => left + w * (t - start) / (end - start);
    const y = v => top + h * (1 - (v - vMin) / (vMax - vMin));

    for (const hoursAgo of [48, 36, 24, 12, 0]) {
        const xx = x(end - hoursAgo * 3600);
        verticalLine(cr, xx, top, top + h, withAlpha(fg, 0.10));
        text(cr, xx, height - 2, label(hoursAgo),
            {size: 9, align: hoursAgo === 48 ? 'left' : hoursAgo === 0 ? 'right' : 'center', color: withAlpha(fg, 0.62)});
    }
    horizontalThresholds(cr, thresholds ?? [], {left, right: left + w, y, min: vMin, max: vMax, fg});
    (thresholds ?? []).forEach((value, i) => {
        if (value !== null && value >= vMin && value <= vMax)
            text(cr, left + w + 3, y(value) + 3, String(value), {size: 9, color: COLORS.alert[i + 1] ?? fg});
    });

    const visible = points.filter(point => point.t >= start);
    if (visible.length)
        drawSeries(cr, visible, {x, y, bottom: top + h, color: COLORS.alert[alertLevel] ?? COLORS.water});
}

/**
 * Daily discharge (GloFAS) for recent days and the forecast: the ensemble range as a band,
 * the median as a line and a marker for today. Custom thresholds are drawn as dashed lines.
 *
 * @param {Cairo.Context} cr
 * @param {number} width
 * @param {number} height
 * @param {object} data
 * @param {import('./rivers/glofas.js').DischargeDay[]} data.days
 * @param {number} data.todayIndex
 * @param {Array<number|null>|null} data.thresholds m³/s, `[yellow, orange, red]`
 * @param {number[]} data.fg
 * @param {(time: number) => string} data.label day label
 */
export function drawDischargeChart(cr, width, height, {days, todayIndex, thresholds, fg, label}) {
    const valid = days.filter(day => (day.median ?? day.discharge) !== null);
    if (valid.length < 2)
        return;
    const left = 4, right = 34, top = 6, bottom = 14;
    const w = width - left - right, h = height - top - bottom;
    const valueOf = day => day.median ?? day.discharge;
    // Scale to the median line, not to extreme ensemble members ten days ahead: the band is
    // clipped at the top, which still shows that some members go higher.
    const typicalMax = Math.max(...valid.map(valueOf));
    const visibleThresholds = (thresholds ?? []).filter(value => value !== null && value <= typicalMax * 3);
    const vMax = Math.max(typicalMax * 1.8, ...visibleThresholds.map(value => value * 1.1));
    const vMin = 0;
    const x = i => left + w * i / (days.length - 1);
    const y = v => top + h * (1 - (v - vMin) / (vMax - vMin));

    days.forEach((day, i) => {
        if (i % 2 === 0 || i === todayIndex) {
            verticalLine(cr, x(i), top, top + h, withAlpha(fg, i === todayIndex ? 0.45 : 0.10), i === todayIndex ? [3, 3] : null);
            if (i % 4 === 0 || i === todayIndex) {
                const align = i === 0 ? 'left' : i === days.length - 1 ? 'right' : 'center';
                text(cr, x(i), height - 2, label(day.time), {size: 9, align, color: withAlpha(fg, 0.62)});
            }
        }
    });
    horizontalThresholds(cr, thresholds ?? [], {left, right: left + w, y, min: vMin, max: vMax, fg});

    const banded = days.map((day, i) => ({day, i})).filter(({day}) => day.min !== null && day.max !== null);
    if (banded.length > 1) {
        cr.save();
        cr.rectangle(left, top, w, h);
        cr.clip();
        setColor(cr, withAlpha(COLORS.water, 0.22));
        banded.forEach(({day, i}, k) => (k ? cr.lineTo(x(i), y(day.max)) : cr.moveTo(x(i), y(day.max))));
        [...banded].reverse().forEach(({day, i}) => cr.lineTo(x(i), y(day.min)));
        cr.closePath();
        cr.fill();
        cr.restore();
    }

    setColor(cr, COLORS.water);
    cr.setLineWidth(2);
    let started = false;
    days.forEach((day, i) => {
        const value = valueOf(day);
        if (value === null)
            return;
        if (started)
            cr.lineTo(x(i), y(value));
        else
            cr.moveTo(x(i), y(value));
        started = true;
    });
    cr.stroke();

    text(cr, left + w + 3, top + 9, `${Math.round(vMax)}`, {size: 9, color: withAlpha(fg, 0.62)});
    text(cr, left + w + 3, top + h, '0', {size: 9, color: withAlpha(fg, 0.62)});
}
