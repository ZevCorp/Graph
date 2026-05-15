(function () {
    const listeners = new Map();

    function on(eventName, handler) {
        if (!eventName || typeof handler !== 'function') {
            return function noop() {};
        }

        if (!listeners.has(eventName)) {
            listeners.set(eventName, new Set());
        }
        listeners.get(eventName).add(handler);

        return function unsubscribe() {
            listeners.get(eventName)?.delete(handler);
        };
    }

    function emit(eventName, payload) {
        const normalizedPayload = payload && typeof payload === 'object'
            ? payload
            : { value: payload };

        const handlers = Array.from(listeners.get(eventName) || []);
        handlers.forEach((handler) => {
            try {
                handler(normalizedPayload);
            } catch (error) {
                console.warn('[GraphPluginEvents] listener error', error);
            }
        });

        try {
            document.dispatchEvent(new CustomEvent(`graph:${eventName}`, {
                detail: normalizedPayload
            }));
        } catch (error) {
            // Ignore environments without CustomEvent support.
        }
    }

    window.GraphPluginEvents = {
        on,
        emit
    };
})();
