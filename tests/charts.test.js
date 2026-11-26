// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import {assert, test} from './harness.js';
import {COLORS, drawHourlyChart} from '../src/lib/charts.js';
import {Formatter} from '../src/lib/format.js';

const WIDTH = 470, HEIGHT = 130;
const MIDNIGHT = Date.UTC(2026, 10, 26) / 1000;

/** Records what is stroked and filled, with the colour, dash and clip rectangle at the time. */
class RecordingContext {
    constructor() {
        this.strokes = [];
        this.fills = [];
        this.texts = [];
        this._path = [];
        this._color = null;
        this._dash = [];
        this._lineWidth = 1;
        this._clip = null;
        this._saved = [];
    }

    setSourceRGB(...color) {
        this._color = color;
    }

    setSourceRGBA(...color) {
        this._color = color;
    }

    setSource() {
        this._color = 'pattern';
    }

    setLineWidth(width) {
        this._lineWidth = width;
    }

    setDash(dash) {
        this._dash = dash;
    }

    moveTo(x, y) {
        this._path.push([x, y]);
    }

    lineTo(x, y) {
        this._path.push([x, y]);
    }

    rectangle(x, y, width, height) {
        this._path.push({rectangle: [x, y, width, height]});
    }

    clip() {
        this._clip = this._path.at(-1).rectangle;
        this._path = [];
    }

    save() {
        this._saved.push({color: this._color, dash: this._dash, lineWidth: this._lineWidth, clip: this._clip});
    }

    restore() {
        ({color: this._color, dash: this._dash, lineWidth: this._lineWidth, clip: this._clip} = this._saved.pop());
    }

    _paint(list) {
        list.push({color: this._color, dash: this._dash, lineWidth: this._lineWidth, clip: this._clip, points: this._path});
        this._path = [];
    }

    stroke() {
        this._paint(this.strokes);
    }

    fill() {
        this._paint(this.fills);
    }

    closePath() {}
    arc() {}
    selectFontFace() {}
    setFontSize() {}

    showText(value) {
        this.texts.push(value);
    }

    textExtents() {
        return {xAdvance: 12};
    }
}

/** Hours of a day with these median temperatures (°C), the models one degree around them. */
function day(medians) {
    return medians.map((median, i) => ({
        time: MIDNIGHT + i * 3 * 3600,
        temperature: {min: median - 1, median, max: median + 1},
        precipitation: {median: 0, max: 0},
    }));
}

function draw(medians, units = {}) {
    const cr = new RecordingContext();
    drawHourlyChart(cr, WIDTH, HEIGHT, {hours: day(medians), now: null, fmt: new Formatter({units}), fg: [1, 1, 1]});
    const zeroLines = cr.strokes.filter(stroke => stroke.dash.length && stroke.points.every(([, y]) => y === stroke.points[0][1]));
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const curve = color => cr.strokes.filter(stroke => stroke.lineWidth === 2 && same(stroke.color, color));
    const band = color => cr.fills.filter(fill => same(fill.color, color));
    return {zeroLines, curve, band, texts: cr.texts};
}

for (const [name, units] of [['°C', {}], ['°F', {temperature: 'fahrenheit'}]]) {
    test(`the temperature is red above 0 °C, blue below, split at the dashed 0 °C line (${name})`, () => {
        const medians = [3, 2, 0, -2, -3, -1, 1, 2];
        const {zeroLines, curve, band} = draw(medians, units);
        assert.equal(zeroLines.length, 1, 'one 0 °C line');
        const yLine = zeroLines[0].points[0][1];

        const [warm] = curve(COLORS.warm), [cold] = curve(COLORS.cold);
        assert.ok(warm && cold, 'the curve is drawn in both colours');
        assert.deepEqual(warm.points, cold.points, 'the same curve, clipped twice');
        const split = warm.clip[3];
        assert.deepEqual(warm.clip, [0, 0, WIDTH, split]);
        assert.deepEqual(cold.clip, [0, split, WIDTH, HEIGHT - split]);
        assert.close(yLine, split, 0.5, 'colours change at the line');
        assert.close(warm.points[2][1], split, 1e-9, 'the hour at 0 °C is on the line');
        assert.ok(warm.points[0][1] < split && warm.points[4][1] > split, 'warm hours above, cold below');

        assert.equal(band(COLORS.warmBand).length, 1);
        assert.deepEqual(band(COLORS.coldBand).map(fill => fill.clip), [cold.clip], 'the model band is split too');
    });
}

test('a day above freezing is red without a 0 °C line', () => {
    const {zeroLines, curve, band} = draw([4, 6, 9, 11, 10, 7]);
    assert.equal(zeroLines.length, 0);
    assert.equal(curve(COLORS.warm).length, 1);
    assert.equal(curve(COLORS.cold).length, 0);
    assert.equal(band(COLORS.coldBand).length, 0);
});

test('a day below freezing is blue without a 0 °C line', () => {
    const {zeroLines, curve, band, texts} = draw([-9, -7, -4, -3, -5, -8]);
    assert.equal(zeroLines.length, 0);
    assert.equal(curve(COLORS.warm).length, 0);
    assert.equal(curve(COLORS.cold).length, 1);
    assert.equal(band(COLORS.warmBand).length, 0);
    assert.ok(texts.includes('-9°') && texts.includes('-3°'), `extremes with a minus Cairo can draw: ${texts}`);
});
