// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import js from '@eslint/js';

/** Globals of the GJS runtime and GNOME Shell. */
const gjsGlobals = {
    ARGV: 'readonly',
    console: 'readonly',
    global: 'readonly',
    imports: 'readonly',
    log: 'readonly',
    logError: 'readonly',
    print: 'readonly',
    printerr: 'readonly',
    TextDecoder: 'readonly',
    TextEncoder: 'readonly',
};

export default [
    {ignores: ['build/', 'dist/', 'node_modules/']},
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: gjsGlobals,
        },
        rules: {
            'curly': ['error', 'multi-or-nest', 'consistent'],
            'eqeqeq': ['error', 'always'],
            // GNOME style: the class passed to GObject.registerClass() starts at column 0
            'indent': ['error', 4, {
                SwitchCase: 0,
                ignoredNodes: ['CallExpression[callee.object.name=GObject][callee.property.name=registerClass] > ClassExpression:first-child'],
            }],
            'no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_$'}],
            'prefer-const': 'error',
            'quotes': ['error', 'single', {avoidEscape: true}],
            'semi': ['error', 'always'],
        },
    },
];
