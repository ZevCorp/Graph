(function () {
    function normalizeBaseUrl(value) {
        return `${value || ''}`.replace(/\/+$/, '');
    }

    function buildUrl(baseUrl, path) {
        const normalizedBase = normalizeBaseUrl(baseUrl);
        if (!normalizedBase) {
            return path;
        }
        if (/^https?:\/\//i.test(path)) {
            return path;
        }
        return `${normalizedBase}${path.startsWith('/') ? path : `/${path}`}`;
    }

    function createJsonRequest(baseUrl, path, init) {
        return fetch(buildUrl(baseUrl, path), init).then(async (response) => {
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || `Request failed: ${path}`);
            }
            return payload;
        });
    }

    function createClient(config) {
        const baseUrl = normalizeBaseUrl(config?.baseUrl || '');
        const fetchImpl = typeof config?.fetchImpl === 'function'
            ? config.fetchImpl
            : fetch;

        return {
            listWorkflows() {
                return createJsonRequest(baseUrl, '/api/workflows', {});
            },
            getRecorderStatus() {
                return createJsonRequest(baseUrl, '/api/status', {});
            },
            startWorkflow(description, context) {
                return createJsonRequest(baseUrl, '/api/workflow/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        description: description || '',
                        context: context || {}
                    })
                });
            },
            appendWorkflowStep(step) {
                return createJsonRequest(baseUrl, '/api/step', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(step || {})
                });
            },
            stopWorkflow() {
                return createJsonRequest(baseUrl, '/api/workflow/stop', {
                    method: 'POST'
                });
            },
            resetWorkflow() {
                return createJsonRequest(baseUrl, '/api/reset', {
                    method: 'POST'
                });
            },
            deleteWorkflow(workflowId) {
                return createJsonRequest(baseUrl, `/api/workflows/${encodeURIComponent(workflowId)}`, {
                    method: 'DELETE'
                });
            },
            appendWorkflowContextNote(note) {
                return createJsonRequest(baseUrl, '/api/workflow/context-note', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        note: note || {}
                    })
                });
            },
            getExecutionPlan(workflowId, variables, context) {
                return createJsonRequest(baseUrl, `/api/workflows/${encodeURIComponent(workflowId)}/plan`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        variables: variables || {},
                        context: context || {}
                    })
                });
            },
            sendAgentMessage(message, history, context) {
                return createJsonRequest(baseUrl, '/api/agent/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message,
                        history: history || [],
                        context: context || {},
                        executionMode: 'browser'
                    })
                });
            },
            generatePitchArtifacts(payload) {
                return createJsonRequest(baseUrl, '/api/pitch/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload || {})
                });
            },
            createPhoneSession(payload) {
                return createJsonRequest(baseUrl, '/api/voice/phone-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload || {})
                });
            },
            processVoiceComplaints(payload) {
                return createJsonRequest(baseUrl, '/api/voice/complaints/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload || {})
                });
            },
            createOpenAiRealtimeSession(sdp, headers) {
                return fetchImpl(buildUrl(baseUrl, '/api/voice/openai/session'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/sdp',
                        ...(headers || {})
                    },
                    body: sdp
                });
            }
        };
    }

    window.GraphPluginApi = {
        createClient
    };
})();
