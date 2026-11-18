// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Current conditions at the top of the menu: large icon and temperature, the location,
 * a description and a grid of details (humidity, wind, pressure, UV, sunrise …).
 */
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {_, fill} from '../lib/i18n.js';
import {describeCode, iconFileName} from '../lib/weatherCodes.js';
import {dimLabel, hbox, vbox} from './widgets.js';

export class CurrentView {
    /** @param {import('./widgets.js').IconCache} icons */
    constructor(icons) {
        this._icons = icons;
        this.actor = vbox('uwi-current-section');

        const header = hbox('uwi-current');
        this._icon = icons.icon('not-available.svg', 84, 'uwi-current-icon');
        header.add_child(this._icon);
        this._temperature = new St.Label({text: '…', style_class: 'uwi-current-temp', y_align: Clutter.ActorAlign.CENTER});
        header.add_child(this._temperature);
        const texts = vbox('uwi-current-texts', {y_align: Clutter.ActorAlign.CENTER, x_expand: true});
        this._location = new St.Label({style_class: 'uwi-location'});
        this._description = new St.Label({style_class: 'uwi-current-description'});
        this._feelsLike = dimLabel('');
        texts.add_child(this._location);
        texts.add_child(this._description);
        texts.add_child(this._feelsLike);
        header.add_child(texts);
        this.actor.add_child(header);

        // [key, icon, caption]
        const fields = [
            [['humidity', 'humidity.svg', _('humidity')], ['wind', 'wind.svg', _('wind')],
                ['gusts', 'wind.svg', _('gusts')], ['pressure', 'barometer.svg', _('pressure')]],
            [['precipitation', 'raindrop.svg', _('precipitation')], ['uv', 'uv-index.svg', _('UV today')],
                ['sunrise', 'sunrise.svg', _('sunrise')], ['sunset', 'sunset.svg', _('sunset')]],
        ];
        this._details = {};
        const grid = vbox('uwi-details');
        for (const row of fields) {
            const rowBox = hbox('uwi-details-row');
            for (const [key, icon, caption] of row) {
                const cell = hbox('uwi-details-cell', {x_expand: true});
                cell.add_child(icons.icon(icon, 28));
                const values = vbox('', {y_align: Clutter.ActorAlign.CENTER});
                this._details[key] = new St.Label({text: '–', style_class: 'uwi-details-value'});
                values.add_child(this._details[key]);
                values.add_child(dimLabel(caption, 'uwi-details-caption'));
                cell.add_child(values);
                rowBox.add_child(cell);
            }
            grid.add_child(rowBox);
        }
        this.actor.add_child(grid);
    }

    /**
     * @param {import('../lib/forecast.js').Forecast} forecast
     * @param {import('../lib/format.js').Formatter} fmt
     * @param {string} locationName
     */
    update(forecast, fmt, locationName) {
        const current = forecast.current;
        const today = forecast.days[0];
        this._icon.gicon = this._icons.gicon(iconFileName(current.code, current.isDay));
        this._temperature.text = fmt.temperature(current.temperature);
        this._location.text = locationName;
        this._description.text = describeCode(current.code);
        const feelsLike = fill(_('feels like %s'), fmt.temperature(current.apparentTemperature));
        this._feelsLike.text = today
            ? `${feelsLike}  ·  ${fmt.temperature(today.maxTemperature.median)} / ${fmt.temperature(today.minTemperature.median)}`
            : feelsLike;

        const details = this._details;
        details.humidity.text = fmt.percent(current.humidity);
        details.wind.text = current.windSpeed === null
            ? '–'
            : `${fmt.windSpeed(current.windSpeed)} ${fmt.compass(current.windDirection)}`.trim();
        details.gusts.text = fmt.windSpeed(current.windGusts);
        details.pressure.text = fmt.pressure(current.pressure);
        details.precipitation.text = fmt.precipitation(current.precipitation);
        details.uv.text = fmt.number(today?.uvIndex.median ?? null);
        details.sunrise.text = fmt.time(today?.sunrise ?? null);
        details.sunset.text = fmt.time(today?.sunset ?? null);
    }

    /** Shows a message instead of the conditions (e.g. while loading). */
    showMessage(locationName, message) {
        this._icon.gicon = this._icons.gicon('not-available.svg');
        this._temperature.text = '…';
        this._location.text = locationName;
        this._description.text = message;
        this._feelsLike.text = '';
    }
}
