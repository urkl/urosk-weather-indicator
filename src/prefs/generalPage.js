// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * General page: top bar layout, units, refresh interval and the data sources.
 */
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {_} from '../lib/i18n.js';
import {comboRow, spinRow, switchRow} from './rows.js';

/** Data sources with their licences; Open-Meteo and Copernicus require attribution. */
const SOURCES = [
    ['Open-Meteo', () => _('Weather forecast and geocoding · CC BY 4.0'), 'https://open-meteo.com/'],
    ['GloFAS (Copernicus)', () => _('Modelled river discharge via the Open-Meteo Flood API'), 'https://global-flood.emergency.copernicus.eu/'],
    ['ARSO', () => _('Live river gauges and text forecast for Slovenia'), 'https://www.arso.gov.si/'],
    ['Meteocons', () => _('Weather icons by Bas Milius · MIT'), 'https://github.com/basmilius/weather-icons'],
];

export const GeneralPage = GObject.registerClass(
class GeneralPage extends Adw.PreferencesPage {
    /** @param {import('gi://Gio').Settings} settings */
    _init(settings) {
        super._init({title: _('General'), icon_name: 'preferences-system-symbolic'});

        const panel = new Adw.PreferencesGroup({title: _('Top bar')});
        panel.add(spinRow(settings, 'panel-days', _('Days'), {min: 0, max: 7, subtitle: _('0 shows only the current conditions')}));
        panel.add(comboRow(settings, 'panel-style', _('Day style'), [
            ['full', _('Weekday, icon, high and low')],
            ['compact', _('Compact: icon and high')],
        ]));
        panel.add(switchRow(settings, 'panel-show-current', _('Current temperature')));
        panel.add(comboRow(settings, 'panel-position', _('Position'), [
            ['left', _('Left')],
            ['center', _('Center')],
            ['right', _('Right')],
        ]));
        this.add(panel);

        const units = new Adw.PreferencesGroup({title: _('Units')});
        units.add(comboRow(settings, 'temperature-unit', _('Temperature'), [
            ['celsius', _('Celsius (°C)')],
            ['fahrenheit', _('Fahrenheit (°F)')],
        ]));
        units.add(comboRow(settings, 'wind-speed-unit', _('Wind speed'), [
            ['kmh', 'km/h'],
            ['ms', 'm/s'],
            ['mph', 'mph'],
            ['kn', _('knots')],
        ]));
        units.add(comboRow(settings, 'precipitation-unit', _('Precipitation'), [
            ['mm', _('millimetres')],
            ['inch', _('inches')],
        ]));
        units.add(comboRow(settings, 'pressure-unit', _('Pressure'), [
            ['hpa', 'hPa'],
            ['inhg', 'inHg'],
            ['mmhg', 'mmHg'],
        ]));
        this.add(units);

        const forecast = new Adw.PreferencesGroup({
            title: _('Forecast'),
            description: _('Six models from Open-Meteo in one request, no API key needed.'),
        });
        forecast.add(spinRow(settings, 'refresh-interval', _('Refresh interval'), {min: 10, max: 180, step: 5, subtitle: _('minutes')}));
        forecast.add(switchRow(settings, 'show-arso-text', _('ARSO text forecast'),
            _('National forecast for Slovenia by the Slovenian Environment Agency (in Slovenian)')));
        this.add(forecast);

        const sources = new Adw.PreferencesGroup({title: _('Data sources')});
        for (const [name, describe, uri] of SOURCES) {
            const row = new Adw.ActionRow({title: name, subtitle: describe(), use_markup: false});
            row.add_suffix(new Gtk.LinkButton({uri, label: _('Website'), valign: Gtk.Align.CENTER}));
            sources.add(row);
        }
        this.add(sources);
    }
});
