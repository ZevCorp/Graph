(function () {
    const DEFAULTS = {
        workflowDescription: '',
        title: 'Trainer',
        aiPlaceholder: 'Ask AI to execute a saved flow',
        autoSyncStatus: true,
        apiBaseUrl: '',
        adapter: null,
        assistantProfile: null,
        assistantRuntime: {
            name: 'Graph',
            accentColor: '#0f5f8c',
            idleMessage: 'Puedo ayudarte con esta pagina cuando quieras.'
        }
    };

    const LONG_PRESS_MS = 650;

    let options = { ...DEFAULTS };
    let agentHistory = [];
    let mounted = false;
    let workflowPanelLoaded = false;
    let improvementPanelLoaded = false;
    let longPressTimer = null;
    let longPressTriggered = false;
    let runtimeTouchBound = false;
    let assistantPhonePairingBound = false;
    let feedbackOverlayVisible = false;
    let assistantPhonePairingFrame = null;
    const voiceState = {
        active: false,
        peerConnection: null,
        dataChannel: null,
        stream: null,
        remoteAudio: null,
        playbackContext: null,
        playbackSources: new Set(),
        nextPlaybackTime: 0,
        ttsSampleRate: 24000,
        phoneSession: null,
        processedFunctionCalls: new Set(),
        assistantTranscript: new Map(),
        lastUserTranscript: '',
        lastUserTranscriptAt: 0,
        lastAssistantTranscript: '',
        lastAssistantTranscriptAt: 0
    };
    const greetingState = {
        playing: false,
        lastPlayedAt: 0
    };
    const executionState = {
        running: false
    };
    const EXECUTION_STORAGE_PREFIX = 'graph-browser-workflow-execution-v1';
    const PHONE_MIC_SESSION_STORAGE_KEY = 'graph-phone-mic-session-id';
    const EXECUTION_WAIT_TIMEOUT_MS = 15000;
    const EXECUTION_STEP_DELAY_MS = 180;

    function voiceLog(event, details) {
        if (details !== undefined) {
            console.log(`[VoiceUI] ${event}`, details);
            return;
        }
        console.log(`[VoiceUI] ${event}`);
    }

    function pluginHost() {
        return options?.host
            || window.GraphPluginHost?.createHost?.(options)
            || null;
    }

    function getRealtimeSocketUrl() {
        const baseUrl = pluginHost()?.apiBaseUrl || options.apiBaseUrl || '';
        if (baseUrl) {
            try {
                const parsed = new URL(baseUrl, window.location.href);
                const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
                return `${protocol}//${parsed.host}/api/voice/realtime`;
            } catch (error) {
                // Fall through to current page origin.
            }
        }

        const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${socketProtocol}//${window.location.host}/api/voice/realtime`;
    }

    function getStoredPhoneSessionId() {
        return pluginHost()?.localStore?.get(PHONE_MIC_SESSION_STORAGE_KEY) || '';
    }

    function setStoredPhoneSessionId(id) {
        if (!id) {
            pluginHost()?.localStore?.remove(PHONE_MIC_SESSION_STORAGE_KEY);
            return;
        }
        pluginHost()?.localStore?.set(PHONE_MIC_SESSION_STORAGE_KEY, id);
    }

    function runtime() {
        return window.GraphAssistantRuntime || null;
    }

    function pluginEvents() {
        return window.GraphPluginEvents || null;
    }

    function emitPluginEvent(eventName, payload) {
        pluginEvents()?.emit?.(eventName, payload || {});
    }

    function getSurfaceAdapter() {
        return options?.adapter || window.GraphPluginAdapters?.resolve?.(options) || null;
    }

    function buildMountOptions(config = {}) {
        const adapter = window.GraphPluginAdapters?.resolve?.(config) || null;
        const adapterDefaults = adapter?.mountDefaults || {};
        const host = window.GraphPluginHost?.createHost?.({
            ...adapterDefaults,
            ...config
        }) || null;
        return {
            ...DEFAULTS,
            ...adapterDefaults,
            ...config,
            assistantRuntime: {
                ...DEFAULTS.assistantRuntime,
                ...(adapterDefaults.assistantRuntime || {}),
                ...(config.assistantRuntime || {})
            },
            assistantProfile: config.assistantProfile || adapterDefaults.assistantProfile || DEFAULTS.assistantProfile,
            adapter,
            host
        };
    }

    function apiClient() {
        return window.GraphPluginApi?.createClient?.({
            baseUrl: pluginHost()?.apiBaseUrl || options.apiBaseUrl || '',
            fetchImpl: pluginHost()?.fetchImpl || null
        }) || null;
    }

    function requireApiClient() {
        const client = apiClient();
        if (!client) {
            throw new Error('No hay cliente API configurado para este plugin.');
        }
        return client;
    }

    async function persistLearningContextNote(note) {
        if (!note || !note.transcript) {
            return;
        }
        try {
            await requireApiClient().appendWorkflowContextNote(note);
        } catch (error) {
            console.warn('[LearningContext] Could not persist note:', error.message || error);
        }
    }

    function getPageContext() {
        const normalizePathname = window.GraphPluginAdapters?.normalizePathname;
        return window.GraphPluginContext?.buildPageContext?.(options) || {
            appId: options.appId || '',
            sourceUrl: window.location.href,
            sourceOrigin: window.location.origin,
            sourcePathname: typeof normalizePathname === 'function'
                ? normalizePathname(window.location.pathname)
                : window.location.pathname,
            sourceTitle: document.title,
            assistantProfile: options.assistantProfile || null
        };
    }

    function ensureStyles() {
        if (document.getElementById('trainer-plugin-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'trainer-plugin-styles';
        style.textContent = `
            .console {
                position: fixed;
                left: 50%;
                bottom: 18px;
                transform: translateX(-50%);
                width: auto;
                min-width: 124px;
                padding: 10px 12px;
                z-index: 50;
                background: rgba(255,255,255,0.95);
                backdrop-filter: blur(18px);
                display: grid;
                gap: 10px;
                justify-items: center;
                border-radius: 999px;
                transition: width 180ms ease, border-radius 180ms ease, padding 180ms ease;
                border: 1px solid rgba(24, 39, 53, 0.12);
                box-shadow: 0 20px 48px rgba(16, 31, 44, 0.12);
            }
            .console.compact-open {
                border-radius: 24px;
                width: min(560px, calc(100vw - 24px));
            }
            .console-toolbar {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
            }
            .console button.icon-btn {
                width: 46px;
                height: 46px;
                border-radius: 999px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                flex: 0 0 auto;
                border: none;
                cursor: pointer;
                font: inherit;
            }
            .console button.icon-btn svg {
                width: 20px;
                height: 20px;
            }
            #btn-record-toggle[data-recording="true"] {
                background: #1b6b4b;
                color: white;
            }
            #btn-record-toggle[data-recording="false"] {
                background: #0f5f8c;
                color: white;
            }
            #pitch-generate {
                background: #fff4dd;
                color: #8a4b08;
            }
            #pitch-generate[data-active="true"] {
                background: #8a4b08;
                color: white;
            }
            #agent-send {
                background: #e8f1f7;
                color: #0f5f8c;
            }
            #voice-toggle {
                background: #e7f8ef;
                color: #18794e;
            }
            #voice-toggle[data-active="true"] {
                background: #18794e;
                color: white;
            }
            .console-chat,
            .workflow-panel,
            .improvement-panel {
                display: none;
                width: 100%;
            }
            .console-chat.open,
            .workflow-panel.open,
            .improvement-panel.open {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .console-chat-log {
                max-height: 220px;
                overflow: auto;
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding-right: 4px;
            }
            .chat-bubble {
                white-space: pre-wrap;
                line-height: 1.45;
                font-size: 13px;
                padding: 10px 12px;
                border-radius: 14px;
                background: #f5f8fb;
                color: #1d2a33;
            }
            .chat-bubble.user {
                background: #0f5f8c;
                color: white;
                align-self: flex-end;
            }
            .chat-meta {
                display: block;
                margin-top: 6px;
                font-size: 11px;
                opacity: 0.8;
            }
            #agent-message {
                width: 100%;
                min-height: 44px;
                max-height: 120px;
                resize: vertical;
                border: 1px solid #c8d3dd;
                border-radius: 14px;
                padding: 12px;
                font: inherit;
            }
            .voice-status {
                min-height: 18px;
                color: #526170;
                font-size: 12px;
                line-height: 1.4;
            }
            .phone-mic-pairing {
                display: none;
                grid-template-columns: 132px 1fr;
                gap: 12px;
                align-items: center;
                padding: 10px;
                border: 1px solid #d8e2ec;
                border-radius: 16px;
                background: #f9fbfd;
            }
            .phone-mic-pairing.open {
                display: grid;
            }
            .phone-mic-pairing img {
                width: 132px;
                height: 132px;
                border-radius: 10px;
                background: white;
            }
            .phone-mic-pairing-text {
                display: grid;
                gap: 8px;
                color: #1d2a33;
                font-size: 12px;
                line-height: 1.45;
                min-width: 0;
            }
            .phone-mic-pairing-url {
                overflow-wrap: anywhere;
                color: #0f5f8c;
                font-weight: 700;
            }
            .assistant-phone-mic-pairing {
                position: fixed;
                display: none;
                width: min(320px, calc(100vw - 32px));
                padding: 12px;
                border-radius: 20px;
                background: rgba(255, 255, 255, 0.97);
                border: 1px solid rgba(15, 95, 140, 0.14);
                box-shadow: 0 28px 60px rgba(12, 28, 43, 0.22);
                backdrop-filter: blur(18px);
                z-index: 2147483004;
                grid-template-columns: 108px 1fr;
                gap: 12px;
                align-items: center;
            }
            .assistant-phone-mic-pairing.open {
                display: grid;
            }
            .assistant-phone-mic-pairing img {
                width: 108px;
                height: 108px;
                border-radius: 12px;
                background: #fff;
            }
            .assistant-phone-mic-pairing-text {
                display: grid;
                gap: 7px;
                min-width: 0;
                color: #1d2a33;
                font-size: 12px;
                line-height: 1.45;
            }
            .assistant-phone-mic-pairing-text strong {
                font-size: 13px;
            }
            .assistant-phone-mic-pairing-url {
                overflow-wrap: anywhere;
                color: #0f5f8c;
                font-weight: 700;
            }
            .workflow-panel {
                padding-top: 2px;
            }
            .improvement-panel {
                padding-top: 2px;
            }
            .workflow-panel-header,
            .improvement-panel-header,
            .workflow-panel-empty,
            .workflow-panel-status,
            .improvement-panel-empty,
            .improvement-panel-status,
            .improvement-panel-footnote {
                color: #1d2a33;
                font-size: 13px;
            }
            .workflow-panel-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
            }
            .improvement-panel-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
            }
            .workflow-panel-header strong {
                font-size: 14px;
            }
            .improvement-panel-header strong {
                font-size: 14px;
            }
            .workflow-panel-header button,
            .improvement-panel-header button,
            .workflow-item-actions button {
                border: none;
                border-radius: 999px;
                padding: 8px 12px;
                cursor: pointer;
                font: inherit;
                font-size: 12px;
                font-weight: 700;
            }
            .workflow-panel-header button {
                background: #edf4fa;
                color: #0f5f8c;
            }
            .improvement-panel-header button {
                background: #fff4dd;
                color: #8a4b08;
            }
            .improvement-panel-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .improvement-panel-actions button {
                border: none;
                border-radius: 999px;
                padding: 9px 12px;
                cursor: pointer;
                font: inherit;
                font-size: 12px;
                font-weight: 700;
            }
            .improvement-panel-actions button[data-action="toggle-overlay"] {
                background: #fff1d6;
                color: #8a4b08;
            }
            .improvement-panel-actions button[data-action="run-pitch"] {
                background: #8a4b08;
                color: white;
            }
            .improvement-panel-actions button:disabled {
                opacity: 0.65;
                cursor: wait;
            }
            .workflow-panel-list {
                max-height: 260px;
                overflow: auto;
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding-right: 4px;
            }
            .improvement-panel-list {
                max-height: 280px;
                overflow: auto;
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding-right: 4px;
            }
            .workflow-item {
                border: 1px solid #d8e2ec;
                border-radius: 16px;
                padding: 12px;
                background: #f9fbfd;
                display: grid;
                gap: 8px;
            }
            .improvement-item {
                border: 1px solid rgba(15, 23, 42, 0.08);
                border-radius: 22px;
                padding: 16px;
                background:
                    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(252, 249, 245, 0.98) 100%),
                    radial-gradient(circle at top left, rgba(245, 158, 11, 0.12), transparent 36%);
                box-shadow: 0 24px 48px rgba(15, 23, 42, 0.08);
                display: grid;
                gap: 12px;
            }
            .workflow-item-title {
                margin: 0;
                font-size: 13px;
                font-weight: 800;
                color: #1b2733;
            }
            .improvement-item-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 12px;
            }
            .improvement-item-eyebrow {
                display: inline-flex;
                align-items: center;
                width: fit-content;
                padding: 5px 10px;
                border-radius: 999px;
                background: rgba(255, 247, 237, 0.95);
                color: #9a3412;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }
            .improvement-item-title {
                margin: 0;
                font-size: 16px;
                font-weight: 700;
                line-height: 1.25;
                letter-spacing: -0.02em;
                color: #111827;
            }
            .workflow-item-meta {
                font-size: 12px;
                color: #526170;
                line-height: 1.45;
            }
            .improvement-item-meta {
                font-size: 13px;
                color: #4b5563;
                line-height: 1.6;
                display: grid;
                gap: 10px;
            }
            .improvement-item-quote {
                margin: 0;
                padding: 12px 14px;
                border-radius: 16px;
                background: rgba(255, 250, 245, 0.95);
                border: 1px solid rgba(245, 158, 11, 0.18);
                color: #7c2d12;
                font-size: 13px;
                line-height: 1.6;
            }
            .improvement-item-quote-label,
            .improvement-item-recommendation-label {
                display: block;
                margin-bottom: 4px;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: #9ca3af;
            }
            .improvement-item-recommendation {
                padding: 14px 16px;
                border-radius: 18px;
                background: rgba(248, 250, 252, 0.96);
                border: 1px solid rgba(148, 163, 184, 0.18);
                color: #111827;
                font-size: 13px;
                line-height: 1.6;
            }
            .improvement-item-target {
                font-size: 11px;
                color: #9ca3af;
                word-break: break-word;
            }
            .improvement-item-pill {
                display: inline-flex;
                align-items: center;
                width: fit-content;
                padding: 5px 9px;
                border-radius: 999px;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                background: rgba(17, 24, 39, 0.06);
                color: #111827;
            }
            .improvement-item-pill[data-priority="alta"] {
                background: rgba(239, 68, 68, 0.1);
                color: #b91c1c;
            }
            .improvement-item-pill[data-priority="media"] {
                background: rgba(245, 158, 11, 0.14);
                color: #b45309;
            }
            .improvement-item-pill[data-priority="baja"] {
                background: rgba(59, 130, 246, 0.1);
                color: #1d4ed8;
            }
            .improvement-panel-footnote {
                padding: 14px 16px;
                border-radius: 18px;
                background: rgba(248, 250, 252, 0.96);
                border: 1px solid rgba(148, 163, 184, 0.16);
                color: #475569;
                line-height: 1.55;
                font-size: 12px;
            }
            .workflow-item-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
            }
            .workflow-item-actions .run-btn {
                background: #0f5f8c;
                color: white;
            }
            .workflow-item-actions .copy-btn {
                background: #e7eff6;
                color: #21415a;
            }
            .workflow-item-actions .delete-btn {
                background: #fff1f1;
                color: #b42318;
            }
            .sr-only {
                position: absolute;
                width: 1px;
                height: 1px;
                padding: 0;
                margin: -1px;
                overflow: hidden;
                clip: rect(0, 0, 0, 0);
                white-space: nowrap;
                border: 0;
            }
            .feedback-overlay {
                position: absolute;
                inset: 0;
                pointer-events: none;
                z-index: 2147482998;
            }
            .feedback-overlay[hidden] {
                display: none;
            }
            .feedback-pin {
                position: absolute;
                transform: translate(-10px, -10px);
                display: grid;
                gap: 10px;
                align-items: start;
                max-width: min(320px, calc(100vw - 40px));
            }
            .feedback-pin[data-side="left"] {
                justify-items: end;
            }
            .feedback-dot {
                width: 24px;
                height: 24px;
                border-radius: 999px;
                background: linear-gradient(180deg, #111827 0%, #374151 100%);
                color: white;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: -0.02em;
                box-shadow: 0 14px 36px rgba(15, 23, 42, 0.22);
                border: 1px solid rgba(255, 255, 255, 0.9);
            }
            .feedback-card {
                pointer-events: auto;
                background: rgba(255, 255, 255, 0.82);
                backdrop-filter: blur(18px);
                border: 1px solid rgba(255, 255, 255, 0.7);
                border-radius: 22px;
                padding: 14px 16px;
                box-shadow: 0 28px 56px rgba(15, 23, 42, 0.16);
                color: #111827;
                line-height: 1.55;
            }
            .feedback-card-eyebrow {
                display: inline-flex;
                align-items: center;
                width: fit-content;
                margin-bottom: 8px;
                padding: 5px 10px;
                border-radius: 999px;
                background: rgba(248, 250, 252, 0.96);
                border: 1px solid rgba(148, 163, 184, 0.16);
                color: #64748b;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }
            .feedback-card strong {
                display: block;
                font-size: 15px;
                font-weight: 700;
                letter-spacing: -0.02em;
                margin-bottom: 8px;
            }
            .feedback-card blockquote {
                margin: 0;
                padding: 0;
                display: block;
                font-size: 13px;
                color: #475569;
                line-height: 1.6;
            }
            .feedback-card small {
                display: block;
                margin-top: 10px;
                font-size: 11px;
                color: #111827;
                line-height: 1.55;
            }
            @media (max-width: 768px) {
                .feedback-pin {
                    max-width: min(240px, calc(100vw - 32px));
                }
                .feedback-card {
                    padding: 12px 13px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function ensureConsole() {
        let consoleEl = document.getElementById('teaching-console');
        if (consoleEl) {
            return consoleEl;
        }

        consoleEl = document.createElement('section');
        consoleEl.className = 'console';
        consoleEl.id = 'teaching-console';
        consoleEl.innerHTML = `
            <div class="workflow-panel" id="workflow-panel" aria-live="polite">
                <div class="workflow-panel-header">
                    <div>
                        <strong>Workflows de esta pagina</strong>
                        <div class="workflow-panel-status" id="workflow-panel-status">Manten el lapiz oprimido para ver los flujos grabados aqui.</div>
                    </div>
                    <button id="workflow-panel-refresh" type="button">Actualizar</button>
                </div>
                <div class="workflow-panel-list" id="workflow-panel-list"></div>
                <div class="workflow-panel-empty" id="workflow-panel-empty" hidden>No hay workflows grabados para esta pagina todavia.</div>
            </div>
            <div class="improvement-panel" id="improvement-panel" aria-live="polite">
                <div class="improvement-panel-header">
                    <div>
                        <strong>Feedback visible sobre la pagina</strong>
                        <div class="improvement-panel-status" id="improvement-panel-status">Manten este boton oprimido para ver comentarios y acciones de mejora.</div>
                    </div>
                    <button id="improvement-panel-refresh" type="button">Actualizar</button>
                </div>
                <div class="improvement-panel-actions">
                    <button type="button" data-action="toggle-overlay" id="feedback-overlay-toggle">Mostrar puntos en la pagina</button>
                    <button type="button" data-action="run-pitch" id="improvement-run-pitch">Generar pitch</button>
                </div>
                <div class="improvement-panel-list" id="improvement-panel-list"></div>
                <div class="improvement-panel-empty" id="improvement-panel-empty" hidden>No hay sugerencias disponibles para esta pagina todavia.</div>
                <div class="improvement-panel-footnote" id="improvement-panel-footnote">
                    Esta capa resume fricciones y oportunidades de claridad detectadas para la experiencia actual. Mas adelante la conectaremos con feedback real y señales observadas en produccion.
                </div>
            </div>
            <div class="console-chat" id="console-chat">
                <div class="console-chat-log" id="console-chat-log" aria-live="polite" aria-label="AI chat messages"></div>
                <div class="voice-status" id="voice-status"></div>
                <div class="phone-mic-pairing" id="phone-mic-pairing">
                    <img id="phone-mic-qr" alt="QR para sincronizar microfono del telefono">
                    <div class="phone-mic-pairing-text">
                        <strong>Microfono del telefono</strong>
                        <span>Escanea el QR, activa el microfono en el telefono y deja esta pagina abierta.</span>
                        <span class="phone-mic-pairing-url" id="phone-mic-url"></span>
                    </div>
                </div>
                <div class="assistant-phone-mic-pairing" id="assistant-phone-mic-pairing" aria-live="polite">
                    <img id="assistant-phone-mic-qr" alt="QR para conectar el telefono como microfono">
                    <div class="assistant-phone-mic-pairing-text">
                        <strong>Usa tu telefono como microfono</strong>
                        <span>Escanea este QR y activa el microfono desde el telefono sin salir de esta pagina.</span>
                        <span class="assistant-phone-mic-pairing-url" id="assistant-phone-mic-url"></span>
                    </div>
                </div>
                <textarea id="agent-message" rows="1" placeholder=""></textarea>
            </div>
            <div class="console-toolbar">
                <button class="icon-btn" id="pitch-generate" type="button" title="Generate pitch artifacts" aria-label="Generate pitch artifacts">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.8 4.7L18.5 8l-4 2.9 1.5 4.8-4-2.9-4 2.9 1.5-4.8-4-2.9 4.7-1.3L12 2z" fill="currentColor"/></svg>
                </button>
                <button class="icon-btn" id="btn-record-toggle" type="button" title="Start recording" aria-label="Toggle recording" aria-pressed="false" data-recording="false"></button>
                <button class="icon-btn" id="voice-toggle" type="button" title="Conversacion de voz" aria-label="Conversacion de voz" aria-pressed="false" data-active="false">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm6-3a6 6 0 0 1-12 0M12 17v4m-4 0h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <button class="icon-btn" id="agent-send" type="button" title="Open AI chat" aria-label="Open AI chat">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v10H7l-3 3V5z" fill="currentColor"/></svg>
                </button>
            </div>
            <input id="wf-desc" class="sr-only" value="">
            <textarea id="step-explanation" class="sr-only"></textarea>
            <div id="recording-status" class="sr-only">Idle</div>
            <button id="btn-start" class="sr-only" type="button">Start</button>
            <button id="btn-stop" class="sr-only" type="button">Stop</button>
        `;
        document.body.appendChild(consoleEl);
        ensureFeedbackOverlay();
        return consoleEl;
    }

    function ensureFeedbackOverlay() {
        let overlay = document.getElementById('feedback-overlay');
        if (overlay) {
            return overlay;
        }

        overlay = document.createElement('div');
        overlay.className = 'feedback-overlay';
        overlay.id = 'feedback-overlay';
        overlay.hidden = true;
        document.body.appendChild(overlay);
        return overlay;
    }

    function updateConsoleExpandedState() {
        const consoleEl = document.getElementById('teaching-console');
        const chat = document.getElementById('console-chat');
        const panel = document.getElementById('workflow-panel');
        const improvementPanel = document.getElementById('improvement-panel');
        if (!consoleEl || !chat || !panel || !improvementPanel) return;

        const shouldExpand = chat.classList.contains('open')
            || panel.classList.contains('open')
            || improvementPanel.classList.contains('open');
        consoleEl.classList.toggle('compact-open', shouldExpand);
    }

    function closeWorkflowPanel() {
        const panel = document.getElementById('workflow-panel');
        if (!panel) return;
        panel.classList.remove('open');
        updateConsoleExpandedState();
    }

    function closeImprovementPanel() {
        const panel = document.getElementById('improvement-panel');
        if (!panel) return;
        panel.classList.remove('open');
        updateConsoleExpandedState();
    }

    function openChatPanel() {
        const chat = document.getElementById('console-chat');
        const textarea = document.getElementById('agent-message');
        if (!chat) return;

        closeWorkflowPanel();
        closeImprovementPanel();
        chat.classList.add('open');
        updateConsoleExpandedState();
        runtime()?.speak('Estoy listo para ayudarte con la reserva cuando quieras.', { mode: 'listening' });

        if (textarea) {
            textarea.focus();
        }
    }

    function openWorkflowPanel() {
        const panel = document.getElementById('workflow-panel');
        const chat = document.getElementById('console-chat');
        const improvementPanel = document.getElementById('improvement-panel');
        if (!panel || !chat || !improvementPanel) return;
        chat.classList.remove('open');
        improvementPanel.classList.remove('open');
        panel.classList.add('open');
        updateConsoleExpandedState();
    }

    function openImprovementPanel() {
        const panel = document.getElementById('improvement-panel');
        const chat = document.getElementById('console-chat');
        const workflowPanel = document.getElementById('workflow-panel');
        if (!panel || !chat || !workflowPanel) return;
        chat.classList.remove('open');
        workflowPanel.classList.remove('open');
        panel.classList.add('open');
        updateConsoleExpandedState();
    }

    function toggleWorkflowPanel() {
        const panel = document.getElementById('workflow-panel');
        if (!panel) return;
        if (panel.classList.contains('open')) {
            closeWorkflowPanel();
            return;
        }
        openWorkflowPanel();
        loadWorkflowPanel(true);
    }

    function toggleImprovementPanel() {
        const panel = document.getElementById('improvement-panel');
        if (!panel) return;
        if (panel.classList.contains('open')) {
            closeImprovementPanel();
            return;
        }
        openImprovementPanel();
        loadImprovementPanel(true);
    }

    function escapeHtml(value) {
        return `${value || ''}`
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function getMockFeedbackSuggestions() {
        const adapter = getSurfaceAdapter();
        if (!adapter || typeof adapter.getImprovementSuggestions !== 'function') {
            return [];
        }
        return adapter.getImprovementSuggestions(getPageContext()) || [];
    }

    function resolveFeedbackAnchors(suggestions) {
        return (suggestions || []).map((suggestion, index) => {
            const element = document.querySelector(suggestion.selector) || document.body;
            const rect = element.getBoundingClientRect();
            const safeHeight = Math.max(rect.height, 24);
            const safeWidth = Math.max(rect.width, 24);
            const top = rect.top + window.scrollY + Math.min(safeHeight * 0.22, safeHeight - 12);
            const left = rect.left + window.scrollX + Math.min(safeWidth * 0.12, safeWidth - 12);
            const side = rect.left > window.innerWidth * 0.56 ? 'left' : 'right';

            return {
                ...suggestion,
                order: index + 1,
                top,
                left,
                side
            };
        });
    }

    function updateFeedbackOverlayButton() {
        const toggle = document.getElementById('feedback-overlay-toggle');
        const pitchButton = document.getElementById('pitch-generate');
        if (toggle) {
            toggle.textContent = feedbackOverlayVisible ? 'Ocultar puntos en la pagina' : 'Mostrar puntos en la pagina';
        }
        if (pitchButton) {
            pitchButton.dataset.active = feedbackOverlayVisible ? 'true' : 'false';
            pitchButton.title = feedbackOverlayVisible ? 'Ocultar feedback de usuarios' : 'Mostrar feedback de usuarios';
            pitchButton.setAttribute('aria-label', pitchButton.title);
        }
    }

    function renderFeedbackOverlay() {
        const overlay = ensureFeedbackOverlay();
        const suggestions = resolveFeedbackAnchors(getMockFeedbackSuggestions());
        overlay.style.width = `${Math.max(document.body.scrollWidth, document.documentElement.scrollWidth)}px`;
        overlay.style.height = `${Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)}px`;
        overlay.innerHTML = '';

        suggestions.forEach((suggestion) => {
            const item = document.createElement('div');
            item.className = 'feedback-pin';
            item.dataset.side = suggestion.side;
            item.style.top = `${suggestion.top}px`;
            item.style.left = `${suggestion.left}px`;
            item.innerHTML = `
                <div class="feedback-dot">${suggestion.order}</div>
                <div class="feedback-card">
                    <div class="feedback-card-eyebrow">${escapeHtml(suggestion.area || 'Momento detectado')}</div>
                    <strong>${escapeHtml(suggestion.title || 'Comentario')}</strong>
                    <blockquote>${escapeHtml(suggestion.evidence || suggestion.summary || '')}</blockquote>
                    <small>${escapeHtml(suggestion.opportunity || '')}</small>
                </div>
            `;
            overlay.appendChild(item);
        });
    }

    function showFeedbackOverlay() {
        feedbackOverlayVisible = true;
        renderFeedbackOverlay();
        ensureFeedbackOverlay().hidden = false;
        updateFeedbackOverlayButton();
    }

    function hideFeedbackOverlay() {
        feedbackOverlayVisible = false;
        ensureFeedbackOverlay().hidden = true;
        updateFeedbackOverlayButton();
    }

    function toggleFeedbackOverlay() {
        if (feedbackOverlayVisible) {
            hideFeedbackOverlay();
            return;
        }
        showFeedbackOverlay();
    }

    function appendAgentMessage(role, text, meta, pushHistory = true) {
        const agentChatLog = document.getElementById('console-chat-log');
        if (!agentChatLog) return;

        if (pushHistory) {
            agentHistory.push({ role, content: text });
        }

        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${role === 'user' ? 'user' : 'assistant'}`;
        bubble.textContent = text;

        if (meta) {
            const metaEl = document.createElement('span');
            metaEl.className = 'chat-meta';
            metaEl.textContent = meta;
            bubble.appendChild(metaEl);
        }

        agentChatLog.appendChild(bubble);
        agentChatLog.scrollTop = agentChatLog.scrollHeight;

        if (role === 'assistant' && text) {
            runtime()?.speak(text, { mode: 'assistant', audible: true });
        }
    }

    function statusField() {
        return document.getElementById('recording-status');
    }

    function updateWorkflowPanelStatus(text) {
        const status = document.getElementById('workflow-panel-status');
        if (status) {
            status.textContent = text;
        }
    }

    function updateImprovementPanelStatus(text) {
        const status = document.getElementById('improvement-panel-status');
        if (status) {
            status.textContent = text;
        }
    }

    function updateVoiceStatus(text) {
        const status = document.getElementById('voice-status');
        if (status) {
            status.textContent = text || '';
        }
    }

    function setVoiceButton(active) {
        const button = document.getElementById('voice-toggle');
        if (!button) return;
        button.dataset.active = active ? 'true' : 'false';
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.title = active ? 'Detener conversacion de voz' : 'Conversacion de voz';
        runtime()?.setVoiceButtonActive?.(active);
    }

    function setPhonePairingVisible(visible) {
        const panel = document.getElementById('phone-mic-pairing');
        if (panel) {
            panel.classList.toggle('open', Boolean(visible));
        }
        const floatingPanel = document.getElementById('assistant-phone-mic-pairing');
        if (floatingPanel) {
            floatingPanel.classList.toggle('open', Boolean(visible));
        }
        if (visible) {
            positionAssistantPhonePairing();
            scheduleAssistantPhonePairingPosition();
            return;
        }
        if (assistantPhonePairingFrame) {
            window.cancelAnimationFrame(assistantPhonePairingFrame);
            assistantPhonePairingFrame = null;
        }
    }

    function positionAssistantPhonePairing() {
        const panel = document.getElementById('assistant-phone-mic-pairing');
        const shell = document.getElementById('graph-assistant-shell');
        if (!panel || !shell || !panel.classList.contains('open')) {
            return;
        }

        const shellRect = shell.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const gap = 22;
        const padding = 16;
        const hasRoomOnLeft = shellRect.left - panelRect.width - gap >= padding;
        const preferredLeft = hasRoomOnLeft
            ? shellRect.left - panelRect.width - gap
            : shellRect.right + gap;
        const rawTop = shellRect.top + Math.max(-16, (shellRect.height - panelRect.height) / 2);
        const maxLeft = Math.max(padding, window.innerWidth - panelRect.width - padding);
        const maxTop = Math.max(padding, window.innerHeight - panelRect.height - padding);

        panel.style.left = `${Math.min(maxLeft, Math.max(padding, preferredLeft))}px`;
        panel.style.top = `${Math.min(maxTop, Math.max(padding, rawTop))}px`;
    }

    function scheduleAssistantPhonePairingPosition() {
        if (assistantPhonePairingFrame) {
            return;
        }

        const tick = () => {
            assistantPhonePairingFrame = null;
            const panel = document.getElementById('assistant-phone-mic-pairing');
            if (!panel || !panel.classList.contains('open')) {
                return;
            }
            positionAssistantPhonePairing();
            assistantPhonePairingFrame = window.requestAnimationFrame(tick);
        };

        assistantPhonePairingFrame = window.requestAnimationFrame(tick);
    }

    function normalizePathname(value) {
        return window.GraphPluginAdapters?.normalizePathname?.(value)
            || `${value || ''}`.trim();
    }

    function filterWorkflowsForCurrentPage(workflows) {
        return window.GraphPluginContext?.filterWorkflows?.(workflows || [], options) || [];
    }

    function formatTimestamp(value) {
        if (!value) return 'Sin fecha';
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return 'Sin fecha';
        try {
            return new Date(numeric).toLocaleString();
        } catch (error) {
            return 'Sin fecha';
        }
    }

    function setWorkflowPanelLoadingState(isLoading) {
        const refresh = document.getElementById('workflow-panel-refresh');
        if (refresh) {
            refresh.disabled = isLoading;
            refresh.textContent = isLoading ? 'Cargando...' : 'Actualizar';
        }
    }

    function setImprovementPanelLoadingState(isLoading) {
        const refresh = document.getElementById('improvement-panel-refresh');
        if (refresh) {
            refresh.disabled = isLoading;
            refresh.textContent = isLoading ? 'Cargando...' : 'Actualizar';
        }
    }

    function cloneJson(value) {
        return value ? JSON.parse(JSON.stringify(value)) : value;
    }

    function getExecutionStorageKey() {
        const appId = `${options.appId || 'page'}`.trim() || 'page';
        const platform = pluginHost()?.platform || 'web-page';
        return `${EXECUTION_STORAGE_PREFIX}:${platform}:${appId}`;
    }

    function readPendingExecution() {
        try {
            const raw = pluginHost()?.sessionStore?.get(getExecutionStorageKey()) || '';
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.workflowId || !Array.isArray(parsed.steps)) {
                return null;
            }
            return parsed;
        } catch (error) {
            return null;
        }
    }

    function persistPendingExecution(plan) {
        if (!plan) {
            executionState.running = false;
            pluginHost()?.sessionStore?.remove(getExecutionStorageKey());
            return;
        }

        executionState.running = true;
        pluginHost()?.sessionStore?.set(getExecutionStorageKey(), JSON.stringify(plan));
    }

    function clearPendingExecution() {
        executionState.running = false;
        pluginHost()?.sessionStore?.remove(getExecutionStorageKey());
    }

    function normalizeExecutionUrl(rawUrl) {
        if (!rawUrl) {
            return window.location.href;
        }

        try {
            const candidate = new URL(rawUrl, window.location.href);
            if (candidate.origin === window.location.origin) {
                return candidate.toString();
            }

            if (candidate.pathname) {
                return new URL(`${candidate.pathname}${candidate.search}${candidate.hash}`, window.location.origin).toString();
            }

            return candidate.toString();
        } catch (error) {
            try {
                return new URL(rawUrl, window.location.origin).toString();
            } catch (nestedError) {
                return `${rawUrl}`;
            }
        }
    }

    function urlsMatch(left, right) {
        try {
            const leftUrl = new URL(left, window.location.href);
            const rightUrl = new URL(right, window.location.href);
            return leftUrl.origin === rightUrl.origin
                && leftUrl.pathname === rightUrl.pathname
                && leftUrl.search === rightUrl.search;
        } catch (error) {
            return `${left || ''}` === `${right || ''}`;
        }
    }

    function describeStep(step) {
        if (!step) return 'workflow';
        if (step.label) return step.label;
        if (step.selector) return step.selector;
        if (step.url) return step.url;
        return step.actionType || 'workflow';
    }

    function resolveElementFromStep(step) {
        if (step?.selector) {
            const directMatch = document.querySelector(step.selector);
            if (directMatch) {
                return directMatch;
            }
        }

        if (step?.actionType === 'click' && step?.label) {
            const candidates = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"]'));
            return candidates.find((element) => {
                const text = (element.textContent || element.value || element.getAttribute('aria-label') || '').trim();
                return text === step.label;
            }) || null;
        }

        return null;
    }

    async function waitForStepElement(step, timeoutMs = EXECUTION_WAIT_TIMEOUT_MS) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const element = resolveElementFromStep(step);
            if (element) {
                return element;
            }
            await new Promise((resolve) => window.setTimeout(resolve, 120));
        }

        throw new Error(`No pude encontrar ${describeStep(step)} en esta pagina.`);
    }

    function fireDomEvent(element, eventName) {
        element.dispatchEvent(new Event(eventName, { bubbles: true }));
    }

    function notifyAutomationStep(step, message, options = {}) {
        const selector = options.selector || step?.selector || 'body';
        runtime()?.handleAutomationEvent?.({
            selector,
            label: step?.label || '',
            mode: options.mode || 'executing',
            spotlight: options.spotlight !== false,
            message: message || step?.label || step?.selector || 'Estoy trabajando en esta parte.'
        });
    }

    function emitExtensionLog(level, message, details = null) {
        const detail = {
            level,
            scope: 'trainer-plugin',
            message,
            details
        };
        try {
            document.dispatchEvent(new CustomEvent('graph-trainer-extension-log', { detail }));
            window.postMessage({
                source: 'graph-trainer-extension',
                type: 'log',
                detail
            }, '*');
        } catch (error) {
            // Ignore logging bridge issues.
        }
    }

    async function applyInputStep(element, step, variables = {}) {
        const variableName = `input_${step.stepOrder}`;
        const nextValue = Object.prototype.hasOwnProperty.call(variables, variableName)
            ? variables[variableName]
            : step.value;
        const inputType = (element.type || '').toLowerCase();

        element.scrollIntoView({ block: 'center', inline: 'nearest' });
        element.focus?.();

        if (inputType === 'checkbox' || inputType === 'radio') {
            const shouldCheck = ['1', 'true', 'yes', 'on', ''].includes(`${nextValue ?? ''}`.trim().toLowerCase());
            if (shouldCheck && !element.checked) {
                element.click();
            } else if (!shouldCheck && inputType === 'checkbox' && element.checked) {
                element.click();
            }
            return;
        }

        element.value = `${nextValue ?? ''}`;
        fireDomEvent(element, 'input');
        fireDomEvent(element, 'change');
    }

    function normalizeChoiceText(value) {
        return `${value || ''}`
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function buildSelectCandidates(step, variables = {}) {
        const variableName = `input_${step.stepOrder}`;
        const fromVariables = Object.prototype.hasOwnProperty.call(variables, variableName)
            ? variables[variableName]
            : null;
        return [
            fromVariables,
            step.selectedValue,
            step.selectedLabel,
            step.value
        ].filter((candidate, index, items) => {
            if (candidate === null || candidate === undefined) {
                return false;
            }
            const normalized = `${candidate}`.trim();
            return normalized && items.findIndex((item) => `${item}`.trim() === normalized) === index;
        });
    }

    function findMatchingSelectOption(optionsList, requestedValue) {
        const normalizedRequested = normalizeChoiceText(requestedValue);
        if (!normalizedRequested) {
            return null;
        }

        const getNormalizedOptionParts = (option) => ({
            value: normalizeChoiceText(option.value),
            label: normalizeChoiceText(option.label || option.textContent || ''),
            text: normalizeChoiceText(option.textContent || '')
        });

        return optionsList.find((option) =>
            getNormalizedOptionParts(option).value === normalizedRequested
            || getNormalizedOptionParts(option).label === normalizedRequested
            || getNormalizedOptionParts(option).text === normalizedRequested
        ) || optionsList.find((option) =>
            {
                const parts = getNormalizedOptionParts(option);
                return (
                    (parts.value && parts.value.includes(normalizedRequested))
                    || (parts.label && parts.label.includes(normalizedRequested))
                    || (parts.text && parts.text.includes(normalizedRequested))
                    || (parts.value && normalizedRequested.includes(parts.value))
                    || (parts.label && normalizedRequested.includes(parts.label))
                    || (parts.text && normalizedRequested.includes(parts.text))
                );
            }
        );
    }

    function dispatchMouseLikeEvent(element, eventName) {
        element.dispatchEvent(new MouseEvent(eventName, {
            bubbles: true,
            cancelable: true,
            view: window
        }));
    }

    function dispatchKeyboardLikeEvent(element, eventName, key) {
        element.dispatchEvent(new KeyboardEvent(eventName, {
            bubbles: true,
            cancelable: true,
            key,
            code: key,
            view: window
        }));
    }

    function waitMs(duration) {
        return new Promise((resolve) => window.setTimeout(resolve, duration));
    }

    async function performSelectInteractionSequence(element) {
        element.scrollIntoView({ block: 'center', inline: 'nearest' });
        await waitMs(40);
        element.focus?.();
        dispatchMouseLikeEvent(element, 'pointerdown');
        dispatchMouseLikeEvent(element, 'mousedown');
        dispatchMouseLikeEvent(element, 'pointerup');
        dispatchMouseLikeEvent(element, 'mouseup');
        dispatchMouseLikeEvent(element, 'click');
        dispatchKeyboardLikeEvent(element, 'keydown', 'ArrowDown');
        dispatchKeyboardLikeEvent(element, 'keyup', 'ArrowDown');
    }

    function getSelectedOptionSnapshot(element) {
        if (!(element instanceof HTMLSelectElement)) {
            return {
                value: `${element?.value || ''}`,
                label: ''
            };
        }
        const option = element.options[element.selectedIndex] || null;
        return {
            value: `${element.value || ''}`,
            label: option ? `${option.label || option.textContent || ''}`.trim() : ''
        };
    }

    function applyNativeSelectValue(element, selected) {
        const optionsList = Array.from(element.options || []);
        const selectedIndex = optionsList.findIndex((option) => option.value === selected.value);
        if (selectedIndex >= 0) {
            element.selectedIndex = selectedIndex;
            optionsList.forEach((option, index) => {
                option.selected = index === selectedIndex;
            });
        }
        element.value = selected.value;
    }

    async function dispatchSelectCommitEvents(element) {
        fireDomEvent(element, 'input');
        fireDomEvent(element, 'change');
        dispatchKeyboardLikeEvent(element, 'keydown', 'Enter');
        dispatchKeyboardLikeEvent(element, 'keyup', 'Enter');
        await waitMs(30);
        fireDomEvent(element, 'blur');
    }

    async function verifyNativeSelectApplied(element, selected, timeoutMs = 1200) {
        const startedAt = Date.now();
        const normalizedTargetValue = normalizeChoiceText(selected?.value || '');
        const normalizedTargetLabel = normalizeChoiceText(selected?.label || selected?.text || '');

        while (Date.now() - startedAt < timeoutMs) {
            const snapshot = getSelectedOptionSnapshot(element);
            const currentValue = normalizeChoiceText(snapshot.value);
            const currentLabel = normalizeChoiceText(snapshot.label);
            if (
                (normalizedTargetValue && currentValue === normalizedTargetValue)
                || (normalizedTargetLabel && currentLabel === normalizedTargetLabel)
            ) {
                return true;
            }
            await waitMs(60);
        }

        return false;
    }

    async function applyNativeSelectWithKeyboardFallback(element, selected) {
        if (typeof element.showPicker === 'function') {
            try {
                element.showPicker();
                emitExtensionLog('info', 'Invoked showPicker() for native select.', {
                    selector: element.id ? `#${element.id}` : '',
                    currentValue: element.value || ''
                });
                await waitMs(80);
            } catch (error) {
                emitExtensionLog('info', 'showPicker() was not allowed for native select.', {
                    selector: element.id ? `#${element.id}` : '',
                    message: error?.message || 'showPicker failed'
                });
            }
        }

        const optionsList = Array.from(element.options || []);
        const targetIndex = optionsList.findIndex((option) => option.value === selected.value);
        if (targetIndex < 0) {
            return false;
        }

        element.focus?.();
        const startingIndex = Math.max(0, element.selectedIndex);
        const directionKey = targetIndex >= startingIndex ? 'ArrowDown' : 'ArrowUp';
        const moveCount = Math.abs(targetIndex - startingIndex);

        for (let index = 0; index < moveCount; index += 1) {
            dispatchKeyboardLikeEvent(element, 'keydown', directionKey);
            if (directionKey === 'ArrowDown' && element.selectedIndex < optionsList.length - 1) {
                element.selectedIndex += 1;
            } else if (directionKey === 'ArrowUp' && element.selectedIndex > 0) {
                element.selectedIndex -= 1;
            }
            applyNativeSelectValue(element, optionsList[element.selectedIndex] || selected);
            dispatchKeyboardLikeEvent(element, 'keyup', directionKey);
            fireDomEvent(element, 'input');
            await waitMs(35);
        }

        applyNativeSelectValue(element, selected);
        await dispatchSelectCommitEvents(element);
        return verifyNativeSelectApplied(element, selected, 1200);
    }

    async function waitForMatchingSelectOption(element, candidates, timeoutMs = EXECUTION_WAIT_TIMEOUT_MS) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const optionsList = Array.from(element.options || []);
            for (const candidate of candidates) {
                const selected = findMatchingSelectOption(optionsList, candidate);
                if (selected) {
                    return selected;
                }
            }
            await new Promise((resolve) => window.setTimeout(resolve, 120));
        }
        return null;
    }

    async function applySelectStep(element, step, variables = {}) {
        const candidates = buildSelectCandidates(step, variables);
        emitExtensionLog('info', 'Applying select step.', {
            selector: step.selector || '',
            label: step.label || '',
            candidates
        });
        const selected = await waitForMatchingSelectOption(element, candidates);

        if (!selected) {
            emitExtensionLog('error', 'No matching option found for select step.', {
                selector: step.selector || '',
                label: step.label || '',
                candidates,
                availableOptions: Array.from(element.options || []).map((option) => ({
                    value: option.value,
                    label: option.label || option.textContent || ''
                }))
            });
            throw new Error(`No encontre una opcion compatible para ${describeStep(step)}.`);
        }

        await performSelectInteractionSequence(element);
        applyNativeSelectValue(element, selected);
        await dispatchSelectCommitEvents(element);

        let applied = await verifyNativeSelectApplied(element, selected, 1000);
        if (!applied) {
            emitExtensionLog('info', 'Semantic native select apply did not stick, trying keyboard fallback.', {
                selector: step.selector || '',
                label: step.label || '',
                targetValue: selected.value,
                targetLabel: selected.label || selected.text || ''
            });
            applied = await applyNativeSelectWithKeyboardFallback(element, selected);
        }

        if (!applied) {
            const snapshot = getSelectedOptionSnapshot(element);
            emitExtensionLog('error', 'Native select value did not persist after fallback.', {
                selector: step.selector || '',
                label: step.label || '',
                targetValue: selected.value,
                targetLabel: selected.label || selected.text || '',
                currentValue: snapshot.value,
                currentLabel: snapshot.label
            });
            throw new Error(`No pude confirmar la seleccion para ${describeStep(step)}.`);
        }

        emitExtensionLog('info', 'Applied select step.', {
            selector: step.selector || '',
            label: step.label || '',
            selectedValue: selected.value,
            resultingValue: element.value || '',
            selectedLabel: selected.label || selected.text || ''
        });
    }

    function updateExecutionProgress(plan, nextStepIndex) {
        const nextPlan = {
            ...plan,
            nextStepIndex,
            updatedAt: Date.now()
        };
        persistPendingExecution(nextPlan);
        return nextPlan;
    }

    async function executeWorkflowPlan(plan, trigger = 'panel') {
        if (!plan || !plan.workflowId || !Array.isArray(plan.steps) || plan.steps.length === 0) {
            throw new Error('No pude preparar la automatizacion para ayudarte con la reserva.');
        }

        if (executionState.running) {
            throw new Error('Ya estoy completando una reserva en esta pagina.');
        }

        let currentPlan = updateExecutionProgress({
            ...cloneJson(plan),
            trigger,
            nextStepIndex: Number.isFinite(plan.nextStepIndex) ? plan.nextStepIndex : 0,
            startedAt: plan.startedAt || Date.now()
        }, Number.isFinite(plan.nextStepIndex) ? plan.nextStepIndex : 0);

        updateWorkflowPanelStatus('Completando la reserva en esta pagina...');
        emitPluginEvent('workflow.execution.started', {
            workflowId: currentPlan.workflowId,
            trigger,
            stepCount: currentPlan.steps.length
        });

        for (let stepIndex = currentPlan.nextStepIndex; stepIndex < currentPlan.steps.length; stepIndex += 1) {
            const step = currentPlan.steps[stepIndex];
            const expectedUrl = step.url ? normalizeExecutionUrl(step.url) : '';
            emitPluginEvent('workflow.execution.step_started', {
                workflowId: currentPlan.workflowId,
                trigger,
                stepIndex,
                step
            });

            if (step.actionType === 'navigation') {
                const targetUrl = normalizeExecutionUrl(step.url);
                notifyAutomationStep(step, `Abriendo ${step.label || targetUrl}.`, {
                    selector: 'body',
                    spotlight: false
                });
                if (!urlsMatch(window.location.href, targetUrl)) {
                    currentPlan = updateExecutionProgress(currentPlan, stepIndex + 1);
                    updateWorkflowPanelStatus(`Abriendo ${targetUrl}...`);
                    window.location.assign(targetUrl);
                    return;
                }

                currentPlan = updateExecutionProgress(currentPlan, stepIndex + 1);
                continue;
            }

            if (expectedUrl && !urlsMatch(window.location.href, expectedUrl)) {
                currentPlan = updateExecutionProgress(currentPlan, stepIndex);
                updateWorkflowPanelStatus(`Cambiando a la pagina correcta para ${describeStep(step)}...`);
                window.location.assign(expectedUrl);
                return;
            }

            const element = await waitForStepElement(step);
            if (step.actionType === 'click') {
                element.scrollIntoView({ block: 'center', inline: 'nearest' });
                notifyAutomationStep(step, `Estoy interactuando con ${step.label || step.selector || 'este control'}.`);
                if ('disabled' in element && element.disabled) {
                    throw new Error(`El elemento ${describeStep(step)} sigue deshabilitado.`);
                }

                currentPlan = updateExecutionProgress(currentPlan, stepIndex + 1);
                element.click();
            } else if (step.actionType === 'input') {
                notifyAutomationStep(step, `Estoy completando ${step.label || step.selector || 'este campo'}.`);
                await applyInputStep(element, step, currentPlan.variables || {});
                currentPlan = updateExecutionProgress(currentPlan, stepIndex + 1);
            } else if (step.actionType === 'select') {
                notifyAutomationStep(step, `Estoy eligiendo una opcion en ${step.label || step.selector || 'este selector'}.`);
                await applySelectStep(element, step, currentPlan.variables || {});
                currentPlan = updateExecutionProgress(currentPlan, stepIndex + 1);
            } else {
                currentPlan = updateExecutionProgress(currentPlan, stepIndex + 1);
            }

            await new Promise((resolve) => window.setTimeout(resolve, EXECUTION_STEP_DELAY_MS));
        }

        clearPendingExecution();
        runtime()?.clearSpotlight?.();
        updateWorkflowPanelStatus('Reserva completada en esta pagina.');
        runtime()?.speak('Listo, termine de completar la reserva aqui mismo.', { mode: 'idle' });
        emitExtensionLog('info', 'Workflow execution finished on page.', {
            workflowId: currentPlan.workflowId,
            trigger
        });
        emitPluginEvent('workflow.execution.finished', {
            workflowId: currentPlan.workflowId,
            trigger
        });
    }

    async function fetchExecutionPlan(workflowId, variables = {}) {
        const payload = await requireApiClient().getExecutionPlan(workflowId, variables, getPageContext());
        return payload?.executionPlan || null;
    }

    async function sendMessageToAgentBackend(message, options = {}) {
        const normalizedMessage = `${message || ''}`.trim();
        if (!normalizedMessage) {
            return null;
        }

        const {
            appendUser = true,
            focusInput = false,
            trigger = 'chat',
            speakReply = false
        } = options;

        const historyForRequest = agentHistory.slice(-8);
        if (appendUser) {
            appendAgentMessage('user', normalizedMessage);
        }

        emitPluginEvent('chat.message.sent', {
            message: normalizedMessage,
            trigger
        });

        let payload;
        try {
            payload = await requireApiClient().sendAgentMessage(normalizedMessage, historyForRequest, getPageContext());
        } catch (error) {
            const errorMessage = error.message || 'No pude procesar tu solicitud en este momento.';
            appendAgentMessage('assistant', errorMessage, null, false);
            throw new Error(errorMessage);
        }

        appendAgentMessage('assistant', payload.reply, null);
        emitPluginEvent('chat.reply.received', {
            reply: payload.reply || '',
            trigger,
            hasExecutionPlan: Boolean(payload.executionPlan)
        });
        if (speakReply && payload.reply) {
            runtime()?.speak(payload.reply, {
                mode: payload.executionPlan ? 'executing' : 'assistant'
                ,
                audible: true
            });
        }

        if (payload.executionPlan) {
            try {
                await executeWorkflowPlan(payload.executionPlan, trigger);
            } catch (error) {
                appendAgentMessage('assistant', error.message || 'No pude completar la reserva en esta pagina.', null, false);
                updateWorkflowPanelStatus(error.message || 'No pude completar la reserva en esta pagina.');
                throw error;
            }
        }

        if (focusInput) {
            document.getElementById('agent-message')?.focus();
        }

        return payload;
    }

    async function respondToVoiceFunctionCall(call, content) {
        if (!voiceState.socket || voiceState.socket.readyState !== WebSocket.OPEN) {
            throw new Error('La sesion de voz ya no esta conectada.');
        }

        voiceState.socket.send(JSON.stringify({
            type: 'function_call_response',
            id: call.id || '',
            name: call.name || '',
            thought_signature: call.thought_signature || undefined,
            content
        }));
    }

    async function executeVoiceFunctionCall(call) {
        const functionName = `${call?.name || ''}`.trim();
        if (functionName !== 'execute_reservation_on_page') {
            await respondToVoiceFunctionCall(call, JSON.stringify({
                ok: false,
                error: `Funcion no soportada en cliente: ${functionName || 'unknown'}`
            }));
            return;
        }

        let args = {};
        try {
            args = JSON.parse(call.arguments || '{}');
        } catch (error) {
            await respondToVoiceFunctionCall(call, JSON.stringify({
                ok: false,
                error: 'No pude interpretar los argumentos de la accion.'
            }));
            return;
        }

        const workflowId = `${args.workflowId || ''}`.trim();
        const variables = args.variables && typeof args.variables === 'object' ? args.variables : {};

        if (!workflowId) {
            await respondToVoiceFunctionCall(call, JSON.stringify({
                ok: false,
                error: 'Falto workflowId para ejecutar la reserva.'
            }));
            return;
        }

        updateVoiceStatus('Ejecutando la reserva en esta pagina...');
        runtime()?.speak('Voy a resolverlo aqui mismo en la pagina.', { mode: 'executing' });

        try {
            const executionPlan = await fetchExecutionPlan(workflowId, variables);
            await executeWorkflowPlan(executionPlan, 'voice');
            await respondToVoiceFunctionCall(call, JSON.stringify({
                ok: true,
                workflowId,
                executed: true,
                variables
            }));
        } catch (error) {
            voiceLog('browser_execution_error', error.message || 'plan execution failed');
            await respondToVoiceFunctionCall(call, JSON.stringify({
                ok: false,
                workflowId,
                error: error.message || 'No pude completar la reserva en esta pagina.'
            }));
            throw error;
        }
    }

    async function handleVoiceFunctionRequests(functionsList = []) {
        for (const call of functionsList) {
            await executeVoiceFunctionCall(call);
        }
    }

    async function resumePendingExecution() {
        const pending = readPendingExecution();
        if (!pending || executionState.running) {
            return;
        }

        try {
            await executeWorkflowPlan(pending, pending.trigger || 'resume');
        } catch (error) {
            clearPendingExecution();
            updateWorkflowPanelStatus(error.message || 'No pude retomar la reserva en esta pagina.');
            appendAgentMessage('assistant', error.message || 'No pude retomar la reserva en esta pagina.', null, false);
        }
    }

    async function executeWorkflowFromPanel(workflowId) {
        updateWorkflowPanelStatus('Empezando la reserva...');
        runtime()?.speak('Voy a encargarme de la reserva y moverme por la pagina por ti.', { mode: 'executing' });
        const executionPlan = await fetchExecutionPlan(workflowId, {});
        await executeWorkflowPlan(executionPlan, 'panel');
    }

    async function generatePitchArtifacts() {
        updateWorkflowPanelStatus('Generando pitchpersonality.md y future-improvement.md...');
        runtime()?.speak('Estoy generando los artefactos de pitch y preparando el recorrido de mejoras.', { mode: 'tour' });

        return requireApiClient().generatePitchArtifacts({
            ...getPageContext(),
            workflowDescription: options.workflowDescription || ''
        });
    }

    function startImprovementTour(result) {
        const tour = result?.tour;
        if (!tour || !Array.isArray(tour.stops) || tour.stops.length === 0) {
            runtime()?.speak('Genere los archivos, pero todavia no hay un recorrido visual para esta pagina.', { mode: 'tour' });
            return;
        }

        runtime()?.startTour(tour);
    }

    async function deleteWorkflowFromPanel(workflowId) {
        updateWorkflowPanelStatus(`Borrando ${workflowId}...`);
        await requireApiClient().deleteWorkflow(workflowId);
        updateWorkflowPanelStatus(`Workflow ${workflowId} borrado.`);
    }

    function renderImprovementPanel(suggestions) {
        const list = document.getElementById('improvement-panel-list');
        const empty = document.getElementById('improvement-panel-empty');
        if (!list || !empty) return;

        list.innerHTML = '';

        if (!suggestions.length) {
            empty.hidden = false;
            updateImprovementPanelStatus('No hay sugerencias disponibles para esta pagina.');
            return;
        }

        empty.hidden = true;
        updateImprovementPanelStatus(`${suggestions.length} sugerencia(s) disponibles para esta pagina.`);

        suggestions.forEach((suggestion) => {
            const item = document.createElement('article');
            item.className = 'improvement-item';
            const priority = `${suggestion.priority || 'media'}`.toLowerCase();
            item.innerHTML = `
                <div class="improvement-item-header">
                    <div>
                        <div class="improvement-item-eyebrow">${suggestion.area || 'Momento de la experiencia'}</div>
                        <h4 class="improvement-item-title">${suggestion.title || 'Sugerencia de mejora'}</h4>
                    </div>
                    <div class="improvement-item-pill" data-priority="${priority}">Prioridad ${suggestion.priority || 'media'}</div>
                </div>
                <div class="improvement-item-meta">
                    <div>${suggestion.summary || ''}</div>
                    <div class="improvement-item-quote">
                        <span class="improvement-item-quote-label">Lo que una persona podria decir</span>
                        ${suggestion.evidence || 'Sin evidencia disponible.'}
                    </div>
                    <div class="improvement-item-recommendation">
                        <span class="improvement-item-recommendation-label">Que conviene mejorar</span>
                        ${suggestion.opportunity || 'Sin oportunidad descrita.'}
                    </div>
                    <div><strong>Origen:</strong> ${suggestion.source || 'Plugin'}</div>
                </div>
                <div class="improvement-item-target">Anclado a: ${suggestion.selector || 'pagina actual'}</div>
            `;
            list.appendChild(item);
        });
    }

    function renderWorkflowPanel(workflows) {
        const list = document.getElementById('workflow-panel-list');
        const empty = document.getElementById('workflow-panel-empty');
        if (!list || !empty) return;

        list.innerHTML = '';

        if (!workflows.length) {
            empty.hidden = false;
            updateWorkflowPanelStatus('No hay workflows grabados para esta pagina.');
            return;
        }

        empty.hidden = true;
        updateWorkflowPanelStatus(`${workflows.length} workflow(s) grabados en esta pagina.`);

        workflows.forEach((workflow) => {
            const item = document.createElement('article');
            item.className = 'workflow-item';
            item.innerHTML = `
                <h4 class="workflow-item-title">${workflow.description || workflow.id}</h4>
                <div class="workflow-item-meta">
                    <div><strong>ID:</strong> ${workflow.id}</div>
                    <div><strong>Estado:</strong> ${workflow.status || 'desconocido'} | <strong>Pasos:</strong> ${(workflow.steps || []).length}</div>
                    <div><strong>Actualizado:</strong> ${formatTimestamp(workflow.updatedAt || workflow.completedAt || workflow.createdAt)}</div>
                    <div>${workflow.summary || 'Sin resumen todavia.'}</div>
                </div>
                <div class="workflow-item-actions">
                    <button class="copy-btn" type="button" data-action="copy-id" data-workflow-id="${workflow.id}">Copiar ID</button>
                    <button class="delete-btn" type="button" data-action="delete-workflow" data-workflow-id="${workflow.id}">Borrar</button>
                    <button class="run-btn" type="button" data-action="run-workflow" data-workflow-id="${workflow.id}">Ejecutar</button>
                </div>
            `;
            list.appendChild(item);
        });
    }

    async function loadWorkflowPanel(force = false) {
        if (workflowPanelLoaded && !force) {
            return;
        }

        workflowPanelLoaded = true;
        setWorkflowPanelLoadingState(true);
        updateWorkflowPanelStatus('Buscando workflows de esta pagina...');

        try {
            const payload = await requireApiClient().listWorkflows();
            renderWorkflowPanel(filterWorkflowsForCurrentPage(payload.workflows || []));
        } catch (error) {
            workflowPanelLoaded = false;
            updateWorkflowPanelStatus(error.message || 'No se pudo cargar el panel.');
            const list = document.getElementById('workflow-panel-list');
            const empty = document.getElementById('workflow-panel-empty');
            if (list) list.innerHTML = '';
            if (empty) {
                empty.hidden = false;
                empty.textContent = 'No fue posible cargar los workflows de esta pagina.';
            }
        } finally {
            setWorkflowPanelLoadingState(false);
        }
    }

    async function loadImprovementPanel(force = false) {
        if (improvementPanelLoaded && !force) {
            return;
        }

        improvementPanelLoaded = true;
        setImprovementPanelLoadingState(true);
        updateImprovementPanelStatus('Preparando feedback visible y oportunidades de mejora de esta pagina...');

        try {
            const suggestions = getMockFeedbackSuggestions();
            renderImprovementPanel(suggestions);
            updateImprovementPanelStatus(`${suggestions.length} comentario(s) listos para revisar en la pagina.`);
        } catch (error) {
            improvementPanelLoaded = false;
            updateImprovementPanelStatus(error.message || 'No se pudo cargar el panel de mejoras.');
            const list = document.getElementById('improvement-panel-list');
            const empty = document.getElementById('improvement-panel-empty');
            if (list) list.innerHTML = '';
            if (empty) {
                empty.hidden = false;
                empty.textContent = 'No fue posible cargar las sugerencias de mejora de esta pagina.';
            }
        } finally {
            setImprovementPanelLoadingState(false);
        }
    }

    async function runPitchGeneration() {
        const button = document.getElementById('improvement-run-pitch');
        const iconButton = document.getElementById('pitch-generate');

        if (button) {
            button.disabled = true;
            button.textContent = 'Generando...';
        }
        if (iconButton) {
            iconButton.disabled = true;
        }

        try {
            const result = await generatePitchArtifacts();
            improvementPanelLoaded = false;
            openChatPanel();
            const fileLines = (result.files || []).map((file) => `- ${file.name}: ${file.path}`);
            appendAgentMessage(
                'assistant',
                `Genere artefactos de pitch para esta pagina usando ${result.workflowCount || 0} workflow(s).\n${fileLines.join('\n')}`,
                'pitch generated',
                false
            );
            updateWorkflowPanelStatus(`Pitch generado en ${result.outputDir}`);
            updateImprovementPanelStatus('Artefactos regenerados. Mantener oprimido muestra el panel actualizado.');
            startImprovementTour(result);
        } catch (error) {
            openChatPanel();
            appendAgentMessage('assistant', error.message || 'No se pudieron generar los archivos de pitch.', null, false);
            updateWorkflowPanelStatus(error.message || 'No se pudieron generar los archivos de pitch.');
            updateImprovementPanelStatus(error.message || 'No se pudieron regenerar las sugerencias.');
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = 'Generar pitch';
            }
            if (iconButton) {
                iconButton.disabled = false;
            }
        }
    }

    function downsampleTo16k(floatSamples, inputSampleRate) {
        const targetSampleRate = 16000;
        if (inputSampleRate === targetSampleRate) {
            return floatSamples;
        }

        const ratio = inputSampleRate / targetSampleRate;
        const outputLength = Math.floor(floatSamples.length / ratio);
        const output = new Float32Array(outputLength);
        let outputIndex = 0;
        let inputIndex = 0;

        while (outputIndex < outputLength) {
            const nextInputIndex = Math.floor((outputIndex + 1) * ratio);
            let sum = 0;
            let count = 0;

            for (let i = inputIndex; i < nextInputIndex && i < floatSamples.length; i += 1) {
                sum += floatSamples[i];
                count += 1;
            }

            output[outputIndex] = count > 0 ? sum / count : 0;
            outputIndex += 1;
            inputIndex = nextInputIndex;
        }

        return output;
    }

    function floatTo16BitPcm(floatSamples) {
        const buffer = new ArrayBuffer(floatSamples.length * 2);
        const view = new DataView(buffer);

        for (let i = 0; i < floatSamples.length; i += 1) {
            const sample = Math.max(-1, Math.min(1, floatSamples[i]));
            view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        }

        return buffer;
    }

    function clearVoicePlayback() {
        if (voiceState.playbackSources?.size) {
            voiceState.playbackSources.forEach((source) => {
                try {
                    source.onended = null;
                    source.stop(0);
                } catch (error) {
                    // Ignore sources that already ended.
                }
            });
            voiceState.playbackSources.clear();
        }

        if (voiceState.playbackContext) {
            voiceState.nextPlaybackTime = voiceState.playbackContext.currentTime;
        } else {
            voiceState.nextPlaybackTime = 0;
        }
    }

    async function playLinear16Audio(arrayBuffer) {
        if (!voiceState.playbackContext) {
            voiceState.playbackContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: voiceState.ttsSampleRate
            });
            voiceState.nextPlaybackTime = voiceState.playbackContext.currentTime;
        }

        const audioContext = voiceState.playbackContext;
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        const input = new Int16Array(arrayBuffer);
        const audioBuffer = audioContext.createBuffer(1, input.length, voiceState.ttsSampleRate);
        const channel = audioBuffer.getChannelData(0);

        for (let i = 0; i < input.length; i += 1) {
            channel[i] = input[i] / 32768;
        }

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        voiceState.playbackSources.add(source);
        source.onended = () => {
            voiceState.playbackSources.delete(source);
        };

        const startAt = Math.max(audioContext.currentTime + 0.02, voiceState.nextPlaybackTime);
        source.start(startAt);
        voiceState.nextPlaybackTime = startAt + audioBuffer.duration;
    }

    async function playAssistantGreeting(text) {
        const message = `${text || ''}`.trim();
        if (!message) {
            return;
        }

        const now = Date.now();
        if (greetingState.playing || now - greetingState.lastPlayedAt < 5000) {
            return;
        }

        greetingState.playing = true;
        greetingState.lastPlayedAt = now;
        voiceLog('preview_tts_start', { text: message.slice(0, 120) });

        const socket = new WebSocket(getRealtimeSocketUrl());
        socket.binaryType = 'arraybuffer';

        await new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                greetingState.playing = false;
                voiceLog('preview_tts_finish');
                resolve();
            };

            socket.addEventListener('open', () => {
                voiceLog('preview_tts_socket_open');
                socket.send(JSON.stringify({
                    type: 'preview_tts',
                    text: message
                }));
            });

            socket.addEventListener('message', async (event) => {
                if (event.data instanceof ArrayBuffer) {
                    await playLinear16Audio(event.data);
                    return;
                }

                let payload;
                try {
                    payload = JSON.parse(event.data);
                } catch (error) {
                    return;
                }

                if (payload.type === 'audio_end' || payload.type === 'error') {
                    voiceLog('preview_tts_event', payload.type);
                    finish();
                }
            });

            socket.addEventListener('close', () => {
                voiceLog('preview_tts_socket_close');
                finish();
            });
            socket.addEventListener('error', (error) => {
                voiceLog('preview_tts_socket_error', error?.message || 'socket error');
                finish();
            });
        });
    }

    async function startVoiceConversation(config = {}) {
        if (voiceState.active) {
            voiceLog('start_ignored_already_active');
            return;
        }

        const effectivePhoneSessionId = config.phoneSessionId || voiceState.phoneSession?.id || null;
        voiceLog('start_voice_conversation', {
            phoneSessionId: effectivePhoneSessionId,
            hasStoredPhoneSession: Boolean(voiceState.phoneSession?.id)
        });
        openChatPanel();
        updateVoiceStatus(effectivePhoneSessionId ? 'Reconectando audio del telefono...' : 'Conectando voz en tiempo real...');
        if (!effectivePhoneSessionId) {
            runtime()?.speak('Te escucho. Habla con naturalidad y me encargo de la reserva cuando tenga lo necesario.', { mode: 'listening' });
        } else {
            runtime()?.speak('Estoy retomando el audio de tu telefono para seguir con la reserva.', { mode: 'listening' });
        }

        const socket = new WebSocket(getRealtimeSocketUrl());
        socket.binaryType = 'arraybuffer';
        voiceState.socket = socket;

        socket.addEventListener('open', async () => {
            voiceLog('realtime_socket_open', { phoneSessionId: effectivePhoneSessionId });
            socket.send(JSON.stringify({
                type: 'start',
                context: getPageContext(),
                history: agentHistory.slice(-10),
                phoneSessionId: effectivePhoneSessionId
            }));

            if (effectivePhoneSessionId) {
                voiceState.active = true;
                setVoiceButton(true);
                updateVoiceStatus('Esperando audio del telefono...');
                voiceLog('waiting_for_phone_audio', { phoneSessionId: effectivePhoneSessionId });
                return;
            }

            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    throw new Error('Este computador no tiene un microfono disponible. Mantén presionado el botón de micrófono para sincronizar tu teléfono.');
                }

                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        channelCount: 1,
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        latency: 0
                    }
                });
                const audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    latencyHint: 'interactive'
                });
                await audioContext.resume();
                const source = audioContext.createMediaStreamSource(stream);
                const processor = audioContext.createScriptProcessor(1024, 1, 1);
                const silenceGain = audioContext.createGain();
                silenceGain.gain.value = 0;

                processor.onaudioprocess = (event) => {
                    if (!voiceState.active || socket.readyState !== WebSocket.OPEN) {
                        return;
                    }
                    const input = event.inputBuffer.getChannelData(0);
                    const downsampled = downsampleTo16k(input, audioContext.sampleRate);
                    socket.send(floatTo16BitPcm(downsampled));
                };

                source.connect(processor);
                processor.connect(silenceGain);
                silenceGain.connect(audioContext.destination);

                voiceState.stream = stream;
                voiceState.audioContext = audioContext;
                voiceState.source = source;
                voiceState.processor = processor;
                voiceState.silenceGain = silenceGain;
                voiceState.active = true;
                setVoiceButton(true);
                updateVoiceStatus('Escuchando...');
                voiceLog('desktop_microphone_ready');
            } catch (error) {
                const message = error.message || 'No pude acceder al microfono. Mantén presionado el botón de micrófono para sincronizar tu teléfono.';
                voiceLog('desktop_microphone_error', message);
                updateVoiceStatus(message);
                appendAgentMessage('assistant', message, null, false);
                stopVoiceConversation({ announce: false });
            }
        });

        socket.addEventListener('message', async (event) => {
            if (event.data instanceof ArrayBuffer) {
                await playLinear16Audio(event.data);
                return;
            }

            let payload;
            try {
                payload = JSON.parse(event.data);
            } catch (error) {
                return;
            }

            if (payload.type === 'ready') {
                voiceLog('server_event_ready', { phoneSessionId: effectivePhoneSessionId });
                updateVoiceStatus(effectivePhoneSessionId ? 'Te escucho desde el telefono.' : 'Deepgram listo. Puedes hablar.');
                if (effectivePhoneSessionId) {
                    runtime()?.speak('Te escucho desde el telefono. Habla con naturalidad.', { mode: 'listening' });
                }
                return;
            }

            if (payload.type === 'phone_waiting') {
                voiceLog('server_event_phone_waiting');
                updateVoiceStatus('Esperando que el telefono se conecte por QR...');
                return;
            }

            if (payload.type === 'phone_connected') {
                voiceLog('server_event_phone_connected');
                updateVoiceStatus('Telefono conectado. Activa el microfono en el telefono cuando quieras empezar.');
                return;
            }

            if (payload.type === 'phone_audio_started') {
                voiceLog('server_event_phone_audio_started');
                updateVoiceStatus('Audio del telefono recibido. Conectando Deepgram...');
                return;
            }

            if (payload.type === 'phone_disconnected') {
                voiceLog('server_event_phone_disconnected');
                updateVoiceStatus('Telefono desconectado. Puedes escanear el QR otra vez.');
                return;
            }

            if (payload.type === 'phone_status') {
                voiceLog('server_event_phone_status', payload.status || 'Telefono conectado.');
                updateVoiceStatus(payload.status || 'Telefono conectado.');
                return;
            }

            if (payload.type === 'user_started_speaking') {
                voiceLog('server_event_user_started_speaking');
                clearVoicePlayback();
                updateVoiceStatus('Te escucho...');
                return;
            }

            if (payload.type === 'user_turn') {
                voiceLog('server_event_user_turn', payload.text);
                appendAgentMessage('user', payload.text);
                updateVoiceStatus('Pensando y preparando la reserva...');
                runtime()?.showUserSpeech?.(payload.text);
                return;
            }

            if (payload.type === 'thinking') {
                voiceLog('server_event_thinking');
                updateVoiceStatus('Pensando y preparando la reserva...');
                return;
            }

            if (payload.type === 'assistant_turn') {
                voiceLog('server_event_assistant_turn', {
                    text: (payload.text || '').slice(0, 140),
                    hasExecutionPlan: Boolean(payload.executionPlan)
                });
                appendAgentMessage('assistant', payload.text, null);
                updateVoiceStatus('Respondiendo por voz...');
                runtime()?.clearUserSpeech?.();
                if (payload.executionPlan) {
                    executeWorkflowPlan(payload.executionPlan, 'voice').catch((error) => {
                        voiceLog('browser_execution_error', error.message || 'plan execution failed');
                        appendAgentMessage('assistant', error.message || 'No pude completar la reserva en esta pagina.', null, false);
                        updateVoiceStatus(error.message || 'No pude completar la reserva en esta pagina.');
                    });
                }
                return;
            }

            if (payload.type === 'assistant_audio_start') {
                voiceLog('server_event_assistant_audio_start');
                updateVoiceStatus('Hablando...');
                runtime()?.clearUserSpeech?.();
                return;
            }

            if (payload.type === 'function_call_request') {
                voiceLog('server_event_function_call_request', payload.functions || []);
                try {
                    await handleVoiceFunctionRequests(payload.functions || []);
                } catch (error) {
                    appendAgentMessage('assistant', error.message || 'No pude completar la reserva en esta pagina.', null, false);
                    updateVoiceStatus(error.message || 'No pude completar la reserva en esta pagina.');
                }
                return;
            }

            if (payload.type === 'audio_end') {
                voiceLog('server_event_audio_end');
                updateVoiceStatus('Escuchando...');
                return;
            }

            if (payload.type === 'voice_session_closed') {
                voiceLog('server_event_voice_session_closed');
                return;
            }

            if (payload.type === 'error') {
                voiceLog('server_event_error', payload.error || 'Error en la conversacion de voz.');
                appendAgentMessage('assistant', payload.error || 'Error en la conversacion de voz.', null, false);
                updateVoiceStatus(payload.error || 'Error en la conversacion de voz.');
            }
        });

        socket.addEventListener('close', () => {
            voiceLog('realtime_socket_close', { wasActive: voiceState.active });
            stopVoiceConversation({ announce: voiceState.active });
        });

        socket.addEventListener('error', (error) => {
            voiceLog('realtime_socket_error', error?.message || 'socket error');
        });
    }

    function stopVoiceConversation(options = {}) {
        voiceLog('stop_voice_conversation', {
            announce: options.announce !== false,
            active: voiceState.active,
            usingPhoneSession: Boolean(voiceState.phoneSession?.id)
        });
        clearVoicePlayback();
        const shouldAnnounce = options.announce !== false && voiceState.active;
        if (voiceState.socket && voiceState.socket.readyState === WebSocket.OPEN) {
            voiceState.socket.send(JSON.stringify({ type: 'stop' }));
            voiceState.socket.close();
        }

        if (voiceState.processor) {
            voiceState.processor.disconnect();
        }
        if (voiceState.source) {
            voiceState.source.disconnect();
        }
        if (voiceState.silenceGain) {
            voiceState.silenceGain.disconnect();
        }
        if (voiceState.stream) {
            voiceState.stream.getTracks().forEach((track) => track.stop());
        }
        if (voiceState.audioContext) {
            voiceState.audioContext.close();
        }

        voiceState.active = false;
        voiceState.socket = null;
        voiceState.stream = null;
        voiceState.audioContext = null;
        voiceState.processor = null;
        voiceState.source = null;
        voiceState.silenceGain = null;
        setVoiceButton(false);
        if (options.clearStatus !== false) {
            updateVoiceStatus('');
        }
        runtime()?.clearUserSpeech?.();
        if (shouldAnnounce) {
            runtime()?.speak('Conversacion de voz detenida.', { mode: 'idle' });
        }
    }

    async function openPhoneMicPairing() {
        openChatPanel();
        updateVoiceStatus('Preparando QR para usar el telefono como microfono...');
        setPhonePairingVisible(true);
        const requestedId = getStoredPhoneSessionId() || `phone_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;

        const payload = await requireApiClient().createPhoneSession({
            context: getPageContext(),
            requestedId
        });

        voiceState.phoneSession = payload;
        setStoredPhoneSessionId(payload.id);
        voiceLog('phone_session_created', {
            id: payload.id,
            phoneUrl: payload.phoneUrl
        });
        const qr = document.getElementById('phone-mic-qr');
        const url = document.getElementById('phone-mic-url');
        const floatingQr = document.getElementById('assistant-phone-mic-qr');
        const floatingUrl = document.getElementById('assistant-phone-mic-url');
        if (qr) qr.src = payload.qrDataUrl;
        if (url) url.textContent = payload.phoneUrl;
        if (floatingQr) floatingQr.src = payload.qrDataUrl;
        if (floatingUrl) floatingUrl.textContent = payload.phoneUrl;

        updateVoiceStatus('Escanea el QR con el telefono. Luego toca "Activar microfono" en el telefono.');
        await startVoiceConversation({ phoneSessionId: payload.id });
    }

    async function playAssistantGreeting() {
        return;
    }

    function getRealtimeDataChannel() {
        return voiceState.dataChannel && voiceState.dataChannel.readyState === 'open'
            ? voiceState.dataChannel
            : null;
    }

    function resetRealtimeTranscriptState() {
        voiceState.processedFunctionCalls = new Set();
        voiceState.assistantTranscript = new Map();
        voiceState.lastUserTranscript = '';
        voiceState.lastUserTranscriptAt = 0;
        voiceState.lastAssistantTranscript = '';
        voiceState.lastAssistantTranscriptAt = 0;
    }

    function normalizeVoiceTranscript(text) {
        return `${text || ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
    }

    function shouldIgnoreVoiceUserTranscript(text) {
        const normalized = normalizeVoiceTranscript(text);
        if (!normalized) {
            return true;
        }

        const fillerWords = new Set(['eh', 'em', 'mmm', 'mm', 'aja', 'ajá', 'ok', 'vale']);
        const now = Date.now();
        if (fillerWords.has(normalized) || normalized.length < 3) {
            return true;
        }

        return normalized === voiceState.lastUserTranscript
            && now - voiceState.lastUserTranscriptAt < 5000;
    }

    function shouldIgnoreVoiceAssistantTranscript(text) {
        const normalized = normalizeVoiceTranscript(text);
        if (!normalized) {
            return true;
        }

        const now = Date.now();
        return normalized === voiceState.lastAssistantTranscript
            && now - voiceState.lastAssistantTranscriptAt < 5000;
    }

    function sendRealtimeEvent(event) {
        const channel = getRealtimeDataChannel();
        if (!channel) {
            throw new Error('La sesion de voz no esta lista en este momento.');
        }
        channel.send(JSON.stringify(event));
    }

    function cancelActiveVoiceResponse() {
        if (voiceState.socket && voiceState.socket.readyState === WebSocket.OPEN) {
            voiceState.socket.send(JSON.stringify({ type: 'cancel_response' }));
            return;
        }

        if (getRealtimeDataChannel()) {
            sendRealtimeEvent({ type: 'response.cancel' });
        }
    }

    function encodeVoiceHeaderPayload(value) {
        const json = JSON.stringify(value || null);
        const bytes = new TextEncoder().encode(json);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 1) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    async function respondToRealtimeFunctionCall(callId, output) {
        sendRealtimeEvent({
            type: 'conversation.item.create',
            item: {
                type: 'function_call_output',
                call_id: callId,
                output: JSON.stringify(output)
            }
        });
        sendRealtimeEvent({ type: 'response.create' });
    }

    async function executeRealtimeFunctionCall(call) {
        const callId = `${call?.call_id || ''}`.trim();
        const functionName = `${call?.name || ''}`.trim();
        if (!callId || !functionName || voiceState.processedFunctionCalls.has(callId)) {
            return;
        }
        voiceState.processedFunctionCalls.add(callId);

        if (functionName !== 'execute_reservation_on_page') {
            await respondToRealtimeFunctionCall(callId, {
                ok: false,
                error: `Funcion no soportada en cliente: ${functionName || 'unknown'}`
            });
            return;
        }

        let args = {};
        try {
            args = JSON.parse(call.arguments || '{}');
        } catch (error) {
            await respondToRealtimeFunctionCall(callId, {
                ok: false,
                error: 'No pude interpretar los argumentos de la accion.'
            });
            return;
        }

        const workflowId = `${args.workflowId || ''}`.trim();
        const variables = args.variables && typeof args.variables === 'object' ? args.variables : {};

        if (!workflowId) {
            await respondToRealtimeFunctionCall(callId, {
                ok: false,
                error: 'Falto workflowId para ejecutar la reserva.'
            });
            return;
        }

        updateVoiceStatus('Ejecutando la reserva en esta pagina...');
        runtime()?.speak('Voy a resolverlo aqui mismo en la pagina.', { mode: 'executing' });

        try {
            const executionPlan = await fetchExecutionPlan(workflowId, variables);
            await executeWorkflowPlan(executionPlan, 'voice');
            await respondToRealtimeFunctionCall(callId, {
                ok: true,
                workflowId,
                executed: true,
                variables
            });
        } catch (error) {
            voiceLog('browser_execution_error', error.message || 'plan execution failed');
            await respondToRealtimeFunctionCall(callId, {
                ok: false,
                workflowId,
                error: error.message || 'No pude completar la reserva en esta pagina.'
            });
            throw error;
        }
    }

    async function handleRealtimeServerEvent(payload) {
        if (!payload || typeof payload !== 'object') {
            return;
        }

        if (payload.type === 'session.created' || payload.type === 'session.updated' || payload.type === 'response.created') {
            return;
        }

        if (payload.type === 'input_audio_buffer.speech_started') {
            voiceLog('openai_event_speech_started');
            updateVoiceStatus('Te escucho...');
            runtime()?.clearUserSpeech?.();
            return;
        }

        if (payload.type === 'input_audio_buffer.speech_stopped') {
            voiceLog('openai_event_speech_stopped');
            updateVoiceStatus('Procesando lo que dijiste...');
            return;
        }

        if (payload.type === 'conversation.item.input_audio_transcription.completed') {
            const transcript = `${payload.transcript || ''}`.trim();
            if (!transcript || shouldIgnoreVoiceUserTranscript(transcript)) {
                return;
            }
            runtime()?.stopAudibleSpeech?.();
            voiceState.lastUserTranscript = normalizeVoiceTranscript(transcript);
            voiceState.lastUserTranscriptAt = Date.now();
            voiceLog('openai_event_user_turn', transcript);
            emitPluginEvent('voice.transcript.captured', {
                role: 'user',
                transcript,
                mode: 'openai-realtime'
            });
            appendAgentMessage('user', transcript);
            runtime()?.showUserSpeech?.(transcript);
            updateVoiceStatus('Pensando y preparando la reserva...');
            try {
                cancelActiveVoiceResponse();
            } catch (error) {
                voiceLog('openai_cancel_response_error', error.message || 'cancel failed');
            }
            try {
                await sendMessageToAgentBackend(transcript, {
                    appendUser: false,
                    trigger: 'voice',
                    speakReply: false
                });
                updateVoiceStatus('Reserva ejecutada desde el chat del asistente...');
            } catch (error) {
                updateVoiceStatus(error.message || 'No pude completar la reserva en esta pagina.');
            }
            return;
        }

        if (payload.type === 'response.output_audio_transcript.done') {
            if (voiceState.socket) {
                return;
            }
            const transcript = `${payload.transcript || ''}`.trim();
            if (!transcript || shouldIgnoreVoiceAssistantTranscript(transcript)) {
                return;
            }
            voiceState.lastAssistantTranscript = normalizeVoiceTranscript(transcript);
            voiceState.lastAssistantTranscriptAt = Date.now();
            voiceLog('openai_event_assistant_turn', transcript.slice(0, 140));
            emitPluginEvent('voice.transcript.captured', {
                role: 'assistant',
                transcript,
                mode: 'openai-realtime'
            });
            appendAgentMessage('assistant', transcript, null);
            runtime()?.clearUserSpeech?.();
            updateVoiceStatus('Escuchando...');
            return;
        }

        if (payload.type === 'response.output_item.done' && payload.item?.type === 'function_call') {
            try {
                await executeRealtimeFunctionCall(payload.item);
            } catch (error) {
                appendAgentMessage('assistant', error.message || 'No pude completar la reserva en esta pagina.', null, false);
                updateVoiceStatus(error.message || 'No pude completar la reserva en esta pagina.');
            }
            return;
        }

        if (payload.type === 'response.done' && Array.isArray(payload.response?.output)) {
            for (const item of payload.response.output) {
                if (item?.type !== 'function_call') {
                    continue;
                }
                try {
                    await executeRealtimeFunctionCall(item);
                } catch (error) {
                    appendAgentMessage('assistant', error.message || 'No pude completar la reserva en esta pagina.', null, false);
                    updateVoiceStatus(error.message || 'No pude completar la reserva en esta pagina.');
                }
            }
            return;
        }

        if (payload.type === 'error') {
            const message = payload.error?.message || payload.error || 'Error en la conversacion de voz.';
            voiceLog('openai_event_error', message);
            appendAgentMessage('assistant', message, null, false);
            updateVoiceStatus(message);
        }
    }

    function downsampleForRealtime(floatSamples, inputSampleRate) {
        const targetSampleRate = 24000;
        if (inputSampleRate === targetSampleRate) {
            return floatSamples;
        }

        const ratio = inputSampleRate / targetSampleRate;
        const outputLength = Math.floor(floatSamples.length / ratio);
        const output = new Float32Array(outputLength);
        let outputIndex = 0;
        let inputIndex = 0;

        while (outputIndex < outputLength) {
            const nextInputIndex = Math.floor((outputIndex + 1) * ratio);
            let sum = 0;
            let count = 0;

            for (let i = inputIndex; i < nextInputIndex && i < floatSamples.length; i += 1) {
                sum += floatSamples[i];
                count += 1;
            }

            output[outputIndex] = count > 0 ? sum / count : 0;
            outputIndex += 1;
            inputIndex = nextInputIndex;
        }

        return output;
    }

    async function handleRemoteVoiceSocketMessage(payload, effectivePhoneSessionId) {
        if (payload.type === 'ready') {
            voiceLog('server_event_ready', { phoneSessionId: effectivePhoneSessionId });
            updateVoiceStatus(effectivePhoneSessionId ? 'Te escucho desde el telefono.' : 'OpenAI Realtime listo. Puedes hablar.');
            if (effectivePhoneSessionId) {
                runtime()?.speak('Te escucho desde el telefono. Habla con naturalidad.', { mode: 'listening' });
            }
            return;
        }

        if (payload.type === 'phone_waiting') {
            voiceLog('server_event_phone_waiting');
            updateVoiceStatus('Esperando que el telefono se conecte por QR...');
            return;
        }

        if (payload.type === 'phone_connected') {
            voiceLog('server_event_phone_connected');
            updateVoiceStatus('Telefono conectado. Activa el microfono en el telefono cuando quieras empezar.');
            return;
        }

        if (payload.type === 'phone_audio_started') {
            voiceLog('server_event_phone_audio_started');
            updateVoiceStatus('Audio del telefono recibido. Conectando OpenAI Realtime...');
            return;
        }

        if (payload.type === 'phone_disconnected') {
            voiceLog('server_event_phone_disconnected');
            updateVoiceStatus('Telefono desconectado. Puedes escanear el QR otra vez.');
            return;
        }

        if (payload.type === 'phone_status') {
            voiceLog('server_event_phone_status', payload.status || 'Telefono conectado.');
            updateVoiceStatus(payload.status || 'Telefono conectado.');
            return;
        }

        if (payload.type === 'user_started_speaking') {
            voiceLog('server_event_user_started_speaking');
            clearVoicePlayback();
            updateVoiceStatus('Te escucho...');
            return;
        }

        if (payload.type === 'user_turn') {
            runtime()?.stopAudibleSpeech?.();
            voiceLog('server_event_user_turn', payload.text);
            emitPluginEvent('voice.transcript.captured', {
                role: 'user',
                transcript: payload.text || '',
                mode: 'phone-realtime'
            });
            appendAgentMessage('user', payload.text);
            updateVoiceStatus('Pensando y preparando la reserva...');
            runtime()?.showUserSpeech?.(payload.text);
            try {
                cancelActiveVoiceResponse();
            } catch (error) {
                voiceLog('remote_cancel_response_error', error.message || 'cancel failed');
            }
            try {
                await sendMessageToAgentBackend(payload.text, {
                    appendUser: false,
                    trigger: 'voice',
                    speakReply: false
                });
                updateVoiceStatus('Reserva ejecutada desde el chat del asistente...');
            } catch (error) {
                updateVoiceStatus(error.message || 'No pude completar la reserva en esta pagina.');
            }
            return;
        }

        if (payload.type === 'thinking') {
            voiceLog('server_event_thinking');
            updateVoiceStatus('Pensando y preparando la reserva...');
            return;
        }

        if (payload.type === 'assistant_turn') {
            if (voiceState.socket) {
                return;
            }
            voiceLog('server_event_assistant_turn', {
                text: (payload.text || '').slice(0, 140)
            });
            emitPluginEvent('voice.transcript.captured', {
                role: 'assistant',
                transcript: payload.text || '',
                mode: 'phone-realtime'
            });
            appendAgentMessage('assistant', payload.text, null);
            updateVoiceStatus('Respondiendo por voz...');
            runtime()?.clearUserSpeech?.();
            return;
        }

        if (payload.type === 'assistant_audio_start') {
            voiceLog('server_event_assistant_audio_start');
            updateVoiceStatus('Hablando...');
            runtime()?.clearUserSpeech?.();
            return;
        }

        if (payload.type === 'function_call_request') {
            voiceLog('server_event_function_call_request', payload.functions || []);
            try {
                await handleVoiceFunctionRequests(payload.functions || []);
            } catch (error) {
                appendAgentMessage('assistant', error.message || 'No pude completar la reserva en esta pagina.', null, false);
                updateVoiceStatus(error.message || 'No pude completar la reserva en esta pagina.');
            }
            return;
        }

        if (payload.type === 'audio_end') {
            voiceLog('server_event_audio_end');
            updateVoiceStatus('Escuchando...');
            return;
        }

        if (payload.type === 'voice_session_closed') {
            voiceLog('server_event_voice_session_closed');
            return;
        }

        if (payload.type === 'error') {
            voiceLog('server_event_error', payload.error || 'Error en la conversacion de voz.');
            appendAgentMessage('assistant', payload.error || 'Error en la conversacion de voz.', null, false);
            updateVoiceStatus(payload.error || 'Error en la conversacion de voz.');
        }
    }

    async function startVoiceConversation(config = {}) {
        if (voiceState.active) {
            voiceLog('start_ignored_already_active');
            return;
        }

        const effectivePhoneSessionId = config.phoneSessionId || voiceState.phoneSession?.id || null;
        openChatPanel();
        updateVoiceStatus(effectivePhoneSessionId ? 'Reconectando audio del telefono...' : 'Conectando voz en tiempo real...');
        runtime()?.speak(
            effectivePhoneSessionId
                ? 'Estoy retomando el audio de tu telefono para seguir con la reserva.'
                : 'Te escucho. Habla con naturalidad y yo me encargo de la reserva.',
            { mode: 'listening' }
        );

        try {
            if (effectivePhoneSessionId) {
                const socket = new WebSocket(getRealtimeSocketUrl());
                socket.binaryType = 'arraybuffer';
                voiceState.socket = socket;

                socket.addEventListener('open', () => {
                    voiceLog('realtime_socket_open', { phoneSessionId: effectivePhoneSessionId });
                    socket.send(JSON.stringify({
                        type: 'start',
                        context: getPageContext(),
                        history: agentHistory.slice(-10),
                        phoneSessionId: effectivePhoneSessionId
                    }));
                    voiceState.active = true;
                    setVoiceButton(true);
                    updateVoiceStatus('Esperando audio del telefono...');
                    voiceLog('waiting_for_phone_audio', { phoneSessionId: effectivePhoneSessionId });
                });

                socket.addEventListener('message', async (event) => {
                    if (event.data instanceof ArrayBuffer) {
                        await playLinear16Audio(event.data);
                        return;
                    }

                    let payload;
                    try {
                        payload = JSON.parse(event.data);
                    } catch (error) {
                        return;
                    }

                    await handleRemoteVoiceSocketMessage(payload, effectivePhoneSessionId);
                });

                socket.addEventListener('close', () => {
                    voiceLog('realtime_socket_close', { wasActive: voiceState.active });
                    stopVoiceConversation({ announce: voiceState.active });
                });

                socket.addEventListener('error', (error) => {
                    voiceLog('realtime_socket_error', error?.message || 'socket error');
                });

                return;
            }

            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error('Este navegador no permite usar el microfono en tiempo real.');
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            const peerConnection = new RTCPeerConnection();
            const remoteAudio = document.createElement('audio');
            remoteAudio.autoplay = true;
            remoteAudio.playsInline = true;
            remoteAudio.style.display = 'none';
            document.body.appendChild(remoteAudio);

            peerConnection.ontrack = (event) => {
                remoteAudio.srcObject = event.streams[0];
                updateVoiceStatus('Hablando...');
            };

            stream.getTracks().forEach((track) => {
                peerConnection.addTrack(track, stream);
            });

            const dataChannel = peerConnection.createDataChannel('oai-events');
            dataChannel.addEventListener('message', async (event) => {
                let payload;
                try {
                    payload = JSON.parse(event.data);
                } catch (error) {
                    return;
                }
                await handleRealtimeServerEvent(payload);
            });

            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            const localSdp = `${peerConnection.localDescription?.sdp || offer.sdp || ''}`.trim();
            if (!localSdp || !localSdp.includes('m=audio')) {
                throw new Error('No pude generar una oferta de audio valida para iniciar la voz en tiempo real.');
            }

            const response = await requireApiClient().createOpenAiRealtimeSession(localSdp, {
                'X-Graph-Voice-Context': encodeVoiceHeaderPayload(getPageContext()),
                'X-Graph-Voice-History': encodeVoiceHeaderPayload(agentHistory.slice(-10))
            });

            const answerSdp = await response.text();
            if (!response.ok || !answerSdp) {
                let errorMessage = answerSdp || 'No pude iniciar la sesion de voz con OpenAI.';
                try {
                    const payload = JSON.parse(answerSdp || '{}');
                    errorMessage = payload.error || errorMessage;
                } catch (error) {
                    // Keep raw text when the response is not JSON.
                }
                throw new Error(errorMessage);
            }

            await peerConnection.setRemoteDescription({
                type: 'answer',
                sdp: answerSdp
            });

            await new Promise((resolve, reject) => {
                if (dataChannel.readyState === 'open') {
                    resolve();
                    return;
                }
                dataChannel.addEventListener('open', resolve, { once: true });
                dataChannel.addEventListener('error', () => reject(new Error('No pude abrir el canal de eventos de voz.')), { once: true });
            });

            resetRealtimeTranscriptState();
            voiceState.stream = stream;
            voiceState.peerConnection = peerConnection;
            voiceState.dataChannel = dataChannel;
            voiceState.remoteAudio = remoteAudio;
            voiceState.phoneSession = null;
            voiceState.active = true;
            setVoiceButton(true);
            updateVoiceStatus('Escuchando...');
            voiceLog('openai_realtime_connected', {
                model: response.headers.get('x-openai-realtime-model') || '',
                voice: response.headers.get('x-openai-realtime-voice') || ''
            });

            peerConnection.addEventListener('connectionstatechange', () => {
                const state = peerConnection.connectionState;
                voiceLog('openai_peer_connection_state', state);
                if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                    stopVoiceConversation({ announce: false });
                }
            });
        } catch (error) {
            const message = error.message || 'No pude acceder al microfono o iniciar la voz en tiempo real.';
            voiceLog('openai_realtime_error', message);
            updateVoiceStatus(message);
            appendAgentMessage('assistant', message, null, false);
            stopVoiceConversation({ announce: false });
        }
    }

    function stopVoiceConversation(options = {}) {
        voiceLog('stop_voice_conversation', {
            announce: options.announce !== false,
            active: voiceState.active,
            usingPhoneSession: Boolean(voiceState.socket)
        });
        clearVoicePlayback();
        const shouldAnnounce = options.announce !== false && voiceState.active;

        if (voiceState.socket) {
            if (voiceState.socket.readyState === WebSocket.OPEN) {
                try {
                    voiceState.socket.send(JSON.stringify({ type: 'stop' }));
                } catch (error) {
                    // Ignore shutdown races.
                }
            }
            try {
                voiceState.socket.close();
            } catch (error) {
                // Ignore close races.
            }
        }

        try {
            if (getRealtimeDataChannel()) {
                sendRealtimeEvent({ type: 'response.cancel' });
            }
        } catch (error) {
            // Ignore shutdown races.
        }

        if (voiceState.dataChannel) {
            try {
                voiceState.dataChannel.close();
            } catch (error) {
                // Ignore close races.
            }
        }
        if (voiceState.peerConnection) {
            try {
                voiceState.peerConnection.close();
            } catch (error) {
                // Ignore close races.
            }
        }
        if (voiceState.stream) {
            voiceState.stream.getTracks().forEach((track) => track.stop());
        }
        if (voiceState.remoteAudio) {
            try {
                voiceState.remoteAudio.pause();
                voiceState.remoteAudio.srcObject = null;
                voiceState.remoteAudio.remove();
            } catch (error) {
                // Ignore DOM cleanup races.
            }
        }

        voiceState.active = false;
        voiceState.socket = null;
        voiceState.peerConnection = null;
        voiceState.dataChannel = null;
        voiceState.stream = null;
        voiceState.audioContext = null;
        voiceState.processor = null;
        voiceState.source = null;
        voiceState.silenceGain = null;
        voiceState.remoteAudio = null;
        resetRealtimeTranscriptState();
        setVoiceButton(false);
        if (options.clearStatus !== false) {
            updateVoiceStatus('');
        }
        runtime()?.clearUserSpeech?.();
        if (shouldAnnounce) {
            runtime()?.speak('Conversacion de voz detenida.', { mode: 'idle' });
        }
    }

    async function openPhoneMicPairing() {
        openChatPanel();
        updateVoiceStatus('Preparando QR para usar el telefono como microfono...');
        setPhonePairingVisible(true);
        const requestedId = getStoredPhoneSessionId() || `phone_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;

        const payload = await requireApiClient().createPhoneSession({
            context: getPageContext(),
            requestedId
        });

        voiceState.phoneSession = payload;
        setStoredPhoneSessionId(payload.id);
        voiceLog('phone_session_created', {
            id: payload.id,
            phoneUrl: payload.phoneUrl
        });
        const qr = document.getElementById('phone-mic-qr');
        const url = document.getElementById('phone-mic-url');
        const floatingQr = document.getElementById('assistant-phone-mic-qr');
        const floatingUrl = document.getElementById('assistant-phone-mic-url');
        if (qr) qr.src = payload.qrDataUrl;
        if (url) url.textContent = payload.phoneUrl;
        if (floatingQr) floatingQr.src = payload.qrDataUrl;
        if (floatingUrl) floatingUrl.textContent = payload.phoneUrl;

        updateVoiceStatus('Escanea el QR con el telefono. Luego toca "Activar microfono" en el telefono.');
        await startVoiceConversation({ phoneSessionId: payload.id });
    }

    async function processVoiceComplaints() {
        updateImprovementPanelStatus('Procesando quejas reales capturadas por voz...');
        return requireApiClient().processVoiceComplaints({
            ...getPageContext(),
            workflowDescription: options.workflowDescription || ''
        });
    }

    async function startWorkflow() {
        const descField = document.getElementById('wf-desc');
        const description = (descField?.value || '').trim() || options.workflowDescription || document.title;
        if (descField && !descField.value) {
            descField.value = description;
        }
        runtime()?.pinBottomRight();
        runtime()?.speak(`Empece a aprender este recorrido: "${description}".`, { mode: 'recording' });
        emitPluginEvent('learning.session.requested', {
            description,
            context: getPageContext()
        });
        await window.WorkflowRecorder.startWorkflow(description, getPageContext());
        workflowPanelLoaded = false;
    }

    async function stopWorkflow() {
        runtime()?.unpin();
        runtime()?.speak('Listo, guarde este recorrido.', { mode: 'idle' });
        await window.WorkflowRecorder.stopWorkflow();
        emitPluginEvent('learning.session.stop_requested', {
            context: getPageContext()
        });
        workflowPanelLoaded = false;
    }

    async function resetWorkflow() {
        await window.WorkflowRecorder.resetWorkflow();
        workflowPanelLoaded = false;
    }

    function clearLongPressTimer() {
        if (longPressTimer) {
            window.clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    function bindLongPressGesture(buttonId, onLongPress, onClick) {
        const button = document.getElementById(buttonId);
        if (!button) return;

        button.addEventListener('pointerdown', () => {
            longPressTriggered = false;
            clearLongPressTimer();
            longPressTimer = window.setTimeout(() => {
                longPressTriggered = true;
                onLongPress();
            }, LONG_PRESS_MS);
        });

        ['pointerup', 'pointerleave', 'pointercancel'].forEach((eventName) => {
            button.addEventListener(eventName, clearLongPressTimer);
        });

        button.addEventListener('click', async (event) => {
            if (longPressTriggered) {
                event.preventDefault();
                event.stopPropagation();
                longPressTriggered = false;
                return;
            }

            await onClick();
        });
    }

    function bindControls() {
        document.getElementById('btn-start').addEventListener('click', startWorkflow);
        document.getElementById('btn-stop').addEventListener('click', stopWorkflow);

        bindLongPressGesture('btn-record-toggle', toggleWorkflowPanel, async () => {
            closeImprovementPanel();
            closeWorkflowPanel();

            if (window.WorkflowRecorder.isRecording()) {
                await stopWorkflow();
                return;
            }
            await startWorkflow();
        });

        bindLongPressGesture('pitch-generate', toggleImprovementPanel, async () => {
            toggleFeedbackOverlay();
        });

        bindLongPressGesture('voice-toggle', async () => {
            try {
                await openPhoneMicPairing();
            } catch (error) {
                updateVoiceStatus(error.message || 'No pude preparar el microfono del telefono.');
                appendAgentMessage('assistant', error.message || 'No pude preparar el microfono del telefono.', null, false);
            }
        }, async () => {
            if (voiceState.active) {
                stopVoiceConversation();
                return;
            }
            await startVoiceConversation();
        });

        document.getElementById('agent-send').addEventListener('click', async () => {
            const chat = document.getElementById('console-chat');
            const textarea = document.getElementById('agent-message');

            if (!chat.classList.contains('open')) {
                openChatPanel();
                return;
            }

            const message = textarea.value.trim();
            if (!message) {
                chat.classList.remove('open');
                updateConsoleExpandedState();
                return;
            }

            textarea.value = '';
            try {
                await sendMessageToAgentBackend(message, {
                    appendUser: true,
                    focusInput: true,
                    trigger: 'chat'
                });
            } catch (error) {
                // The helper already surfaced the error in chat.
            }
        });

        document.getElementById('agent-message').addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
                return;
            }

            event.preventDefault();
            document.getElementById('agent-send').click();
        });

        document.getElementById('workflow-panel-refresh').addEventListener('click', () => {
            loadWorkflowPanel(true);
        });

        document.getElementById('improvement-panel-refresh').addEventListener('click', () => {
            improvementPanelLoaded = false;
            loadImprovementPanel(true);
        });
        document.getElementById('feedback-overlay-toggle').addEventListener('click', () => {
            toggleFeedbackOverlay();
        });
        document.getElementById('improvement-run-pitch').addEventListener('click', async () => {
            await runPitchGeneration();
        });
        window.addEventListener('scroll', () => {
            if (feedbackOverlayVisible) {
                renderFeedbackOverlay();
            }
        }, { passive: true });
        window.addEventListener('resize', () => {
            if (feedbackOverlayVisible) {
                renderFeedbackOverlay();
            }
        });
        updateFeedbackOverlayButton();

        document.getElementById('workflow-panel-list').addEventListener('click', async (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;

            const workflowId = button.getAttribute('data-workflow-id');
            const action = button.getAttribute('data-action');
            if (!workflowId || !action) return;

            if (action === 'copy-id') {
                try {
                    await navigator.clipboard.writeText(workflowId);
                    updateWorkflowPanelStatus(`ID copiado: ${workflowId}`);
                } catch (error) {
                    updateWorkflowPanelStatus(`No se pudo copiar ${workflowId}.`);
                }
                return;
            }

            if (action === 'run-workflow') {
                button.disabled = true;
                try {
                    await executeWorkflowFromPanel(workflowId);
                } catch (error) {
                    updateWorkflowPanelStatus(error.message || 'No pude completar la reserva.');
                } finally {
                    button.disabled = false;
                }
                return;
            }

            if (action === 'delete-workflow') {
                const confirmed = window.confirm(`¿Borrar el workflow ${workflowId}? Esta accion no se puede deshacer.`);
                if (!confirmed) {
                    return;
                }

                button.disabled = true;
                try {
                    await deleteWorkflowFromPanel(workflowId);
                    workflowPanelLoaded = false;
                    await loadWorkflowPanel(true);
                } catch (error) {
                    updateWorkflowPanelStatus(error.message || 'No se pudo borrar el workflow.');
                } finally {
                    button.disabled = false;
                }
            }
        });
    }

    window.TrainerPlugin = {
        mount(config = {}) {
            options = buildMountOptions(config);
            ensureStyles();
            ensureConsole();
            if (!voiceState.phoneSession?.id) {
                const storedPhoneSessionId = getStoredPhoneSessionId();
                if (storedPhoneSessionId) {
                    voiceState.phoneSession = { id: storedPhoneSessionId };
                    voiceLog('restored_phone_session_id', storedPhoneSessionId);
                }
            }
            runtime()?.mount(options.assistantRuntime || DEFAULTS.assistantRuntime);
            if (!runtimeTouchBound) {
                runtime()?.subscribe?.('touched', () => {
                    const greeting = 'Hola, puedo ayudarte a reservar un vehiculo. Solo dime que necesitas y yo me encargo.';
                    runtime()?.speak(greeting, { mode: 'listening' });
                    playAssistantGreeting(greeting).catch(() => {});
                });
                runtime()?.subscribe?.('voice-button', async () => {
                    if (voiceState.active) {
                        stopVoiceConversation();
                        return;
                    }
                    await startVoiceConversation();
                });
                runtime()?.subscribe?.('voice-button-long-press', async () => {
                    try {
                        await openPhoneMicPairing();
                    } catch (error) {
                        updateVoiceStatus(error.message || 'No pude preparar el microfono del telefono.');
                        appendAgentMessage('assistant', error.message || 'No pude preparar el microfono del telefono.', null, false);
                    }
                });
                pluginEvents()?.on?.('learning.context.captured', (payload) => {
                    persistLearningContextNote(payload?.note || null);
                });
                runtimeTouchBound = true;
            }

            document.getElementById('agent-message').placeholder = options.aiPlaceholder;
            document.getElementById('wf-desc').value = options.workflowDescription || '';

            if (!mounted) {
                bindControls();
                mounted = true;
            }

            workflowPanelLoaded = false;
            improvementPanelLoaded = false;
            closeWorkflowPanel();
            closeImprovementPanel();
            updateConsoleExpandedState();

            if (options.autoSyncStatus && window.WorkflowRecorder?.syncStatus) {
                window.WorkflowRecorder.syncStatus();
            }

            window.setTimeout(() => {
                resumePendingExecution().catch((error) => {
                    updateWorkflowPanelStatus(error.message || 'No pude retomar la reserva pendiente.');
                });
            }, 120);

            if (!assistantPhonePairingBound) {
                window.addEventListener('resize', positionAssistantPhonePairing, { passive: true });
                window.addEventListener('scroll', positionAssistantPhonePairing, { passive: true });
                assistantPhonePairingBound = true;
            }
        },
        appendAgentMessage,
        getConfig() {
            return { ...options };
        },
        resetWorkflow,
        startWorkflow,
        stopWorkflow,
        openWorkflowPanel() {
            openWorkflowPanel();
            loadWorkflowPanel(true);
        },
        openImprovementPanel() {
            openImprovementPanel();
            loadImprovementPanel(true);
        }
    };
})();
