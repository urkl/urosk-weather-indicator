// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Layout of the popup menu: location switcher on top, current conditions, the week and the
 * rivers on the left, details of the selected day and the ARSO text forecast on the right,
 * status, attribution and actions at the bottom.
 */
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {_, fill} from '../lib/i18n.js';
import {CurrentView} from './currentView.js';
import {DayView} from './dayView.js';
import {RiversView} from './riversView.js';
import {WeekView} from './weekView.js';
import {hbox, vbox, wrap} from './widgets.js';

export class MenuView {
    /**
     * @param {import('resource:///org/gnome/shell/ui/popupMenu.js').PopupMenu} menu
     * @param {import('./widgets.js').IconCache} icons
     * @param {object} actions
     * @param {(index: number) => void} actions.selectLocation
     * @param {() => void} actions.refresh
     * @param {() => void} actions.openPreferences
     * @param {(uri: string) => void} actions.openUri
     */
    constructor(menu, icons, actions) {
        this._actions = actions;
        this._selectedDay = 0;

        this._locations = hbox('uwi-locations');
        menu.box.add_child(this._locations);

        const columns = hbox('uwi-columns');
        menu.box.add_child(columns);

        const left = vbox('uwi-column-left');
        columns.add_child(left);
        this.current = new CurrentView(icons);
        left.add_child(this.current.actor);
        this._weekHeading = new St.Label({style_class: 'uwi-heading'});
        left.add_child(this._weekHeading);
        this.week = new WeekView(icons, index => this.selectDay(index));
        left.add_child(this.week.actor);
        this.rivers = new RiversView(actions.openUri);
        left.add_child(this.rivers.actor);

        const right = vbox('uwi-column-right');
        columns.add_child(right);
        this.day = new DayView(icons);
        right.add_child(this.day.actor);
        this._arsoHeading = new St.Label({style_class: 'uwi-heading'});
        right.add_child(this._arsoHeading);
        this._arsoText = vbox('uwi-arso-text');
        right.add_child(this._arsoText);

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._status = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._status.label.opacity = 150;
        wrap(this._status.label);
        menu.addMenuItem(this._status);
        menu.addAction(_('Refresh'), actions.refresh);
        menu.addAction(_('Settings'), actions.openPreferences);

        this._forecast = null;
        this.showRivers(false);
        this.showArsoText(null);
    }

    /**
     * Location buttons; hidden when there is only one location.
     *
     * @param {import('../lib/locations.js').Location[]} locations
     * @param {number} active
     */
    setLocations(locations, active) {
        this._locations.destroy_all_children();
        this._locations.visible = locations.length > 1;
        locations.forEach((location, i) => {
            const button = new St.Button({
                label: location.name,
                style_class: 'uwi-location-button',
                can_focus: true,
                toggle_mode: false,
            });
            if (i === active)
                button.add_style_pseudo_class('checked');
            button.connect('clicked', () => this._actions.selectLocation(i));
            this._locations.add_child(button);
        });
    }

    /**
     * @param {import('../lib/forecast.js').Forecast} forecast
     * @param {import('../lib/format.js').Formatter} fmt
     * @param {string} locationName
     */
    showForecast(forecast, fmt, locationName) {
        this._forecast = forecast;
        this._fmt = fmt;
        this._setForecastVisible(true);
        this.current.update(forecast, fmt, locationName);
        this._weekHeading.text = fill(_('%d DAYS  ·  median of models'), forecast.days.length);
        this.week.update(forecast, fmt);
        this.selectDay(Math.min(this._selectedDay, forecast.days.length - 1));
    }

    /** Shows a message while there is no forecast for the active location. */
    showMessage(locationName, message) {
        this._forecast = null;
        // Hide the week and day of the previous location while the new one loads
        this._setForecastVisible(false);
        this.current.showMessage(locationName, message);
    }

    _setForecastVisible(visible) {
        this._weekHeading.visible = visible;
        this.week.actor.visible = visible;
        this.day.actor.visible = visible;
    }

    selectDay(index) {
        this._selectedDay = Math.max(0, index);
        if (!this._forecast)
            return;
        this.week.select(this._selectedDay);
        this.day.update(this._forecast, this._selectedDay, this._fmt, Math.floor(Date.now() / 1000));
    }

    /** Called when the menu opens: start from today again. */
    resetDay() {
        this.selectDay(0);
    }

    showRivers(visible) {
        this.rivers.actor.visible = visible;
    }

    /** @param {import('../lib/arsoText.js').TextForecast|null} forecast */
    showArsoText(forecast) {
        this._arsoText.destroy_all_children();
        const sections = forecast?.sections ?? [];
        this._arsoHeading.visible = this._arsoText.visible = sections.length > 0;
        if (!sections.length)
            return;
        this._arsoHeading.text = fill(_('ARSO FORECAST  ·  %s'), forecast.issued);
        for (const section of sections) {
            const text = wrap(new St.Label({style_class: 'uwi-arso-paragraph'}));
            text.clutter_text.set_markup(`<b>${GLib.markup_escape_text(_(section.title), -1)}:</b> ${
                GLib.markup_escape_text(section.text, -1)}`);
            this._arsoText.add_child(text);
        }
    }

    /** Status line: data source and time of the last update, or the error. */
    setStatus(text) {
        this._status.label.text = text;
    }
}
