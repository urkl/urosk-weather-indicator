// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Small building blocks for the shell UI: boxes, labels, the chart area and an icon cache.
 */
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';

/** Opacity (0–255) of secondary text; opacity keeps it readable on dark and light styles. */
export const DIM = 150;

export function label(text, styleClass = '', options = {}) {
    return new St.Label({text, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER, ...options});
}

export function dimLabel(text, styleClass = '', options = {}) {
    return label(text, styleClass, {opacity: DIM, ...options});
}

export function hbox(styleClass = '', options = {}) {
    return new St.BoxLayout({style_class: styleClass, ...options});
}

export function vbox(styleClass = '', options = {}) {
    return new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: styleClass, ...options});
}

/** Lets a label wrap over several lines instead of being ellipsized. */
export function wrap(widget) {
    widget.clutter_text.line_wrap = true;
    widget.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    widget.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    return widget;
}

/**
 * Drawing area that repaints a Cairo function with the latest data. The theme's foreground
 * colour is passed to the drawing function as `fg` ([r, g, b], 0–1).
 */
export const ChartArea = GObject.registerClass(
class ChartArea extends St.DrawingArea {
    /**
     * @param {object} params St.DrawingArea properties
     * @param {(cr: object, width: number, height: number, data: object) => void} draw
     */
    _init(params, draw) {
        super._init(params);
        this._draw = draw;
        this._data = null;
    }

    setData(data) {
        this._data = data;
        this.queue_repaint();
    }

    vfunc_repaint() {
        const cr = this.get_context();
        if (this._data) {
            const [width, height] = this.get_surface_size();
            const color = this.get_theme_node().get_foreground_color();
            const fg = [color.red / 255, color.green / 255, color.blue / 255];
            try {
                this._draw(cr, width, height, {...this._data, fg});
            } catch (error) {
                console.warn(`urosk-weather-indicator: chart: ${error.message}`);
            }
        }
        cr.$dispose();
    }
});

/** Loads the bundled SVG icons once and hands out `St.Icon`s for them. */
export class IconCache {
    /** @param {string} directory absolute path of the icons directory */
    constructor(directory) {
        this._directory = directory;
        this._icons = new Map();
    }

    gicon(fileName) {
        let gicon = this._icons.get(fileName);
        if (!gicon) {
            gicon = Gio.FileIcon.new(Gio.File.new_for_path(`${this._directory}/${fileName}`));
            this._icons.set(fileName, gicon);
        }
        return gicon;
    }

    icon(fileName, size, styleClass = 'uwi-icon') {
        return new St.Icon({
            gicon: this.gicon(fileName),
            icon_size: size,
            style_class: styleClass,
            y_align: Clutter.ActorAlign.CENTER,
        });
    }
}
