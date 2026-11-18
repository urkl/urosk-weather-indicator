// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Preferences window: Locations, General and Rivers pages.
 */
import GLib from 'gi://GLib';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {HttpClient} from './lib/http.js';
import {availableLanguages, setLanguage} from './lib/i18n.js';
import {GeneralPage} from './prefs/generalPage.js';
import {LocationsPage} from './prefs/locationsPage.js';
import {RiversPage} from './prefs/riversPage.js';

export default class UroskWeatherIndicatorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const localeDir = `${this.path}/locale`;
        const http = new HttpClient({timeout: 15});
        let pages = [];

        // Builds the pages in the chosen language; called again when the language changes
        const build = () => {
            pages.forEach(page => window.remove(page));
            setLanguage(settings.get_string('language'), localeDir);
            pages = [
                new LocationsPage(settings, http),
                new GeneralPage(settings, availableLanguages(localeDir)),
                new RiversPage(settings, http),
            ];
            pages.forEach(page => window.add(page));
        };
        build();

        const languageChanged = settings.connect('changed::language', () => {
            // Rebuild after the combo row that changed the language has finished its signal
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                build();
                window.set_visible_page(pages[1]);
                return GLib.SOURCE_REMOVE;
            });
        });
        window.connect('close-request', () => {
            settings.disconnect(languageChanged);
            http.destroy();
            return false;
        });

        window.set_default_size(720, 860);
        // Typing must go to the place search, not to the window-wide settings search
        window.search_enabled = false;
    }
}
