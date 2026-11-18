// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * River section of the menu: one row per saved gauge and a chart of the selected one —
 * the last 48 hours of water level for ARSO gauges, recent and forecast daily discharge
 * for GloFAS points.
 */
import St from 'gi://St';

import {_, fill} from '../lib/i18n.js';
import {drawDischargeChart, drawLevelChart} from '../lib/charts.js';
import {ALERT_CLASSES, ALERT_NAMES, GaugeSource, customThresholds, thresholdsText} from '../lib/rivers/gauges.js';
import {ARSO_GAUGES_PAGE} from '../lib/rivers/arso.js';
import {ChartArea, dimLabel, hbox, label, vbox, wrap} from './widgets.js';

const GLOFAS_PAGE = 'https://open-meteo.com/en/docs/flood-api';

export class RiversView {
    /** @param {(uri: string) => void} openUri */
    constructor(openUri) {
        this._selected = 0;
        this._statuses = [];
        this.actor = vbox('uwi-rivers');

        const header = hbox('uwi-rivers-header');
        header.add_child(new St.Label({text: _('RIVERS'), style_class: 'uwi-heading', x_expand: true}));
        this._link = new St.Button({style_class: 'uwi-link', can_focus: true});
        this._link.connect('clicked', () => openUri(this._linkUri));
        header.add_child(this._link);
        this.actor.add_child(header);

        this._rows = vbox('uwi-river-rows');
        this.actor.add_child(this._rows);
        this._levelChart = new ChartArea({style_class: 'uwi-river-chart'},
            (cr, width, height, data) => drawLevelChart(cr, width, height, data));
        this._dischargeChart = new ChartArea({style_class: 'uwi-river-chart'},
            (cr, width, height, data) => drawDischargeChart(cr, width, height, data));
        this.actor.add_child(this._levelChart);
        this.actor.add_child(this._dischargeChart);
        this._footer = wrap(dimLabel('', 'uwi-river-footer'));
        this.actor.add_child(this._footer);
    }

    /**
     * @param {object[]} statuses from `arsoStatus` / `glofasStatus`
     * @param {import('../lib/format.js').Formatter} fmt
     * @param {number} now Unix seconds
     * @param {string|null} error last refresh error
     */
    update(statuses, fmt, now, error) {
        this._statuses = statuses;
        this._fmt = fmt;
        this._now = now;
        this._error = error;
        this._selected = Math.min(this._selected, Math.max(0, statuses.length - 1));
        this._render();
    }

    _render() {
        const fmt = this._fmt;
        this._rows.destroy_all_children();
        this._statuses.forEach((status, i) => {
            const button = new St.Button({style_class: 'uwi-river', can_focus: true, x_expand: true});
            if (i === this._selected && this._statuses.length > 1)
                button.add_style_pseudo_class('checked');
            button.set_child(this._row(status, fmt));
            button.connect('clicked', () => {
                this._selected = i;
                this._render();
            });
            this._rows.add_child(button);
        });
        this._renderChart(this._statuses[this._selected]);
    }

    _row(status, fmt) {
        const box = vbox('uwi-river-row', {x_expand: true});
        const line = hbox('uwi-river-line');
        line.add_child(label(status.gauge.name, 'uwi-river-name', {x_expand: true}));
        if (status.missing) {
            line.add_child(dimLabel(_('no data')));
            box.add_child(line);
            return box;
        }

        const level = status.alert.level ?? 0;
        const value = status.source === GaugeSource.ARSO
            ? (status.level !== null ? fmt.waterLevel(status.level) : fmt.discharge(status.flow))
            : fmt.discharge(status.discharge);
        line.add_child(label(`${value} ${status.arrow}`.trim(), `uwi-river-value uwi-alert-${ALERT_CLASSES[level]}`));
        if (level > 0)
            line.add_child(label(_(ALERT_NAMES[level]).toLocaleUpperCase(), `uwi-badge uwi-badge-${ALERT_CLASSES[level]}`));
        box.add_child(line);

        const details = [];
        if (status.source === GaugeSource.ARSO) {
            if (status.level !== null && status.flow !== null)
                details.push(fmt.discharge(status.flow));
            if (status.flowCategory)
                details.push(_(status.flowCategory));
            if (status.waterTemperature !== null)
                details.push(fill(_('water %s'), fmt.temperature(status.waterTemperature)));
            if (status.trend !== null)
                details.push(fill(_('%s per hour'), `${status.trend > 0 ? '+' : ''}${fmt.waterLevel(status.trend)}`));
        } else {
            details.push(_('modelled daily discharge'));
            if (status.peak && status.peak.time !== status.series.days[status.series.todayIndex]?.time) {
                details.push(fill(_('peak %s on %s'), fmt.discharge(status.peak.median ?? status.peak.discharge),
                    fmt.shortDate(status.peak.time)));
            }
        }
        if (details.length)
            box.add_child(dimLabel(details.join('  ·  '), 'uwi-river-details'));
        return box;
    }

    _renderChart(status) {
        const fmt = this._fmt;
        const isArso = status?.source === GaugeSource.ARSO && !status.missing;
        const isGlofas = status?.source === GaugeSource.GLOFAS && !status.missing;
        this._levelChart.visible = isArso && status.points.length > 1;
        this._dischargeChart.visible = isGlofas;

        const footer = [];
        if (isArso) {
            this._linkUri = ARSO_GAUGES_PAGE;
            this._link.label = 'ARSO ↗';
            if (this._levelChart.visible) {
                this._levelChart.setData({
                    points: status.points,
                    thresholds: status.alert.basis === 'level' ? status.alert.thresholds : null,
                    now: this._now,
                    alertLevel: status.alert.level ?? 0,
                    label: hours => hours ? fill(_('-%d h'), hours) : _('now'),
                });
            }
            if (status.age !== null)
                footer.push(fill(_('measured %s'), fmt.age(status.age)));
            if (status.points.length < 2)
                footer.push(_('the chart fills in as readings are collected'));
            if (status.alert.thresholds) {
                const unit = status.alert.basis === 'level' ? 'cm' : 'm³/s';
                const source = customThresholds(status.gauge) ? _('custom') : 'ARSO';
                footer.push(fill(_('alert thresholds %s %s (%s)'), thresholdsText(status.alert.thresholds), unit, source));
            }
        } else if (isGlofas) {
            this._linkUri = GLOFAS_PAGE;
            this._link.label = 'GloFAS ↗';
            this._dischargeChart.setData({
                days: status.series.days,
                todayIndex: status.series.todayIndex,
                thresholds: customThresholds(status.gauge),
                label: time => fmt.shortDate(time),
            });
            footer.push(_('GloFAS model, ~5 km grid; band = ensemble range'));
        } else {
            this._linkUri = ARSO_GAUGES_PAGE;
            this._link.label = '';
        }
        this._link.visible = Boolean(this._link.label);
        if (this._error)
            footer.push(fill(_('update failed: %s'), this._error));
        this._footer.text = footer.join('  ·  ');
    }
}
