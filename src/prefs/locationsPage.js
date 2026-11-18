// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Locations page: saved locations (reorder, remove, choose the one in the top bar) and a
 * place search to add new ones.
 */
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {interfaceLanguage} from '../lib/format.js';
import {buildSearchUrl, parseCoordinates, parseSearchResults} from '../lib/geocoding.js';
import {_, fill} from '../lib/i18n.js';
import {
    ACTIVE_LOCATION_KEY, LOCATIONS_KEY, activeLocationIndex, addLocation, readLocations, writeLocations,
} from '../lib/locations.js';
import {moveItem} from '../lib/records.js';
import {SearchGroup, listButtons, toast} from './rows.js';

/** "46.205, 14.538" — coordinates as shown in the list. */
export function coordinatesText({latitude, longitude}) {
    return `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
}

/**
 * Search function for place names; coordinates typed by the user become a single result.
 *
 * @param {import('../lib/http.js').HttpClient} http
 * @returns {(query: string, cancellable: object) => Promise<object[]>}
 */
export function placeSearch(http) {
    return async (query, cancellable) => {
        const coordinates = parseCoordinates(query);
        if (coordinates)
            return [{name: coordinatesText(coordinates), description: _('Coordinates'), ...coordinates}];
        const json = await http.getJson(buildSearchUrl(query, {language: interfaceLanguage()}), cancellable);
        return parseSearchResults(json);
    };
}

export const LocationsPage = GObject.registerClass(
class LocationsPage extends Adw.PreferencesPage {
    /**
     * @param {import('gi://Gio').Settings} settings
     * @param {import('../lib/http.js').HttpClient} http
     */
    _init(settings, http) {
        super._init({title: _('Locations'), icon_name: 'mark-location-symbolic'});
        this._settings = settings;

        this._savedGroup = new Adw.PreferencesGroup({
            title: _('Saved locations'),
            description: _('The selected location is shown in the top bar. With several locations, switch between them at the top of the menu.'),
        });
        this.add(this._savedGroup);
        this._rows = [];

        const search = new SearchGroup({
            title: _('Add a location'),
            description: _('Search by place name, or enter coordinates as “latitude, longitude”.'),
            placeholder: _('Search for a place'),
            search: placeSearch(http),
            describe: place => ({
                title: place.name,
                subtitle: [place.description, coordinatesText(place)].filter(Boolean).join(' · '),
            }),
            onAdd: place => this._add(place),
        });
        this.add(search.group);
        this.placeSearch = search;

        const changed = [
            settings.connect(`changed::${LOCATIONS_KEY}`, () => this._rebuild()),
            settings.connect(`changed::${ACTIVE_LOCATION_KEY}`, () => this._rebuild()),
        ];
        this.connect('destroy', () => changed.forEach(id => settings.disconnect(id)));
        this._rebuild();
    }

    _add(place) {
        const locations = readLocations(this._settings);
        const result = addLocation(locations, place);
        if (!result.added) {
            toast(this, fill(_('%s is already saved'), place.name));
            return;
        }
        writeLocations(this._settings, result.locations);
        if (locations.length === 0)
            this._settings.set_int(ACTIVE_LOCATION_KEY, 0);
        toast(this, fill(_('Added %s'), place.name));
    }

    _move(from, to) {
        const locations = readLocations(this._settings);
        const active = activeLocationIndex(this._settings, locations.length);
        writeLocations(this._settings, moveItem(locations, from, to));
        // Keep the same location active after reordering
        if (active === from)
            this._settings.set_int(ACTIVE_LOCATION_KEY, to);
        else if (active === to)
            this._settings.set_int(ACTIVE_LOCATION_KEY, from);
    }

    _remove(index) {
        const locations = readLocations(this._settings);
        const active = activeLocationIndex(this._settings, locations.length);
        const [removed] = locations.splice(index, 1);
        writeLocations(this._settings, locations);
        if (index < active || active >= locations.length)
            this._settings.set_int(ACTIVE_LOCATION_KEY, Math.max(0, active - 1));
        toast(this, fill(_('Removed %s'), removed.name));
    }

    _rebuild() {
        this._rows.forEach(row => this._savedGroup.remove(row));
        this._rows = [];
        const locations = readLocations(this._settings);
        const active = activeLocationIndex(this._settings, locations.length);

        if (locations.length === 0) {
            const empty = new Adw.ActionRow({
                title: _('No saved locations yet'),
                subtitle: _('Search for a place below to add your first location.'),
                css_classes: ['dim-label'],
            });
            this._savedGroup.add(empty);
            this._rows.push(empty);
            return;
        }

        let group = null;
        locations.forEach((location, i) => {
            const row = new Adw.ActionRow({
                title: location.name,
                subtitle: [location.description, coordinatesText(location)].filter(Boolean).join(' · '),
                use_markup: false,
                activatable: true,
            });
            const radio = new Gtk.CheckButton({active: i === active, valign: Gtk.Align.CENTER, tooltip_text: _('Show in the top bar')});
            if (group)
                radio.set_group(group);
            group ??= radio;
            radio.connect('toggled', () => {
                if (radio.active && activeLocationIndex(this._settings, locations.length) !== i)
                    this._settings.set_int(ACTIVE_LOCATION_KEY, i);
            });
            row.add_prefix(radio);
            row.set_activatable_widget(radio);
            for (const button of listButtons(i, locations.length, {move: (a, b) => this._move(a, b), remove: index => this._remove(index)}))
                row.add_suffix(button);
            this._savedGroup.add(row);
            this._rows.push(row);
        });
    }
});
