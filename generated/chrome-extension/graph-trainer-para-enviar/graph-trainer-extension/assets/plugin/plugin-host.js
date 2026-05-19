(function () {
    const EXTENSION_BRIDGE_SOURCE = 'graph-trainer-page';
    const EXTENSION_BRIDGE_RESPONSE_SOURCE = 'graph-trainer-extension-bridge';
    const hostCache = new Map();

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

    function canUseExtensionBridge() {
        return typeof document !== 'undefined'
            && document.documentElement?.dataset?.graphTrainerExtensionBridge === 'true';
    }

    function normalizeBridgeSegment(value, fallback = '') {
        return `${value || ''}`
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || fallback;
    }

    function createExtensionBridgeStore(scopeId) {
        const normalizedScopeId = `${scopeId || ''}`.trim();
        const listenersByKey = new Map();

        function storageKeyFor(key) {
            return `graphTrainerGlobalStore:${normalizeBridgeSegment(normalizedScopeId, 'default-scope')}:${normalizeBridgeSegment(key, 'value')}`;
        }

        function request(operation, key, value = '') {
            return new Promise((resolve, reject) => {
                const requestId = `graph-store-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                let settled = false;
                const timeoutId = window.setTimeout(() => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    window.removeEventListener('message', handleMessage);
                    reject(new Error('Extension bridge timed out.'));
                }, 1500);

                function handleMessage(event) {
                    if (event.source !== window) {
                        return;
                    }

                    const payload = event.data;
                    if (!payload || payload.source !== EXTENSION_BRIDGE_RESPONSE_SOURCE || payload.requestId !== requestId) {
                        return;
                    }

                    window.removeEventListener('message', handleMessage);
                    window.clearTimeout(timeoutId);
                    settled = true;
                    if (payload.ok) {
                        resolve(payload.payload);
                        return;
                    }

                    reject(new Error(payload.error || 'Extension bridge request failed.'));
                }

                window.addEventListener('message', handleMessage);
                window.postMessage({
                    source: EXTENSION_BRIDGE_SOURCE,
                    type: 'global-store-request',
                    requestId,
                    scopeId: normalizedScopeId,
                    key: `${key || ''}`.trim(),
                    operation,
                    value: value || ''
                }, '*');
            });
        }

        window.addEventListener('message', (event) => {
            if (event.source !== window) {
                return;
            }

            const payload = event.data;
            if (!payload || payload.source !== EXTENSION_BRIDGE_RESPONSE_SOURCE || payload.type !== 'global-store-changed') {
                return;
            }

            const listeners = listenersByKey.get(`${payload.storageKey || ''}`.trim());
            if (!listeners || listeners.size === 0) {
                return;
            }

            listeners.forEach((listener) => {
                try {
                    listener(`${payload.value || ''}`);
                } catch (error) {
                    // Ignore listener errors to keep the bridge stable.
                }
            });
        });

        return {
            isExtensionBacked: true,
            get(key) {
                return request('get', key);
            },
            set(key, value) {
                return request('set', key, value);
            },
            remove(key) {
                return request('remove', key);
            },
            subscribe(key, listener) {
                const storageKey = storageKeyFor(key);
                const listeners = listenersByKey.get(storageKey) || new Set();
                listeners.add(listener);
                listenersByKey.set(storageKey, listeners);
                return () => {
                    const current = listenersByKey.get(storageKey);
                    if (!current) {
                        return;
                    }
                    current.delete(listener);
                    if (current.size === 0) {
                        listenersByKey.delete(storageKey);
                    }
                };
            }
        };
    }

    function createHost(config = {}) {
        const platform = detectPlatform();
        const appId = `${config.appId || 'page'}`.trim() || 'page';
        const apiBaseUrl = `${config.apiBaseUrl || ''}`.replace(/\/+$/, '');
        const learningSessionScope = config.learningSessionScope && typeof config.learningSessionScope === 'object'
            ? { ...config.learningSessionScope }
            : {
                id: `${config.learningSessionScopeId || appId}`.trim() || appId,
                mode: `${config.learningSessionScopeMode || 'app'}`.trim() || 'app',
                brandToken: `${config.learningSessionScopeBrand || ''}`.trim(),
                journeyToken: `${config.learningSessionScopeJourney || ''}`.trim()
            };
        const cacheKey = JSON.stringify({
            platform,
            appId,
            apiBaseUrl,
            learningSessionScopeId: learningSessionScope.id,
            learningSessionScopeMode: learningSessionScope.mode
        });
        if (hostCache.has(cacheKey)) {
            return hostCache.get(cacheKey);
        }
        const globalStore = canUseExtensionBridge()
            ? createExtensionBridgeStore(learningSessionScope.id)
            : null;

        const createdHost = {
            platform,
            appId,
            apiBaseUrl,
            learningSessionScope,
            fetchImpl: typeof window !== 'undefined' ? window.fetch.bind(window) : null,
            globalStore,
            localStore: createStorage(`${platform}:${appId}:local`, window.localStorage),
            sessionStore: createStorage(`${platform}:${appId}:session`, window.sessionStorage)
        };
        hostCache.set(cacheKey, createdHost);
        return createdHost;
    }

    window.GraphPluginHost = {
        createHost,
        detectPlatform
    };
})();
