// SPDX-FileCopyrightText: 2026 Uroš Kristan <uros.kristan@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Small asynchronous HTTP client on top of libsoup 3, shared by the shell extension and the
 * preferences window. All requests are anonymous GET requests to public APIs.
 */
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

export const USER_AGENT = 'urosk-weather-indicator (+https://github.com/urkl/urosk-weather-indicator)';

export class HttpClient {
    /**
     * @param {object} [options]
     * @param {number} [options.timeout] seconds
     */
    constructor({timeout = 20} = {}) {
        this._session = new Soup.Session({timeout, user_agent: USER_AGENT});
    }

    /**
     * @param {string} url
     * @param {import('gi://Gio').Cancellable|null} [cancellable]
     * @returns {Promise<string>}
     */
    getText(url, cancellable = null) {
        if (!this._session)
            return Promise.reject(new Error('HTTP client was destroyed'));
        const message = Soup.Message.new('GET', url);
        if (!message)
            return Promise.reject(new Error(`Invalid URL: ${url}`));

        return new Promise((resolve, reject) => {
            this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (session, result) => {
                try {
                    const bytes = session.send_and_read_finish(result);
                    const status = message.get_status();
                    if (status !== Soup.Status.OK)
                        throw new Error(`HTTP ${status} ${message.get_reason_phrase() ?? ''}`.trim());
                    resolve(new TextDecoder().decode(bytes.get_data()));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    /**
     * @param {string} url
     * @param {import('gi://Gio').Cancellable|null} [cancellable]
     * @returns {Promise<object>}
     */
    async getJson(url, cancellable = null) {
        return JSON.parse(await this.getText(url, cancellable));
    }

    destroy() {
        this._session?.abort();
        this._session = null;
    }
}
