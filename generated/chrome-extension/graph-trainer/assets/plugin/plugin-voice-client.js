(function () {
    function create(deps = {}) {
        const voiceState = deps.voiceState || {};
        const voiceLog = typeof deps.voiceLog === 'function' ? deps.voiceLog : () => {};
        const runtime = typeof deps.runtime === 'function' ? deps.runtime : () => null;
        const openChatPanel = typeof deps.openChatPanel === 'function' ? deps.openChatPanel : () => {};
        const updateVoiceStatus = typeof deps.updateVoiceStatus === 'function' ? deps.updateVoiceStatus : () => {};
        const setVoiceButton = typeof deps.setVoiceButton === 'function' ? deps.setVoiceButton : () => {};
        const setPhonePairingVisible = typeof deps.setPhonePairingVisible === 'function' ? deps.setPhonePairingVisible : () => {};
        const getStoredPhoneSessionId = typeof deps.getStoredPhoneSessionId === 'function' ? deps.getStoredPhoneSessionId : () => '';
        const setStoredPhoneSessionId = typeof deps.setStoredPhoneSessionId === 'function' ? deps.setStoredPhoneSessionId : () => {};
        const getRealtimeSocketUrl = typeof deps.getRealtimeSocketUrl === 'function' ? deps.getRealtimeSocketUrl : () => '';
        const getPageContext = typeof deps.getPageContext === 'function' ? deps.getPageContext : () => ({});
        const requireApiClient = typeof deps.requireApiClient === 'function' ? deps.requireApiClient : null;
        const appendAgentMessage = typeof deps.appendAgentMessage === 'function' ? deps.appendAgentMessage : () => {};
        const agentHistory = typeof deps.getAgentHistory === 'function' ? deps.getAgentHistory : () => [];
        const playLinear16Audio = typeof deps.playLinear16Audio === 'function' ? deps.playLinear16Audio : async () => {};
        const handleRemoteVoiceSocketMessage = typeof deps.handleRemoteVoiceSocketMessage === 'function' ? deps.handleRemoteVoiceSocketMessage : async () => {};
        const handleRealtimeServerEvent = typeof deps.handleRealtimeServerEvent === 'function' ? deps.handleRealtimeServerEvent : async () => {};
        const resetRealtimeTranscriptState = typeof deps.resetRealtimeTranscriptState === 'function' ? deps.resetRealtimeTranscriptState : () => {};
        const getRealtimeDataChannel = typeof deps.getRealtimeDataChannel === 'function' ? deps.getRealtimeDataChannel : () => null;
        const sendRealtimeEvent = typeof deps.sendRealtimeEvent === 'function' ? deps.sendRealtimeEvent : () => {};
        const executionMode = typeof deps.getExecutionMode === 'function' ? deps.getExecutionMode : () => 'openai-realtime';
        const updateImprovementPanelStatus = typeof deps.updateImprovementPanelStatus === 'function' ? deps.updateImprovementPanelStatus : () => {};

        async function startVoiceConversation(config = {}) {
            return deps.startVoiceConversationImpl?.(config);
        }

        function stopVoiceConversation(options = {}) {
            return deps.stopVoiceConversationImpl?.(options);
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

        async function processVoiceComplaints(workflowDescription = '') {
            updateImprovementPanelStatus('Procesando quejas reales capturadas por voz...');
            return requireApiClient().processVoiceComplaints({
                ...getPageContext(),
                workflowDescription
            });
        }

        function restoreStoredPhoneSession() {
            if (voiceState.phoneSession?.id) {
                return;
            }
            const storedPhoneSessionId = getStoredPhoneSessionId();
            if (storedPhoneSessionId) {
                voiceState.phoneSession = { id: storedPhoneSessionId };
                voiceLog('restored_phone_session_id', storedPhoneSessionId);
            }
        }

        return {
            startVoiceConversation,
            stopVoiceConversation,
            openPhoneMicPairing,
            processVoiceComplaints,
            restoreStoredPhoneSession
        };
    }

    window.GraphPluginVoiceClient = {
        create
    };
})();
