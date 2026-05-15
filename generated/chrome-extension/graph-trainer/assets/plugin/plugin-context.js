(function () {
    function resolveAdapter(config) {
        return window.GraphPluginAdapters?.resolve?.(config) || null;
    }

    function buildPageContext(config, overrides) {
        const adapter = resolveAdapter(config);
        const baseContext = {
            appId: config?.appId || '',
            sourceUrl: window.location.href,
            sourceOrigin: window.location.origin,
            sourcePathname: window.location.pathname,
            sourceTitle: document.title,
            assistantProfile: config?.assistantProfile || null
        };

        const merged = {
            ...baseContext,
            ...(overrides || {})
        };

        if (!adapter || typeof adapter.decorateContext !== 'function') {
            return merged;
        }

        return adapter.decorateContext(merged);
    }

    function filterWorkflows(workflows, config, contextOverrides) {
        const adapter = resolveAdapter(config);
        const context = buildPageContext(config, contextOverrides);
        if (!adapter || typeof adapter.filterWorkflows !== 'function') {
            return workflows || [];
        }
        return adapter.filterWorkflows(workflows || [], context);
    }

    window.GraphPluginContext = {
        buildPageContext,
        filterWorkflows
    };
})();
