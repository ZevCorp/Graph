(function () {
    const DEFAULTS = {
        workflowDescription: '',
        title: 'Trainer',
        aiPlaceholder: 'Ask AI to execute a saved flow',
        autoSyncStatus: true,
        assistantProfile: null,
        assistantRuntime: {
            name: 'Graph',
            accentColor: '#0f5f8c',
            idleMessage: 'Puedo guiarte por esta pagina o ejecutar un workflow por ti.'
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
    const voiceState = {
        active: false,
        socket: null,
        stream: null,
        audioContext: null,
        processor: null,
        source: null,
        silenceGain: null,
        playbackContext: null,
        nextPlaybackTime: 0,
        ttsSampleRate: 24000,
        phoneSession: null
    };
    const executionState = {
        running: false
    };
    const EXECUTION_STORAGE_PREFIX = 'graph-browser-workflow-execution-v1';
    const EXECUTION_WAIT_TIMEOUT_MS = 15000;
    const EXECUTION_STEP_DELAY_MS = 180;

    function runtime() {
        return window.GraphAssistantRuntime || null;
    }

    function getPageContext() {
        return {
            appId: options.appId || '',
            sourceUrl: window.location.href,
            sourceOrigin: window.location.origin,
            sourcePathname: window.location.pathname,
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
                border: 1px solid #f1ddb6;
                border-radius: 16px;
                padding: 12px;
                background: linear-gradient(180deg, #fffaf0 0%, #fffdf8 100%);
                display: grid;
                gap: 8px;
            }
            .workflow-item-title {
                margin: 0;
                font-size: 13px;
                font-weight: 800;
                color: #1b2733;
            }
            .improvement-item-title {
                margin: 0;
                font-size: 13px;
                font-weight: 800;
                color: #5e3908;
            }
            .workflow-item-meta {
                font-size: 12px;
                color: #526170;
                line-height: 1.45;
            }
            .improvement-item-meta {
                font-size: 12px;
                color: #684f2e;
                line-height: 1.5;
                display: grid;
                gap: 6px;
            }
            .improvement-item-pill {
                display: inline-flex;
                align-items: center;
                width: fit-content;
                padding: 4px 8px;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 0.02em;
                background: #ffe6b8;
                color: #8a4b08;
            }
            .improvement-panel-footnote {
                padding: 10px 12px;
                border-radius: 14px;
                background: #fff7e8;
                line-height: 1.45;
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
                        <strong>Sugerencias para mejorar la pagina</strong>
                        <div class="improvement-panel-status" id="improvement-panel-status">Manten este boton oprimido para ver oportunidades de mejora.</div>
                    </div>
                    <button id="improvement-panel-refresh" type="button">Actualizar</button>
                </div>
                <div class="improvement-panel-list" id="improvement-panel-list"></div>
                <div class="improvement-panel-empty" id="improvement-panel-empty" hidden>No hay sugerencias disponibles para esta pagina todavia.</div>
                <div class="improvement-panel-footnote" id="improvement-panel-footnote">
                    Estas sugerencias salen por ahora de workflows y heuristicas del plugin. Proximamente se conectaran a evidencia real recolectada por el asistente de IA durante conversaciones de voz.
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
        return consoleEl;
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
        runtime()?.speak('Estoy listo para conversar contigo y decidir el siguiente workflow.', { mode: 'listening' });

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
            runtime()?.speak(text, { mode: 'assistant' });
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
    }

    function setPhonePairingVisible(visible) {
        const panel = document.getElementById('phone-mic-pairing');
        if (panel) {
            panel.classList.toggle('open', Boolean(visible));
        }
    }

    function normalizePathname(value) {
        return `${value || ''}`.trim();
    }

    function filterWorkflowsForCurrentPage(workflows) {
        const context = getPageContext();
        const appId = `${context.appId || ''}`.trim();
        const pathname = normalizePathname(context.sourcePathname);

        return (workflows || []).filter((workflow) => {
            if (appId && `${workflow.appId || ''}`.trim() !== appId) {
                return false;
            }
            return normalizePathname(workflow.sourcePathname) === pathname;
        });
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
        return `${EXECUTION_STORAGE_PREFIX}:${appId}`;
    }

    function readPendingExecution() {
        try {
            const raw = window.sessionStorage.getItem(getExecutionStorageKey());
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
            window.sessionStorage.removeItem(getExecutionStorageKey());
            return;
        }

        executionState.running = true;
        window.sessionStorage.setItem(getExecutionStorageKey(), JSON.stringify(plan));
    }

    function clearPendingExecution() {
        executionState.running = false;
        window.sessionStorage.removeItem(getExecutionStorageKey());
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

    async function applySelectStep(element, step, variables = {}) {
        const variableName = `input_${step.stepOrder}`;
        const requestedValue = Object.prototype.hasOwnProperty.call(variables, variableName)
            ? variables[variableName]
            : (step.selectedValue || step.selectedLabel || step.value || '');
        const normalizedRequested = normalizeChoiceText(requestedValue);
        const optionsList = Array.from(element.options || []);
        const selected = optionsList.find((option) =>
            normalizeChoiceText(option.value) === normalizedRequested
            || normalizeChoiceText(option.label || option.textContent || '') === normalizedRequested
            || normalizeChoiceText(option.textContent || '') === normalizedRequested
        ) || optionsList.find((option) =>
            normalizeChoiceText(option.value).includes(normalizedRequested)
            || normalizeChoiceText(option.label || option.textContent || '').includes(normalizedRequested)
            || normalizeChoiceText(option.textContent || '').includes(normalizedRequested)
        );

        if (!selected) {
            throw new Error(`No encontre una opcion compatible para ${describeStep(step)}.`);
        }

        element.scrollIntoView({ block: 'center', inline: 'nearest' });
        element.focus?.();
        element.value = selected.value;
        fireDomEvent(element, 'input');
        fireDomEvent(element, 'change');
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
            throw new Error('No hay un plan valido para ejecutar.');
        }

        if (executionState.running) {
            throw new Error('Ya hay un workflow corriendo en esta pagina.');
        }

        let currentPlan = updateExecutionProgress({
            ...cloneJson(plan),
            trigger,
            nextStepIndex: Number.isFinite(plan.nextStepIndex) ? plan.nextStepIndex : 0,
            startedAt: plan.startedAt || Date.now()
        }, Number.isFinite(plan.nextStepIndex) ? plan.nextStepIndex : 0);

        updateWorkflowPanelStatus(`Ejecutando ${currentPlan.workflowId} en esta pagina...`);

        for (let stepIndex = currentPlan.nextStepIndex; stepIndex < currentPlan.steps.length; stepIndex += 1) {
            const step = currentPlan.steps[stepIndex];
            const expectedUrl = step.url ? normalizeExecutionUrl(step.url) : '';

            if (step.actionType === 'navigation') {
                const targetUrl = normalizeExecutionUrl(step.url);
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
                if ('disabled' in element && element.disabled) {
                    throw new Error(`El elemento ${describeStep(step)} sigue deshabilitado.`);
                }

                currentPlan = updateExecutionProgress(currentPlan, stepIndex + 1);
                element.click();
            } else if (step.actionType === 'input') {
                await applyInputStep(element, step, currentPlan.variables || {});
                currentPlan = updateExecutionProgress(currentPlan, stepIndex + 1);
            } else if (step.actionType === 'select') {
                await applySelectStep(element, step, currentPlan.variables || {});
                currentPlan = updateExecutionProgress(currentPlan, stepIndex + 1);
            } else {
                currentPlan = updateExecutionProgress(currentPlan, stepIndex + 1);
            }

            await new Promise((resolve) => window.setTimeout(resolve, EXECUTION_STEP_DELAY_MS));
        }

        clearPendingExecution();
        updateWorkflowPanelStatus(`Workflow ${plan.workflowId} ejecutado en esta pagina.`);
        runtime()?.speak(`Termine de ejecutar ${plan.workflowId} en esta misma pagina.`, { mode: 'idle' });
    }

    async function fetchExecutionPlan(workflowId, variables = {}) {
        const response = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                variables,
                context: getPageContext()
            })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || 'No se pudo preparar el workflow.');
        }

        return payload.executionPlan || null;
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
            updateWorkflowPanelStatus(error.message || 'No pude reanudar el workflow en esta pagina.');
            appendAgentMessage('assistant', error.message || 'No pude reanudar el workflow en esta pagina.', 'execution error', false);
        }
    }

    async function executeWorkflowFromPanel(workflowId) {
        updateWorkflowPanelStatus(`Ejecutando ${workflowId}...`);
        runtime()?.speak(`Voy a ejecutar ${workflowId} y moverme por la pagina durante la automatizacion.`, { mode: 'executing' });
        const executionPlan = await fetchExecutionPlan(workflowId, {});
        await executeWorkflowPlan(executionPlan, 'panel');
    }

    async function generatePitchArtifacts() {
        updateWorkflowPanelStatus('Generando pitchpersonality.md y future-improvement.md...');
        runtime()?.speak('Estoy generando los artefactos de pitch y preparando el recorrido de mejoras.', { mode: 'tour' });

        const response = await fetch('/api/pitch/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...getPageContext(),
                workflowDescription: options.workflowDescription || ''
            })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || 'No se pudieron generar los archivos de pitch.');
        }

        return payload;
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

        const response = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`, {
            method: 'DELETE'
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || 'No se pudo borrar el workflow.');
        }

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
            item.innerHTML = `
                <div class="improvement-item-pill">Prioridad ${suggestion.priority || 'media'}</div>
                <h4 class="improvement-item-title">${suggestion.title || 'Sugerencia de mejora'}</h4>
                <div class="improvement-item-meta">
                    <div>${suggestion.summary || ''}</div>
                    <div><strong>Evidencia:</strong> ${suggestion.evidence || 'Sin evidencia todavia.'}</div>
                    <div><strong>Oportunidad:</strong> ${suggestion.opportunity || 'Sin oportunidad descrita.'}</div>
                    <div><strong>Origen:</strong> ${suggestion.source || 'Plugin'}</div>
                </div>
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
            const response = await fetch('/api/workflows');
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || 'No se pudo cargar el catalogo.');
            }

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
        updateImprovementPanelStatus('Procesando quejas de voz y oportunidades de mejora de esta pagina...');

        try {
            const voiceResult = await processVoiceComplaints();
            if ((voiceResult.complaintCount || 0) > 0) {
                renderImprovementPanel(voiceResult.suggestions || []);
                updateImprovementPanelStatus(`${voiceResult.complaintCount} queja(s) procesadas desde conversaciones de voz.`);
                return;
            }

            const response = await fetch('/api/pitch/improvements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...getPageContext(),
                    workflowDescription: options.workflowDescription || ''
                })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || 'No se pudieron cargar las sugerencias.');
            }

            renderImprovementPanel(payload.suggestions || []);
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

        const startAt = Math.max(audioContext.currentTime + 0.02, voiceState.nextPlaybackTime);
        source.start(startAt);
        voiceState.nextPlaybackTime = startAt + audioBuffer.duration;
    }

    async function startVoiceConversation(config = {}) {
        if (voiceState.active) {
            return;
        }

        openChatPanel();
        updateVoiceStatus(config.phoneSessionId ? 'Esperando audio del telefono...' : 'Conectando voz en tiempo real...');
        if (!config.phoneSessionId) {
            runtime()?.speak('Te escucho. Habla con naturalidad y ejecuto los workflows cuando tenga la informacion.', { mode: 'listening' });
        } else {
            runtime()?.speak('Escanea el QR y activa el microfono del telefono para empezar.', { mode: 'listening' });
        }

        const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${socketProtocol}//${window.location.host}/api/voice/realtime`);
        socket.binaryType = 'arraybuffer';
        voiceState.socket = socket;

        socket.addEventListener('open', async () => {
            socket.send(JSON.stringify({
                type: 'start',
                context: getPageContext(),
                history: agentHistory.slice(-10),
                phoneSessionId: config.phoneSessionId || null
            }));

            if (config.phoneSessionId) {
                voiceState.active = true;
                setVoiceButton(true);
                updateVoiceStatus('Escanea el QR y activa el microfono del telefono.');
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
                        autoGainControl: true
                    }
                });
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const source = audioContext.createMediaStreamSource(stream);
                const processor = audioContext.createScriptProcessor(4096, 1, 1);
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
            } catch (error) {
                const message = error.message || 'No pude acceder al microfono. Mantén presionado el botón de micrófono para sincronizar tu teléfono.';
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
                updateVoiceStatus(config.phoneSessionId ? 'Te escucho desde el telefono.' : 'Deepgram listo. Puedes hablar.');
                if (config.phoneSessionId) {
                    runtime()?.speak('Te escucho desde el telefono. Habla con naturalidad.', { mode: 'listening' });
                }
                return;
            }

            if (payload.type === 'phone_waiting') {
                updateVoiceStatus('Esperando que el telefono se conecte por QR...');
                return;
            }

            if (payload.type === 'phone_connected') {
                updateVoiceStatus('Telefono conectado. Activa el microfono en el telefono cuando quieras empezar.');
                return;
            }

            if (payload.type === 'phone_audio_started') {
                updateVoiceStatus('Audio del telefono recibido. Conectando Deepgram...');
                return;
            }

            if (payload.type === 'phone_disconnected') {
                updateVoiceStatus('Telefono desconectado. Puedes escanear el QR otra vez.');
                return;
            }

            if (payload.type === 'phone_status') {
                updateVoiceStatus(payload.status || 'Telefono conectado.');
                return;
            }

            if (payload.type === 'transcript_interim') {
                updateVoiceStatus(payload.text);
                return;
            }

            if (payload.type === 'user_turn') {
                appendAgentMessage('user', payload.text);
                updateVoiceStatus('Pensando y revisando workflows...');
                return;
            }

            if (payload.type === 'assistant_turn') {
                const meta = payload.workflowId ? `workflow=${payload.workflowId} | mode=${payload.executionPlan ? 'browser' : 'chat'}` : 'voice';
                appendAgentMessage('assistant', payload.text, meta);
                updateVoiceStatus('Respondiendo por voz...');
                if (payload.executionPlan) {
                    executeWorkflowPlan(payload.executionPlan, 'voice').catch((error) => {
                        appendAgentMessage('assistant', error.message || 'No pude ejecutar el workflow en esta pagina.', 'execution error', false);
                        updateVoiceStatus(error.message || 'No pude ejecutar el workflow en esta pagina.');
                    });
                }
                return;
            }

            if (payload.type === 'audio_end') {
                updateVoiceStatus('Escuchando...');
                return;
            }

            if (payload.type === 'error') {
                appendAgentMessage('assistant', payload.error || 'Error en la conversacion de voz.', null, false);
                updateVoiceStatus(payload.error || 'Error en la conversacion de voz.');
            }
        });

        socket.addEventListener('close', () => {
            stopVoiceConversation({ announce: voiceState.active });
        });
    }

    function stopVoiceConversation(options = {}) {
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
        if (shouldAnnounce) {
            runtime()?.speak('Conversacion de voz detenida.', { mode: 'idle' });
        }
    }

    async function openPhoneMicPairing() {
        openChatPanel();
        updateVoiceStatus('Preparando QR para usar el telefono como microfono...');
        setPhonePairingVisible(true);

        const response = await fetch('/api/voice/phone-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ context: getPageContext() })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || 'No pude crear la sincronizacion con telefono.');
        }

        voiceState.phoneSession = payload;
        const qr = document.getElementById('phone-mic-qr');
        const url = document.getElementById('phone-mic-url');
        if (qr) qr.src = payload.qrDataUrl;
        if (url) url.textContent = payload.phoneUrl;

        updateVoiceStatus('Escanea el QR con el telefono. Luego toca "Activar microfono" en el telefono.');
        await startVoiceConversation({ phoneSessionId: payload.id });
    }

    async function processVoiceComplaints() {
        updateImprovementPanelStatus('Procesando quejas reales capturadas por voz...');
        const response = await fetch('/api/voice/complaints/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...getPageContext(),
                workflowDescription: options.workflowDescription || ''
            })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || 'No se pudieron procesar las quejas de voz.');
        }

        return payload;
    }

    async function startWorkflow() {
        const descField = document.getElementById('wf-desc');
        const description = (descField?.value || '').trim() || options.workflowDescription || document.title;
        if (descField && !descField.value) {
            descField.value = description;
        }
        runtime()?.pinBottomRight();
        runtime()?.speak(`Empece a grabar el workflow "${description}".`, { mode: 'recording' });
        await window.WorkflowRecorder.startWorkflow(description, getPageContext());
        workflowPanelLoaded = false;
    }

    async function stopWorkflow() {
        runtime()?.unpin();
        runtime()?.speak('Guarde el workflow actual.', { mode: 'idle' });
        await window.WorkflowRecorder.stopWorkflow();
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
            const button = document.getElementById('pitch-generate');
            button.disabled = true;

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
                updateImprovementPanelStatus('Artefactos regenerados. Mantener oprimido muestra las sugerencias actualizadas.');
                startImprovementTour(result);
            } catch (error) {
                openChatPanel();
                appendAgentMessage('assistant', error.message || 'No se pudieron generar los archivos de pitch.', null, false);
                updateWorkflowPanelStatus(error.message || 'No se pudieron generar los archivos de pitch.');
                updateImprovementPanelStatus(error.message || 'No se pudieron regenerar las sugerencias.');
            } finally {
                button.disabled = false;
            }
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

            const historyForRequest = agentHistory.slice(-8);
            appendAgentMessage('user', message);
            textarea.value = '';

            const response = await fetch('/api/agent/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    history: historyForRequest,
                    context: getPageContext(),
                    executionMode: 'browser'
                })
            });

            const payload = await response.json();
            if (!response.ok) {
                appendAgentMessage('assistant', payload.error || 'Something went wrong.');
                return;
            }

            const meta = payload.workflowId ? `workflow=${payload.workflowId} | mode=${payload.executionPlan ? 'browser' : 'chat'}` : null;
            appendAgentMessage('assistant', payload.reply, meta);
            if (payload.executionPlan) {
                try {
                    await executeWorkflowPlan(payload.executionPlan, 'chat');
                } catch (error) {
                    appendAgentMessage('assistant', error.message || 'No pude ejecutar el workflow en esta pagina.', 'execution error', false);
                    updateWorkflowPanelStatus(error.message || 'No pude ejecutar el workflow en esta pagina.');
                }
            }
            textarea.focus();
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
            processVoiceComplaints()
                .then((payload) => {
                    if ((payload.complaintCount || 0) > 0) {
                        renderImprovementPanel(payload.suggestions || []);
                        updateImprovementPanelStatus(`${payload.complaintCount} queja(s) procesadas desde conversaciones de voz.`);
                        return;
                    }
                    loadImprovementPanel(true);
                })
                .catch((error) => {
                    updateImprovementPanelStatus(error.message || 'No se pudieron procesar las quejas de voz.');
                });
        });

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
                    updateWorkflowPanelStatus(error.message || 'No se pudo ejecutar el workflow.');
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
            options = { ...DEFAULTS, ...config };
            ensureStyles();
            ensureConsole();
            runtime()?.mount(options.assistantRuntime || DEFAULTS.assistantRuntime);

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
                    updateWorkflowPanelStatus(error.message || 'No pude reanudar el workflow pendiente.');
                });
            }, 120);
        },
        appendAgentMessage,
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
