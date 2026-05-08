(function () {
    const STORAGE_KEY = 'graph-emr-form-state-v1';
    const EXCLUDED_IDS = new Set(['agent-message', 'wf-desc', 'step-explanation']);

    function isPersistableField(element) {
        if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
            return false;
        }

        if (!element.id || EXCLUDED_IDS.has(element.id)) {
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
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch (error) {
            console.warn('[EMR State] Could not read persisted state:', error);
            return {};
        }
    }

    function writeState(state) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            console.warn('[EMR State] Could not write persisted state:', error);
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hydrate, { once: true });
    } else {
        hydrate();
    }

    window.EMRState = {
        clear() {
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch (error) {
                console.warn('[EMR State] Could not clear persisted state:', error);
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
})();
