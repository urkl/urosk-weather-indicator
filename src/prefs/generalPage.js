// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * General page: top bar layout, units, refresh interval, transfer of the settings to another
 * computer and the data sources.
 */
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {_, fill, nativeLanguageName, ngettext} from '../lib/i18n.js';
import {SETTINGS_FILE_NAME, exportSettings, importSettings} from '../lib/settingsTransfer.js';
import {comboRow, spinRow, switchRow, toast} from './rows.js';

/** Data sources with their licences; Open-Meteo and Copernicus require attribution. */
const SOURCES = [
    ['Open-Meteo', () => _('Weather forecast and geocoding · CC BY 4.0'), 'https://open-meteo.com/'],
    ['GloFAS (Copernicus)', () => _('Modelled river discharge via the Open-Meteo Flood API'), 'https://global-flood.emergency.copernicus.eu/'],
    ['ARSO', () => _('Live river gauges and text forecast for Slovenia'), 'https://www.arso.gov.si/'],
    ['Meteocons', () => _('Weather icons by Bas Milius · MIT'), 'https://github.com/basmilius/weather-icons'],
];

export const GeneralPage = GObject.registerClass(
class GeneralPage extends Adw.PreferencesPage {
    /**
     * @param {import('gi://Gio').Settings} settings
     * @param {string[]} languages languages the extension can show
     * @param {object} [options]
     * @param {string|null} [options.extensionVersion] written into exported settings
     */
    _init(settings, languages = ['en'], {extensionVersion = null} = {}) {
        super._init({title: _('General'), icon_name: 'preferences-system-symbolic'});
        this._settings = settings;
        this._extensionVersion = extensionVersion;

        const language = new Adw.PreferencesGroup({title: _('Language')});
        language.add(comboRow(settings, 'language', _('Language of the extension'), [
            ['', _('Automatic (desktop language)')],
            ...languages.map(code => [code, nativeLanguageName(code)]),
        ], _('A chosen language also sets the names of days and months and the format of numbers; dates are always dd.mm.yyyy.')));
        this.add(language);

        const panel = new Adw.PreferencesGroup({title: _('Top bar')});
        panel.add(spinRow(settings, 'panel-days', _('Days'), {min: 0, max: 7, subtitle: _('0 shows only the current conditions')}));
        panel.add(comboRow(settings, 'panel-style', _('Day style'), [
            ['full', _('Weekday, icon, high and low')],
            ['compact', _('Compact: icon and high')],
        ]));
        panel.add(switchRow(settings, 'panel-show-current', _('Current temperature')));
        panel.add(switchRow(settings, 'panel-show-moon', _('Moon phase'), _('Icon of today’s moon phase')));
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

        const transfer = new Adw.PreferencesGroup({
            title: _('Transfer settings'),
            description: _('Copy the locations, units, rivers and all other settings to another computer: export them here, import the file there.'),
        });
        const exportRow = new Adw.ActionRow({title: _('Export to a file'), use_markup: false});
        exportRow.add_suffix(this._button(_('Export…'), () => this._export()));
        transfer.add(exportRow);
        const importRow = new Adw.ActionRow({title: _('Import from a file'), subtitle: _('Replaces the current settings'), use_markup: false});
        importRow.add_suffix(this._button(_('Import…'), () => this._chooseImport()));
        transfer.add(importRow);
        this.add(transfer);

        const sources = new Adw.PreferencesGroup({title: _('Data sources')});
        for (const [name, describe, uri] of SOURCES) {
            const row = new Adw.ActionRow({title: name, subtitle: describe(), use_markup: false});
            row.add_suffix(new Gtk.LinkButton({uri, label: _('Website'), valign: Gtk.Align.CENTER}));
            sources.add(row);
        }
        this.add(sources);
    }

    _button(label, onClicked) {
        const button = new Gtk.Button({label, valign: Gtk.Align.CENTER});
        button.connect('clicked', onClicked);
        return button;
    }

    _fileDialog(title) {
        const filter = new Gtk.FileFilter({name: _('Settings (JSON)')});
        filter.add_pattern('*.json');
        const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
        filters.append(filter);
        return new Gtk.FileDialog({title, modal: true, filters, default_filter: filter});
    }

    /** Reports a failed file dialog unless the user just closed it. */
    _failed(error) {
        if (error.matches?.(Gtk.DialogError, Gtk.DialogError.DISMISSED))
            return;
        toast(this, fill(_('Error: %s'), error.message));
    }

    _export() {
        const dialog = this._fileDialog(_('Export settings'));
        dialog.initial_name = SETTINGS_FILE_NAME;
        dialog.save(this.get_root(), null, (_dialog, result) => {
            try {
                const file = dialog.save_finish(result);
                const data = exportSettings(this._settings, {extensionVersion: this._extensionVersion});
                const bytes = new TextEncoder().encode(`${JSON.stringify(data, null, 2)}\n`);
                file.replace_contents(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                toast(this, fill(_('Settings exported to %s'), file.get_basename()));
            } catch (error) {
                this._failed(error);
            }
        });
    }

    _chooseImport() {
        this._fileDialog(_('Import settings')).open(this.get_root(), null, (dialog, result) => {
            let data;
            try {
                const [, contents] = dialog.open_finish(result).load_contents(null);
                data = JSON.parse(new TextDecoder().decode(contents));
            } catch (error) {
                this._failed(error);
                return;
            }
            this._confirmImport(data);
        });
    }

    _confirmImport(data) {
        const confirm = new Adw.AlertDialog({
            heading: _('Replace the settings?'),
            body: _('Locations, units, rivers and the other settings from the file replace the current ones.'),
        });
        confirm.add_response('cancel', _('Cancel'));
        confirm.add_response('import', _('Import'));
        confirm.set_response_appearance('import', Adw.ResponseAppearance.DESTRUCTIVE);
        confirm.connect('response', (_dialog, response) => {
            if (response !== 'import')
                return;
            // The window may rebuild its pages when the language changes: report first
            const root = this.get_root();
            try {
                const {applied} = importSettings(this._settings, data);
                root?.add_toast?.(new Adw.Toast({
                    title: fill(ngettext('%d setting imported', '%d settings imported', applied.length), applied.length),
                    timeout: 3,
                }));
            } catch (error) {
                root?.add_toast?.(new Adw.Toast({title: error.message, timeout: 5}));
            }
        });
        confirm.present(this.get_root());
    }
});
