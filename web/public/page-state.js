(function () {
    function createStateManager(config = {}) {
        const storageKey = (config.storageKey || 'graph-page-state-v1').trim();
        const excludedIds = new Set(config.excludedIds || ['agent-message', 'wf-desc', 'step-explanation']);

        // When true, a field is being written from a remote source (another device),
        // so local listeners must persist it but must NOT re-broadcast it (avoids echo loops).
        let applyingRemote = false;

        function getSyncHook() {
            return (typeof window !== 'undefined' && window.MiracleNoteSync) || null;
        }

        function notifyFieldChange(id, value) {
            try {
                if (typeof config.onFieldChange === 'function') {
                    config.onFieldChange(id, value);
                }
                getSyncHook()?.onLocalFieldChange?.(id, value);
            } catch (error) {
                console.warn('[Page State] Field change hook failed:', error);
            }
        }

        function isPersistableField(element) {
            if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
                return false;
            }

            if (!element.id || excludedIds.has(element.id)) {
                return false;
            }

            if (element.type === 'button' || element.type === 'submit' || element.type === 'reset' || element.type === 'file') {
                return false;
            }

            if (element.closest('.console')) {
                return false;
            }

            return true;
        }

        function readState() {
            try {
                return JSON.parse(localStorage.getItem(storageKey) || '{}');
            } catch (error) {
                console.warn('[Page State] Could not read persisted state:', error);
                return {};
            }
        }

        function writeState(state) {
            try {
                localStorage.setItem(storageKey, JSON.stringify(state));
            } catch (error) {
                console.warn('[Page State] Could not write persisted state:', error);
            }
        }

        function saveField(element) {
            const state = readState();
            const value = element.type === 'checkbox' || element.type === 'radio'
                ? element.checked
                : element.value;
            state[element.id] = value;
            writeState(state);
            if (!applyingRemote) {
                notifyFieldChange(element.id, value);
            }
        }

        function restoreField(element, state) {
            if (!(element.id in state)) {
                return;
            }

            const value = state[element.id];
            if (element.type === 'checkbox' || element.type === 'radio') {
                element.checked = Boolean(value);
                return;
            }

            element.value = value ?? '';
        }

        function clearPersistedFields() {
            document.querySelectorAll('input[id], textarea[id], select[id]').forEach((element) => {
                if (!isPersistableField(element)) {
                    return;
                }

                if (element.type === 'checkbox' || element.type === 'radio') {
                    element.checked = false;
                } else {
                    element.value = '';
                }

                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }

        function hydrate() {
            const state = readState();
            document.querySelectorAll('input[id], textarea[id], select[id]').forEach((element) => {
                if (!isPersistableField(element)) {
                    return;
                }

                restoreField(element, state);
                element.addEventListener('input', () => saveField(element));
                element.addEventListener('change', () => saveField(element));
            });

            try {
                if (typeof config.onReady === 'function') {
                    config.onReady(api);
                }
                getSyncHook()?.attach?.(api);
            } catch (error) {
                console.warn('[Page State] Ready hook failed:', error);
            }
        }

        const api = {
            clear() {
                try {
                    localStorage.removeItem(storageKey);
                } catch (error) {
                    console.warn('[Page State] Could not clear persisted state:', error);
                }
            },
            clearAll() {
                this.clear();
                clearPersistedFields();
            },
            hydrate,
            saveAll() {
                document.querySelectorAll('input[id], textarea[id], select[id]').forEach((element) => {
                    if (isPersistableField(element)) {
                        saveField(element);
                    }
                });
            },
            getState() {
                return readState();
            },
            // Apply a single field value coming from another device. Persists locally
            // and updates the DOM, but does not re-broadcast (guarded by applyingRemote).
            applyRemoteField(id, value) {
                const element = document.getElementById(id);
                if (!element || !isPersistableField(element)) {
                    return false;
                }
                // Never yank a field the user is actively editing on this device.
                if (document.activeElement === element) {
                    return false;
                }
                applyingRemote = true;
                try {
                    if (element.type === 'checkbox' || element.type === 'radio') {
                        element.checked = Boolean(value);
                    } else {
                        element.value = value ?? '';
                    }
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                } finally {
                    applyingRemote = false;
                }
                return true;
            },
            // Apply a full { fieldId: value } map (e.g. initial load from the server).
            applyRemoteState(state) {
                if (!state || typeof state !== 'object') {
                    return;
                }
                Object.keys(state).forEach((id) => api.applyRemoteField(id, state[id]));
            }
        };

        return api;
    }

    window.PageState = {
        current: null,
        init(config = {}) {
            this.current = createStateManager(config);
            const hydrate = () => this.current && this.current.hydrate();

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', hydrate, { once: true });
            } else {
                hydrate();
            }

            window.EMRState = this.current;
            return this.current;
        },
        clear() {
            this.current?.clear();
        },
        clearAll() {
            this.current?.clearAll();
        },
        hydrate() {
            this.current?.hydrate();
        },
        saveAll() {
            this.current?.saveAll();
        }
    };
})();
