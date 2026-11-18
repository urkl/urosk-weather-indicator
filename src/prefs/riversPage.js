// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Rivers page: switch the river section on, manage saved gauges (with optional custom alert
 * thresholds) and add live ARSO gauges in Slovenia or modelled GloFAS points anywhere.
 */
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {_, fill} from '../lib/i18n.js';
import {moveItem} from '../lib/records.js';
import {ARSO_GAUGES_URL, parseArsoGauges, searchArsoGauges} from '../lib/rivers/arso.js';
import {GAUGES_KEY, GaugeSource, addGauge, readGauges, writeGauges} from '../lib/rivers/gauges.js';
import {coordinatesText, placeSearch} from './locationsPage.js';
import {SearchGroup, listButtons, switchRow, toast} from './rows.js';

const SOURCE_NAMES = {
    [GaugeSource.ARSO]: () => _('ARSO live gauge (Slovenia)'),
    [GaugeSource.GLOFAS]: () => _('GloFAS modelled discharge'),
};

export const RiversPage = GObject.registerClass(
class RiversPage extends Adw.PreferencesPage {
    /**
     * @param {import('gi://Gio').Settings} settings
     * @param {import('../lib/http.js').HttpClient} http
     */
    _init(settings, http) {
        super._init({title: _('Rivers'), icon_name: 'weather-showers-symbolic'});
        this._settings = settings;
        this._http = http;
        this._stations = null;
        this._writing = false;

        const general = new Adw.PreferencesGroup({
            title: _('River gauges'),
            description: _('Water level and discharge of rivers near you, with alert levels.'),
        });
        general.add(switchRow(settings, 'rivers-enabled', _('Show rivers in the menu')));
        general.add(switchRow(settings, 'river-in-panel', _('Show the first gauge in the top bar')));
        this.add(general);

        this._savedGroup = new Adw.PreferencesGroup({title: _('Saved gauges')});
        this.add(this._savedGroup);
        this._rows = [];

        const arso = new SearchGroup({
            title: _('Add a live gauge in Slovenia (ARSO)'),
            description: _('Measured water level and discharge, updated every 30 minutes, with the official high-water thresholds.'),
            placeholder: _('Search by river or place, e.g. Sava'),
            search: query => this._searchStations(query),
            describe: station => ({
                title: station.name,
                subtitle: [
                    station.level !== null ? `${station.level} cm` : null,
                    station.flow !== null ? `${station.flow} m³/s` : null,
                ].filter(Boolean).join(' · ') || _('no current reading'),
            }),
            onAdd: station => this._add({
                source: GaugeSource.ARSO,
                id: station.id,
                name: station.name,
                latitude: station.latitude,
                longitude: station.longitude,
            }),
        });
        this.add(arso.group);
        this.arsoSearch = arso;

        const glofas = new SearchGroup({
            title: _('Add any river worldwide (GloFAS)'),
            description: _('Modelled daily discharge with a 10-day forecast. Pick a point on the river itself — the model grid is about 5 km.'),
            placeholder: _('Search for a place on the river'),
            search: placeSearch(http),
            describe: place => ({
                title: place.name,
                subtitle: [place.description, coordinatesText(place)].filter(Boolean).join(' · '),
            }),
            onAdd: place => this._add({
                source: GaugeSource.GLOFAS,
                id: '',
                name: place.name,
                latitude: place.latitude,
                longitude: place.longitude,
            }),
        });
        this.add(glofas.group);
        this.glofasSearch = glofas;

        const changed = settings.connect(`changed::${GAUGES_KEY}`, () => {
            if (!this._writing)
                this._rebuild();
        });
        this.connect('destroy', () => settings.disconnect(changed));
        this._rebuild();
    }

    async _searchStations(query) {
        // The station list (~200 entries) is loaded once per window
        this._stations ??= parseArsoGauges(await this._http.getText(ARSO_GAUGES_URL));
        return searchArsoGauges(this._stations, query);
    }

    _write(gauges, {rebuild = true} = {}) {
        this._writing = !rebuild;
        try {
            writeGauges(this._settings, gauges);
        } finally {
            this._writing = false;
        }
    }

    _add(gauge) {
        const gauges = readGauges(this._settings);
        const result = addGauge(gauges, gauge);
        if (!result.added) {
            toast(this, fill(_('%s is already saved'), gauge.name));
            return;
        }
        this._write(result.gauges);
        if (!this._settings.get_boolean('rivers-enabled'))
            this._settings.set_boolean('rivers-enabled', true);
        toast(this, fill(_('Added %s'), gauge.name));
    }

    _rebuild() {
        this._rows.forEach(row => this._savedGroup.remove(row));
        this._rows = [];
        const gauges = readGauges(this._settings);

        if (gauges.length === 0) {
            const empty = new Adw.ActionRow({
                title: _('No saved gauges yet'),
                subtitle: _('Add a gauge below.'),
                css_classes: ['dim-label'],
            });
            this._savedGroup.add(empty);
            this._rows.push(empty);
            return;
        }

        gauges.forEach((gauge, i) => {
            const row = new Adw.ExpanderRow({
                title: gauge.name,
                subtitle: SOURCE_NAMES[gauge.source](),
                use_markup: false,
            });
            // Adw.ExpanderRow packs suffixes from the end, so add them in reverse order
            for (const button of listButtons(i, gauges.length, {
                move: (from, to) => this._write(moveItem(readGauges(this._settings), from, to)),
                remove: index => {
                    const list = readGauges(this._settings);
                    const [removed] = list.splice(index, 1);
                    this._write(list);
                    toast(this, fill(_('Removed %s'), removed.name));
                },
            }).reverse())
                row.add_suffix(button);
            this._addThresholdRows(row, gauge, i);
            this._savedGroup.add(row);
            this._rows.push(row);
        });
    }

    _addThresholdRows(row, gauge, index) {
        const isArso = gauge.source === GaugeSource.ARSO;
        const unit = isArso ? 'cm' : 'm³/s';
        const hint = isArso
            ? _('Water level in cm. Leave all at 0 to use the official ARSO thresholds.')
            : _('Discharge in m³/s. GloFAS has no official thresholds; 0 = not set.');
        row.add_row(new Adw.ActionRow({title: _('Alert thresholds'), subtitle: hint, css_classes: ['dim-label']}));

        [_('Yellow alert from'), _('Orange alert from'), _('Red alert from')].forEach((title, k) => {
            const spin = Adw.SpinRow.new_with_range(0, isArso ? 2000 : 100000, isArso ? 1 : 0.1);
            spin.title = title;
            spin.subtitle = unit;
            spin.digits = isArso ? 0 : 1;
            spin.value = gauge.warnings[k];
            spin.connect('notify::value', () => {
                const gauges = readGauges(this._settings);
                const target = gauges[index];
                if (!target)
                    return;
                target.warnings[k] = spin.value;
                this._write(gauges, {rebuild: false});
            });
            row.add_row(spin);
        });
    }
});
