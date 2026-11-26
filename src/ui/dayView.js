// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Details of the selected day: summary, hourly chart, a strip of every second hour, a
 * warning when the models disagree and the forecast of each model.
 */
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {_, fill} from '../lib/i18n.js';
import {phaseName} from '../lib/moon.js';
import {describeCode, iconFileName} from '../lib/weatherCodes.js';
import {drawHourlyChart} from '../lib/charts.js';
import {ChartArea, dimLabel, hbox, vbox, wrap} from './widgets.js';

export class DayView {
    /** @param {import('./widgets.js').IconCache} icons */
    constructor(icons) {
        this._icons = icons;
        this.actor = vbox('uwi-day-details');

        this._title = new St.Label({style_class: 'uwi-heading uwi-heading-day'});
        this.actor.add_child(this._title);
        this._summary = wrap(new St.Label({style_class: 'uwi-day-summary'}));
        this.actor.add_child(this._summary);

        this._chart = new ChartArea({style_class: 'uwi-hourly-chart'},
            (cr, width, height, data) => drawHourlyChart(cr, width, height, data));
        this.actor.add_child(this._chart);
        this._legend = wrap(dimLabel('', 'uwi-legend'));
        this.actor.add_child(this._legend);

        this._hours = hbox('uwi-hours');
        this.actor.add_child(this._hours);
        this._divergence = wrap(new St.Label({style_class: 'uwi-divergence'}));
        this.actor.add_child(this._divergence);
        this._models = vbox('uwi-models');
        this.actor.add_child(this._models);
    }

    /**
     * @param {import('../lib/forecast.js').Forecast} forecast
     * @param {number} index selected day
     * @param {import('../lib/format.js').Formatter} fmt
     * @param {number} now Unix seconds
     */
    update(forecast, index, fmt, now) {
        const day = forecast.days[index];
        if (!day)
            return;

        const dayName = index === 0 ? _('Today') : fmt.weekday(day.time, {long: true});
        this._title.text = `${dayName.toLocaleUpperCase()}  ·  ${fmt.date(day.time)}`;
        this._summary.text = this._summaryText(day, fmt);

        this._chart.setData({hours: day.hours, now, fmt});
        this._legend.text = fill(_('— temperature (median, red above freezing, blue below; band = model range)   ▮ precipitation %s/h (light = wettest model)'),
            fmt.precipitationSymbol);

        this._hours.destroy_all_children();
        day.hours.filter(hour => fmt.hourOfDay(hour.time) % 2 === 0).forEach(hour => {
            const past = hour.time + 3600 < now;
            const column = vbox('uwi-hour', {x_expand: true, opacity: past ? 110 : 255});
            const center = {x_align: Clutter.ActorAlign.CENTER};
            column.add_child(new St.Label({text: fmt.hour(hour.time), style_class: 'uwi-hour-time', ...center}));
            const icon = this._icons.icon(iconFileName(hour.code, hour.isDay), 28);
            icon.x_align = Clutter.ActorAlign.CENTER;
            column.add_child(icon);
            column.add_child(new St.Label({text: fmt.temperature(hour.temperature.median), style_class: 'uwi-hour-temp', ...center}));
            const amount = hour.precipitation.median ?? 0;
            column.add_child(new St.Label({text: amount >= 0.1 ? fmt.precipitationShort(amount) : ' ', style_class: 'uwi-hour-amount', ...center}));
            this._hours.add_child(column);
        });

        const warnings = [];
        if (day.divergence.precipitation)
            warnings.push(fill(_('precipitation %s–%s'), fmt.precipitationShort(day.precipitation.min), fmt.precipitation(day.precipitation.max)));
        if (day.divergence.temperature) {
            warnings.push(fill(_('temperature %s…%s / %s…%s'),
                fmt.temperature(day.minTemperature.min), fmt.temperature(day.minTemperature.max),
                fmt.temperature(day.maxTemperature.min), fmt.temperature(day.maxTemperature.max)));
        }
        this._divergence.text = warnings.length
            ? `⚠ ${fill(_('Models disagree: %s — the forecast is uncertain.'), warnings.join(', '))}`
            : '';
        this._divergence.visible = warnings.length > 0;

        this._updateModels(day, forecast, fmt);
    }

    _summaryText(day, fmt) {
        const parts = [
            describeCode(day.code),
            `${fmt.temperature(day.maxTemperature.median)} / ${fmt.temperature(day.minTemperature.median)}`,
        ];
        const probability = day.precipitationProbability.median;
        parts.push(probability === null
            ? fill(_('precipitation %s'), fmt.precipitation(day.precipitation.median))
            : fill(_('precipitation %s (%s)'), fmt.precipitation(day.precipitation.median), fmt.percent(probability)));
        if (day.windGusts.median !== null)
            parts.push(fill(_('wind up to %s, gusts %s'), fmt.windSpeed(day.windSpeed.median), fmt.windSpeed(day.windGusts.median)));
        if (day.uvIndex.median !== null)
            parts.push(fill(_('UV %s'), fmt.number(day.uvIndex.median)));
        if (day.sunrise && day.sunset)
            parts.push(fill(_('sun %s–%s'), fmt.time(day.sunrise), fmt.time(day.sunset)));
        if (day.moon) {
            const moon = day.moon;
            parts.push(`${phaseName(moon.phase).toLocaleLowerCase()} ${fmt.percent(moon.illumination * 100)}`);
            if (moon.alwaysUp)
                parts.push(_('moon up all day'));
            else if (moon.alwaysDown)
                parts.push(_('moon down all day'));
            else
                parts.push(fill(_('moonrise %s, moonset %s'), fmt.time(moon.rise), fmt.time(moon.set)));
        }
        return parts.join('  ·  ');
    }

    _updateModels(day, forecast, fmt) {
        this._models.destroy_all_children();
        const header = hbox('uwi-model uwi-model-header', {opacity: 140});
        for (const [text, styleClass] of [[_('model'), 'uwi-model-name'], ['', 'uwi-model-icon'],
            [_('high / low'), 'uwi-model-temp'], [_('precipitation'), 'uwi-model-amount']])
            header.add_child(new St.Label({text, style_class: styleClass}));
        this._models.add_child(header);

        for (const model of day.models) {
            const row = hbox('uwi-model');
            row.add_child(new St.Label({text: model.name, style_class: 'uwi-model-name'}));
            row.add_child(this._icons.icon(iconFileName(model.code, true), 20, 'uwi-icon uwi-model-icon'));
            row.add_child(new St.Label({
                text: `${fmt.temperature(model.maxTemperature)} / ${fmt.temperature(model.minTemperature)}`,
                style_class: 'uwi-model-temp',
            }));
            row.add_child(new St.Label({text: fmt.precipitation(model.precipitation), style_class: 'uwi-model-amount'}));
            row.add_child(dimLabel(_(model.info), 'uwi-model-info'));
            this._models.add_child(row);
        }
        if (day.models.length < forecast.modelsWithData.length)
            this._models.add_child(dimLabel(_('The other models do not reach this day (shorter range).'), 'uwi-small'));
    }
}
