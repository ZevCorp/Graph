(function () {
    function events() {
        return window.GraphPluginEvents || null;
    }

    const state = {
        activeSession: null
    };

    function emit(eventName, payload) {
        events()?.emit?.(eventName, payload || {});
    }

    function startSession(payload) {
        state.activeSession = {
            sessionId: payload?.sessionId || '',
            startedAt: Date.now(),
            description: payload?.description || '',
            context: payload?.context || {},
            voiceNotes: []
        };
    }

    function stopSession() {
        state.activeSession = null;
    }

    function captureTranscript(payload) {
        if (!state.activeSession || !payload?.transcript) {
            return;
        }

        const note = {
            sessionId: state.activeSession.sessionId || '',
            transcript: `${payload.transcript || ''}`.trim(),
            role: payload.role || 'user',
            mode: payload.mode || 'unknown',
            capturedAt: Date.now()
        };

        if (!note.transcript) {
            return;
        }

        state.activeSession.voiceNotes.push(note);
        emit('learning.context.captured', {
            sessionId: state.activeSession.sessionId || '',
            description: state.activeSession.description,
            note,
            noteCount: state.activeSession.voiceNotes.length
        });
    }

    events()?.on?.('learning.session.started', startSession);
    events()?.on?.('learning.session.finished', stopSession);
    events()?.on?.('learning.session.reset', stopSession);
    events()?.on?.('voice.transcript.captured', captureTranscript);

    window.GraphLearningBridge = {
        getActiveSession() {
            return state.activeSession;
        },
        getVoiceNotes() {
            return state.activeSession?.voiceNotes?.slice() || [];
        },
        reset() {
            stopSession();
        }
    };
})();
