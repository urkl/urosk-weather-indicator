// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Urosk Weather Indicator — multi-model weather forecast in the GNOME top bar.
 */
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {setLanguage} from './lib/i18n.js';
import {WeatherIndicator} from './ui/indicator.js';

export default class UroskWeatherIndicatorExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._applyLanguage();
        this._settings.connectObject(
            'changed::panel-position', () => this._addIndicator(),
            'changed::language', () => {
                this._applyLanguage();
                this._addIndicator();
            },
            this);
        this._addIndicator();
    }

    disable() {
        this._settings?.disconnectObject(this);
        this._settings = null;
        this._indicator?.destroy();
        this._indicator = null;
        setLanguage(null);
    }

    _applyLanguage() {
        setLanguage(this._settings.get_string('language'), `${this.path}/locale`);
    }

    /** (Re)creates the indicator, e.g. after the panel position was changed. */
    _addIndicator() {
        this._indicator?.destroy();
        this._indicator = new WeatherIndicator(this);
        const position = this._settings.get_string('panel-position');
        Main.panel.addToStatusArea(this.uuid, this._indicator, position === 'right' ? 0 : -1, position);
    }
}
