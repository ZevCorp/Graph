(function () {
    function canUseChromeRuntime() {
        return typeof window !== 'undefined'
            && typeof window.chrome !== 'undefined'
            && typeof window.chrome.runtime !== 'undefined'
            && Boolean(window.chrome.runtime.id);
    }

    function detectPlatform() {
        return canUseChromeRuntime() ? 'chrome-extension' : 'web-page';
    }

    function safeRead(storageLike, key) {
        try {
            return storageLike?.getItem?.(key) || '';
        } catch (error) {
            return '';
        }
    }

    function safeWrite(storageLike, key, value) {
        try {
            if (value === null || value === undefined || value === '') {
                storageLike?.removeItem?.(key);
                return;
            }
            storageLike?.setItem?.(key, value);
        } catch (error) {
            // Ignore restricted environments.
        }
    }

    function createStorage(scope, storageLike) {
        const prefix = `graph:${scope}:`;
        return {
            get(key) {
                return safeRead(storageLike, `${prefix}${key}`);
            },
            set(key, value) {
                safeWrite(storageLike, `${prefix}${key}`, value);
            },
            remove(key) {
                safeWrite(storageLike, `${prefix}${key}`, '');
            }
        };
    }

    function createHost(config = {}) {
        const platform = detectPlatform();
        const appId = `${config.appId || 'page'}`.trim() || 'page';
        const apiBaseUrl = `${config.apiBaseUrl || ''}`.replace(/\/+$/, '');

        return {
            platform,
            appId,
            apiBaseUrl,
            fetchImpl: typeof window !== 'undefined' ? window.fetch.bind(window) : null,
            localStore: createStorage(`${platform}:${appId}:local`, window.localStorage),
            sessionStore: createStorage(`${platform}:${appId}:session`, window.sessionStorage)
        };
    }

    window.GraphPluginHost = {
        createHost,
        detectPlatform
    };
})();
