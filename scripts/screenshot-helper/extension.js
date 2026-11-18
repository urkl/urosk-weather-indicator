// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Development-only helper used by scripts/screenshots.sh: inside a headless GNOME Shell it
 * waits for the weather indicator to load live data, opens the menu and the preferences
 * and stores screenshots in $UWI_SCREENSHOT_DIR. It never runs in a real session.
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const TARGET = 'urosk-weather-indicator@urosk.net';

const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));

async function waitFor(condition, timeoutMs, what) {
    const end = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() > end)
            throw new Error(`timed out waiting for ${what}`);
        await wait(250);
    }
}

function log(message) {
    console.log(`screenshot-helper: ${message}`);
}

export default class ScreenshotHelper extends Extension {
    enable() {
        this._run().catch(error => log(`FAILED: ${error.message}\n${error.stack}`))
            .finally(() => this._finish());
    }

    disable() {}

    async _shot(name, x, y, width, height) {
        const [stageWidth, stageHeight] = [global.stage.width, global.stage.height];
        x = Math.max(0, Math.round(x));
        y = Math.max(0, Math.round(y));
        width = Math.round(Math.min(width, stageWidth - x));
        height = Math.round(Math.min(height, stageHeight - y));
        const file = Gio.File.new_for_path(`${this._dir}/${name}`);
        const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
        await new Shell.Screenshot().screenshot_area(x, y, width, height, stream);
        stream.close(null);
        log(`saved ${name} (${width}×${height})`);
    }

    async _run() {
        this._dir = GLib.getenv('UWI_SCREENSHOT_DIR');
        if (!this._dir)
            throw new Error('UWI_SCREENSHOT_DIR is not set');
        await wait(2000);
        Main.overview.hide();
        Main.welcomeDialog?.close?.();

        await waitFor(() => Main.panel.statusArea[TARGET], 20000, 'the indicator');
        const indicator = Main.panel.statusArea[TARGET];
        await waitFor(() => indicator._forecasts.size > 0, 60000, 'the forecast');
        await waitFor(() => !indicator._riversEnabled || indicator._arsoStations || indicator._glofas.size > 0,
            60000, 'river data');
        await wait(3000);

        // Top bar: from the indicator to the right edge of the screen
        const [ix] = indicator.get_transformed_position();
        const panelHeight = Main.panel.height;
        await this._shot('panel.png', ix - 16, 0, global.stage.width - ix + 16, panelHeight);

        // Menu with the second river gauge (GloFAS chart) selected
        indicator.menu.open(false);
        await wait(1500);
        const rivers = indicator._menuView.rivers;
        if (rivers._statuses.length > 1) {
            rivers._selected = rivers._statuses.length - 1;
            rivers._render();
        }
        await wait(800);
        const box = indicator.menu.actor;
        const [mx, my] = box.get_transformed_position();
        const [mw, mh] = box.get_transformed_size();
        await this._shot('menu.png', mx - 8, 0, mw + 16, my + mh + 8);

        // Another day selected: hourly chart and model table of that day
        indicator._menuView.selectDay(2);
        await wait(800);
        await this._shot('menu-day.png', mx - 8, 0, mw + 16, my + mh + 8);

        // Second location
        indicator._settings.set_int('active-location', 1);
        await waitFor(() => indicator._forecasts.size > 1, 60000, 'the second forecast');
        indicator._menuView.selectDay(0);
        await wait(1500);
        const [, my2] = box.get_transformed_position();
        const [mw2, mh2] = box.get_transformed_size();
        await this._shot('menu-location.png', mx - 8, 0, mw2 + 16, my2 + mh2 + 8);
        indicator._settings.set_int('active-location', 0);
        indicator.menu.close(false);
        await wait(1000);

        // Preferences window (Locations page)
        Main.extensionManager.openExtensionPrefs(TARGET, '', {});
        let prefs = null;
        await waitFor(() => {
            prefs = global.display.list_all_windows().find(window => window.get_wm_class()?.includes('Extensions') ||
                window.get_title()?.includes('Urosk Weather'));
            return prefs;
        }, 30000, 'the preferences window');
        await wait(4000);
        const rect = prefs.get_frame_rect();
        await this._shot('preferences.png', rect.x, rect.y, rect.width, rect.height);

        prefs.delete(global.get_current_time());
        await wait(1500);

        // Search results: the real preference pages in a demo window that runs the search
        await this._demoShot('preferences-search.png', 'locations', 'Piran');
        await this._demoShot('preferences-rivers.png', 'rivers', 'sava');
    }

    async _demoShot(name, page, query) {
        const extensionDir = Main.extensionManager.lookup(TARGET).path;
        const demo = Gio.Subprocess.new(['gjs', '-m', `${this.path}/prefs-demo.js`, extensionDir, page, query],
            Gio.SubprocessFlags.NONE);
        let window = null;
        await waitFor(() => {
            window = global.display.list_all_windows().find(candidate => candidate.get_title() === 'Urosk Weather Indicator');
            return window;
        }, 30000, `the demo window (${page})`);
        await wait(6000);
        const rect = window.get_frame_rect();
        await this._shot(name, rect.x, rect.y, rect.width, rect.height);
        demo.force_exit();
        await wait(1000);
    }

    _finish() {
        GLib.file_set_contents(`${this._dir ?? '/tmp'}/.done`, 'done');
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            global.context.terminate();
            return GLib.SOURCE_REMOVE;
        });
    }
}
