// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Current conditions at the top of the menu: large icon and temperature, the location,
 * a description and a grid of details (humidity, wind, pressure, UV, sunrise …) with the
 * Moon below the sun: phase, moonrise, moonset and the next full and new moon.
 */
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {_, fill} from '../lib/i18n.js';
import {MoonPhase, phaseIcon, phaseName, riseSetText} from '../lib/moon.js';
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
            for (const [key, icon, caption] of row)
                this._cell(rowBox, key, icon, caption);
            grid.add_child(rowBox);
        }

        const moonRow = hbox('uwi-details-row');
        const phase = this._cell(moonRow, 'moonPhase', phaseIcon(MoonPhase.FULL), '');
        this._moonIcon = phase.icon;
        this._moonCaption = phase.caption;
        this._cell(moonRow, 'moonrise', 'moonrise.svg', _('moonrise'));
        this._cell(moonRow, 'moonset', 'moonset.svg', _('moonset'));
        grid.add_child(moonRow);
        this._moonNext = dimLabel('', 'uwi-details-caption uwi-moon-next', {x_align: Clutter.ActorAlign.CENTER});
        grid.add_child(this._moonNext);
        this.actor.add_child(grid);
    }

    /** Adds a detail cell (icon, value, caption) to `row` and returns its icon and caption. */
    _cell(row, key, icon, caption) {
        const cell = hbox('uwi-details-cell', {x_expand: true});
        const iconActor = this._icons.icon(icon, 28);
        cell.add_child(iconActor);
        const values = vbox('', {y_align: Clutter.ActorAlign.CENTER});
        this._details[key] = new St.Label({text: '–', style_class: 'uwi-details-value'});
        values.add_child(this._details[key]);
        const captionLabel = dimLabel(caption, 'uwi-details-caption');
        values.add_child(captionLabel);
        cell.add_child(values);
        row.add_child(cell);
        return {icon: iconActor, caption: captionLabel};
    }

    /**
     * @param {import('../lib/forecast.js').Forecast} forecast
     * @param {import('../lib/format.js').Formatter} fmt
     * @param {string} locationName
     * @param {object} moon the Moon now, see `moonNow()`
     */
    update(forecast, fmt, locationName, moon) {
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
        this._updateMoon(today?.moon ?? null, moon, fmt);
    }

    /**
     * @param {object|null} day the Moon on the local day, see `moonDays()`
     * @param {object} now the Moon now, see `moonNow()`
     * @param {import('../lib/format.js').Formatter} fmt
     */
    _updateMoon(day, now, fmt) {
        const details = this._details;
        if (day) {
            this._moonIcon.gicon = this._icons.gicon(phaseIcon(day.phase));
            details.moonPhase.text = phaseName(day.phase);
            const {rise, set} = riseSetText(day, fmt);
            details.moonrise.text = rise;
            details.moonset.text = set;
        }
        this._moonCaption.text = fill(_('%s lit · age %s d'), fmt.percent(now.illumination * 100), fmt.number(now.age, 1));
        this._moonNext.text = fill(_('Next full moon %s · new moon %s'), fmt.dateTime(now.nextFull), fmt.dateTime(now.nextNew));
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
