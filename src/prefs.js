// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Preferences window: Locations, General and Rivers pages.
 */
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {HttpClient} from './lib/http.js';
import {GeneralPage} from './prefs/generalPage.js';
import {LocationsPage} from './prefs/locationsPage.js';
import {RiversPage} from './prefs/riversPage.js';

export default class UroskWeatherIndicatorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const http = new HttpClient({timeout: 15});
        window.connect('close-request', () => {
            http.destroy();
            return false;
        });

        window.add(new LocationsPage(settings, http));
        window.add(new GeneralPage(settings));
        window.add(new RiversPage(settings, http));
        window.set_default_size(720, 860);
        // Typing must go to the place search, not to the window-wide settings search
        window.search_enabled = false;
    }
}
