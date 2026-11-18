// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Tiny test harness for GJS (no test framework is available in the GNOME JavaScript runtime).
 */
import GLib from 'gi://GLib';

const tests = [];

/** Registers a test. */
export function test(name, fn) {
    tests.push({name, fn});
}

class AssertionError extends Error {}

function describe(value) {
    return JSON.stringify(value);
}

export const assert = {
    ok(value, message = 'expected a truthy value') {
        if (!value)
            throw new AssertionError(message);
    },
    equal(actual, expected, message = '') {
        if (actual !== expected)
            throw new AssertionError(`${message} expected ${describe(expected)}, got ${describe(actual)}`.trim());
    },
    deepEqual(actual, expected, message = '') {
        if (describe(actual) !== describe(expected))
            throw new AssertionError(`${message} expected ${describe(expected)}, got ${describe(actual)}`.trim());
    },
    close(actual, expected, tolerance = 1e-9, message = '') {
        if (Math.abs(actual - expected) > tolerance)
            throw new AssertionError(`${message} expected ${expected} ± ${tolerance}, got ${actual}`.trim());
    },
    throws(fn, message = 'expected an exception') {
        try {
            fn();
        } catch {
            return;
        }
        throw new AssertionError(message);
    },
};

/** Reads a fixture from tests/fixtures. */
export function fixture(name) {
    const path = GLib.build_filenamev([GLib.path_get_dirname(import.meta.url.replace('file://', '')), 'fixtures', name]);
    const [, bytes] = GLib.file_get_contents(path);
    return new TextDecoder().decode(bytes);
}

/** Runs all registered tests and returns the number of failures. */
export async function run() {
    let failed = 0;
    for (const {name, fn} of tests) {
        try {
            await fn();
            print(`  ✓ ${name}`);
        } catch (error) {
            failed++;
            print(`  ✗ ${name}\n      ${error.message}`);
        }
    }
    print(`\n${tests.length - failed} passed, ${failed} failed`);
    return failed;
}
