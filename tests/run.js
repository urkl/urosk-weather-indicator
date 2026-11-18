// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Runs the unit tests with GJS: `gjs -m tests/run.js` (or `make test`).
 * Only the pure modules in src/lib are tested; the shell UI needs a running GNOME Shell.
 */
import {run} from './harness.js';

import './stats.test.js';
import './units.test.js';
import './format.test.js';
import './weatherCodes.test.js';
import './forecast.test.js';
import './geocoding.test.js';
import './locations.test.js';
import './rivers.test.js';
import './arsoText.test.js';

const failed = await run();
imports.system.exit(failed ? 1 : 0);
