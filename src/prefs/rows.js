// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared building blocks of the preferences window: settings-bound rows, list action
 * buttons and a debounced search group whose results can be added with one click.
 */
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {_} from '../lib/i18n.js';

/**
 * Combo row bound to a string (or enum) settings key.
 *
 * @param {Gio.Settings} settings
 * @param {string} key
 * @param {string} title
 * @param {Array<[string, string]>} options [value, label]
 * @param {string} [subtitle]
 * @returns {Adw.ComboRow}
 */
export function comboRow(settings, key, title, options, subtitle = '') {
    const row = new Adw.ComboRow({
        title,
        subtitle,
        model: Gtk.StringList.new(options.map(([, text]) => text)),
        selected: Math.max(0, options.findIndex(([value]) => value === settings.get_string(key))),
    });
    row.connect('notify::selected', () => settings.set_string(key, options[row.selected][0]));
    return row;
}

/** Switch row bound to a boolean settings key. */
export function switchRow(settings, key, title, subtitle = '') {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

/** Spin row bound to an integer settings key. */
export function spinRow(settings, key, title, {min, max, step = 1, subtitle = ''}) {
    const row = Adw.SpinRow.new_with_range(min, max, step);
    row.title = title;
    row.subtitle = subtitle;
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

/**
 * Flat icon button for list rows.
 *
 * @param {string} iconName
 * @param {string} tooltip
 * @param {() => void} onClicked
 * @param {boolean} [sensitive]
 * @returns {Gtk.Button}
 */
export function iconButton(iconName, tooltip, onClicked, sensitive = true) {
    const button = new Gtk.Button({
        icon_name: iconName,
        tooltip_text: tooltip,
        valign: Gtk.Align.CENTER,
        sensitive,
        css_classes: ['flat'],
    });
    button.connect('clicked', onClicked);
    return button;
}

/** Up, down and remove buttons for a row at `index` of a list of `count` items. */
export function listButtons(index, count, {move, remove}) {
    return [
        iconButton('go-up-symbolic', _('Move up'), () => move(index, index - 1), index > 0),
        iconButton('go-down-symbolic', _('Move down'), () => move(index, index + 1), index < count - 1),
        iconButton('user-trash-symbolic', _('Remove'), () => remove(index)),
    ];
}

/** Shows a short notification in the preferences window. */
export function toast(widget, title) {
    widget.get_root()?.add_toast?.(new Adw.Toast({title, timeout: 3}));
}

/** Delay between the last keystroke and the search request. */
const SEARCH_DELAY_MS = 350;

/**
 * Preferences group with a search entry; results appear below it as rows with an add button.
 */
export class SearchGroup {
    /**
     * @param {object} options
     * @param {string} options.title
     * @param {string} [options.description]
     * @param {string} options.placeholder title of the entry row
     * @param {(query: string, cancellable: Gio.Cancellable) => Promise<object[]>} options.search
     * @param {(result: object) => {title: string, subtitle: string}} options.describe
     * @param {(result: object) => void} options.onAdd
     * @param {number} [options.minLength]
     */
    constructor({title, description = '', placeholder, search, describe, onAdd, minLength = 2}) {
        this._search = search;
        this._describe = describe;
        this._onAdd = onAdd;
        this._minLength = minLength;
        this._rows = [];
        this._timeout = 0;
        this._cancellable = null;

        this.group = new Adw.PreferencesGroup({title, description});
        this._entry = new Adw.EntryRow({title: placeholder, show_apply_button: false});
        this._entry.add_prefix(new Gtk.Image({icon_name: 'system-search-symbolic'}));
        this._entry.connect('changed', () => this._schedule());
        this._entry.connect('entry-activated', () => this._run());
        this.group.add(this._entry);
        this.group.connect('destroy', () => this._cancel());
    }

    /** Runs a search as if the text had been typed (used by the screenshot demo). */
    search(text) {
        this._entry.text = text;
        this._run();
    }

    _cancel() {
        if (this._timeout) {
            GLib.source_remove(this._timeout);
            this._timeout = 0;
        }
        this._cancellable?.cancel();
        this._cancellable = null;
    }

    _schedule() {
        this._cancel();
        this._timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SEARCH_DELAY_MS, () => {
            this._timeout = 0;
            this._run();
            return GLib.SOURCE_REMOVE;
        });
    }

    _clearResults() {
        this._rows.forEach(row => this.group.remove(row));
        this._rows = [];
    }

    _message(title, subtitle = '') {
        const row = new Adw.ActionRow({title, subtitle, use_markup: false, css_classes: ['dim-label']});
        this.group.add(row);
        this._rows.push(row);
    }

    async _run() {
        this._cancel();
        const query = this._entry.text.trim();
        this._clearResults();
        if (query.length < this._minLength)
            return;

        const cancellable = this._cancellable = new Gio.Cancellable();
        this._message(_('Searching…'));
        let results;
        try {
            results = await this._search(query, cancellable);
        } catch (error) {
            if (cancellable.is_cancelled())
                return;
            this._clearResults();
            this._message(_('Search failed'), error.message);
            return;
        }
        if (cancellable.is_cancelled())
            return;
        this._clearResults();
        if (results.length === 0) {
            this._message(_('Nothing found'), _('Try another spelling or enter coordinates as “latitude, longitude”.'));
            return;
        }
        for (const result of results) {
            const {title, subtitle} = this._describe(result);
            const row = new Adw.ActionRow({title, subtitle, use_markup: false, activatable: true});
            row.add_suffix(new Gtk.Image({icon_name: 'list-add-symbolic'}));
            row.connect('activated', () => {
                this._onAdd(result);
                this._entry.text = '';
                this._clearResults();
            });
            this.group.add(row);
            this._rows.push(row);
        }
    }
}
