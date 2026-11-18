// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Development-only: opens the real preference pages in a standalone window and runs a
 * search, so scripts/screenshots.sh can capture the search results.
 *
 *   gjs -m scripts/prefs-demo.js <extension-dir> <locations|general|rivers> <query>
 */
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

const [extensionDir, page, query] = System.programArgs;
const {HttpClient} = await import(`file://${extensionDir}/lib/http.js`);
const {availableLanguages, setLanguage} = await import(`file://${extensionDir}/lib/i18n.js`);
const {LocationsPage} = await import(`file://${extensionDir}/prefs/locationsPage.js`);
const {GeneralPage} = await import(`file://${extensionDir}/prefs/generalPage.js`);
const {RiversPage} = await import(`file://${extensionDir}/prefs/riversPage.js`);

const source = Gio.SettingsSchemaSource.new_from_directory(`${extensionDir}/schemas`,
    Gio.SettingsSchemaSource.get_default(), false);
const settings = new Gio.Settings({
    settings_schema: source.lookup('org.gnome.shell.extensions.urosk-weather-indicator', false),
});

const app = new Adw.Application({application_id: 'net.urosk.WeatherIndicatorDemo'});
app.connect('activate', () => {
    setLanguage(settings.get_string('language'), `${extensionDir}/locale`);
    const http = new HttpClient();
    const window = new Adw.PreferencesWindow({application: app, title: 'Urosk Weather Indicator', default_width: 720, default_height: 860});
    window.search_enabled = false;
    const locations = new LocationsPage(settings, http);
    const general = new GeneralPage(settings, availableLanguages(`${extensionDir}/locale`));
    const rivers = new RiversPage(settings, http);
    window.add(locations);
    window.add(general);
    window.add(rivers);
    window.present();

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 800, () => {
        if (page === 'general') {
            window.set_visible_page(general);
        } else if (page === 'rivers') {
            window.set_visible_page(rivers);
            rivers.arsoSearch.search(query);
        } else {
            locations.placeSearch.search(query);
        }
        return GLib.SOURCE_REMOVE;
    });
});
// runAsync keeps promise jobs running while the application loop runs (plain run() would block them)
await app.runAsync([]);
