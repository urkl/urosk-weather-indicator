// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Content of the indicator in the top bar: an optional river reading, the current
 * temperature and the coming days (icon, weekday, high and low).
 */
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {_} from '../lib/i18n.js';
import {phaseIcon} from '../lib/moon.js';
import {iconFileName} from '../lib/weatherCodes.js';
import {ALERT_CLASSES} from '../lib/rivers/gauges.js';
import {hbox, label, vbox} from './widgets.js';

export class PanelView {
    /**
     * @param {St.BoxLayout} container box inside the panel button
     * @param {import('./widgets.js').IconCache} icons
     */
    constructor(container, icons) {
        this._box = hbox('uwi-panel');
        container.add_child(this._box);
        this._icons = icons;
        this.showMessage('…');
    }

    /** Shows a short text instead of the forecast (loading, error, no location). */
    showMessage(text, river = null) {
        this._box.destroy_all_children();
        if (river)
            this._box.add_child(this._river(river));
        this._box.add_child(label(text, 'uwi-panel-current-temp'));
    }

    /**
     * @param {object} state
     * @param {import('../lib/forecast.js').Forecast} state.forecast
     * @param {import('../lib/format.js').Formatter} state.fmt
     * @param {number} state.days how many days to show
     * @param {boolean} state.compact
     * @param {boolean} state.showCurrent
     * @param {string|null} state.moonPhase phase of today to show, or `null`
     * @param {boolean} state.stale true when the last refresh failed
     * @param {object|null} state.river summary of the first river gauge
     */
    update({forecast, fmt, days, compact, showCurrent, moonPhase = null, stale, river}) {
        this._box.destroy_all_children();
        if (river)
            this._box.add_child(this._river(river));
        if (moonPhase)
            this._box.add_child(this._icons.icon(phaseIcon(moonPhase), 20, 'uwi-icon uwi-panel-moon'));

        if (showCurrent) {
            const current = hbox('uwi-panel-current');
            current.add_child(this._icons.icon(iconFileName(forecast.current.code, forecast.current.isDay), 24));
            current.add_child(label(fmt.temperature(forecast.current.temperature), 'uwi-panel-current-temp'));
            this._box.add_child(current);
        }

        forecast.days.slice(0, days).forEach((day, i) => {
            const cell = hbox(i === 0 ? 'uwi-panel-day uwi-panel-today' : 'uwi-panel-day');
            cell.add_child(this._icons.icon(iconFileName(day.code, true), compact ? 22 : 24));
            const texts = vbox('uwi-panel-day-text', {y_align: Clutter.ActorAlign.CENTER});
            if (!compact)
                texts.add_child(new St.Label({text: i === 0 ? _('today') : fmt.weekday(day.time), style_class: 'uwi-panel-weekday'}));
            const temperatures = new St.Label({style_class: 'uwi-panel-temp'});
            const high = `<b>${fmt.temperature(day.maxTemperature.median)}</b>`;
            temperatures.clutter_text.set_markup(compact
                ? high
                : `${high} <span alpha="62%">${fmt.temperature(day.minTemperature.median)}</span>`);
            texts.add_child(temperatures);
            cell.add_child(texts);
            this._box.add_child(cell);
        });
        this._box.opacity = stale ? 140 : 255;
    }

    /** River reading: drop icon, value and trend, tinted by the alert level. */
    _river({text, alertLevel, stale}) {
        const level = alertLevel ?? 0;
        const box = hbox(`uwi-panel-river uwi-alert-${ALERT_CLASSES[level] ?? 'normal'}`, {y_align: Clutter.ActorAlign.CENTER});
        box.add_child(this._icons.icon('raindrop.svg', 16));
        box.add_child(label(text, 'uwi-panel-river-value'));
        if (stale)
            box.opacity = 120;
        return box;
    }
}
