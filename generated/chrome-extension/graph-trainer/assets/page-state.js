(function () {
    function createStateManager(config = {}) {
        const storageKey = (config.storageKey || 'graph-page-state-v1').trim();
        const excludedIds = new Set(config.excludedIds || ['agent-message', 'wf-desc', 'step-explanation']);

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
            state[element.id] = element.type === 'checkbox' || element.type === 'radio'
                ? element.checked
                : element.value;
            writeState(state);
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
        }

        return {
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
            }
        };
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
