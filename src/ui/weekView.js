// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * The 7-day list: one clickable row per day with weekday, icon, precipitation, low, a
 * temperature bar on the scale of the week and the high. Values where the models disagree
 * are highlighted.
 */
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {_} from '../lib/i18n.js';
import {capitalize} from '../lib/format.js';
import {describeCode, iconFileName} from '../lib/weatherCodes.js';
import {drawTemperatureBar} from '../lib/charts.js';
import {ChartArea, dimLabel, hbox, label, vbox} from './widgets.js';

export class WeekView {
    /**
     * @param {import('./widgets.js').IconCache} icons
     * @param {(index: number) => void} onSelect
     */
    constructor(icons, onSelect) {
        this._icons = icons;
        this._onSelect = onSelect;
        this._buttons = [];
        this.actor = vbox('uwi-week');
    }

    /**
     * @param {import('../lib/forecast.js').Forecast} forecast
     * @param {import('../lib/format.js').Formatter} fmt
     */
    update(forecast, fmt) {
        this.actor.destroy_all_children();
        const days = forecast.days;
        const weekMin = Math.min(...days.map(day => day.minTemperature.median ?? Infinity));
        const weekMax = Math.max(...days.map(day => day.maxTemperature.median ?? -Infinity));

        this._buttons = days.map((day, i) => {
            const button = new St.Button({style_class: 'uwi-day', can_focus: true, x_expand: true, reactive: true});
            const row = hbox('uwi-day-row', {x_expand: true});

            const names = vbox('uwi-day-name');
            names.add_child(new St.Label({
                text: i === 0 ? _('Today') : capitalize(fmt.weekday(day.time, {long: true})),
                style_class: 'uwi-day-weekday',
            }));
            names.add_child(dimLabel(`${fmt.shortDate(day.time)}  ${describeCode(day.code)}`, 'uwi-small'));
            row.add_child(names);
            row.add_child(this._icons.icon(iconFileName(day.code, true), 40));

            const rain = vbox('uwi-day-precipitation', {y_align: Clutter.ActorAlign.CENTER});
            const amount = day.precipitation.median ?? 0;
            const showAmount = amount >= 0.1 || (day.precipitation.max ?? 0) >= 1;
            const diverges = day.divergence.precipitation;
            rain.add_child(new St.Label({
                text: showAmount ? `${fmt.precipitation(amount)}${diverges ? ' ⚠' : ''}` : '',
                style_class: diverges ? 'uwi-day-amount uwi-warning' : 'uwi-day-amount',
            }));
            const probability = day.precipitationProbability.median;
            rain.add_child(new St.Label({
                text: probability !== null && probability >= 10 ? fmt.percent(probability) : '',
                style_class: 'uwi-day-probability',
            }));
            row.add_child(rain);

            const uncertain = day.divergence.temperature ? ' uwi-warning' : '';
            row.add_child(label(fmt.temperature(day.minTemperature.median), `uwi-day-low${uncertain}`));
            const bar = new ChartArea({style_class: 'uwi-temperature-bar', y_align: Clutter.ActorAlign.CENTER},
                (cr, width, height, data) => drawTemperatureBar(cr, width, height, data));
            bar.setData({min: day.minTemperature.median, max: day.maxTemperature.median, weekMin, weekMax});
            row.add_child(bar);
            row.add_child(label(fmt.temperature(day.maxTemperature.median), `uwi-day-high${uncertain}`));

            button.set_child(row);
            button.connect('clicked', () => this._onSelect(i));
            this.actor.add_child(button);
            return button;
        });
    }

    /** Marks the selected day. */
    select(index) {
        this._buttons.forEach((button, i) => {
            if (i === index)
                button.add_style_pseudo_class('checked');
            else
                button.remove_style_pseudo_class('checked');
        });
    }
}
