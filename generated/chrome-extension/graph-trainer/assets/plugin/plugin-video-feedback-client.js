(function () {
    const MAX_DURATION_MS = 60 * 1000;
    const MAX_UPLOAD_BYTES = 14 * 1024 * 1024;
    const VIDEO_BITS_PER_SECOND = 1200000;
    const AUDIO_BITS_PER_SECOND = 96000;

    function create(deps = {}) {
        const getOptions = typeof deps.getOptions === 'function' ? deps.getOptions : () => ({});
        const getPluginHost = typeof deps.getPluginHost === 'function' ? deps.getPluginHost : () => null;
        const runtime = typeof deps.runtime === 'function' ? deps.runtime : () => null;
        const requireApiClient = typeof deps.requireApiClient === 'function' ? deps.requireApiClient : () => null;
        const getPageContext = typeof deps.getPageContext === 'function' ? deps.getPageContext : () => ({});
        const appendAgentMessage = typeof deps.appendAgentMessage === 'function' ? deps.appendAgentMessage : () => {};
        const updateVoiceStatus = typeof deps.updateVoiceStatus === 'function' ? deps.updateVoiceStatus : () => {};
        const isWorkflowRecording = typeof deps.isWorkflowRecording === 'function' ? deps.isWorkflowRecording : () => false;

        const state = {
            active: false,
            uploading: false,
            stream: null,
            recorder: null,
            chunks: [],
            mimeType: '',
            startedAt: 0,
            timerId: null,
            stopPromise: null
        };

        function videoButton() {
            return document.getElementById('btn-video-feedback-toggle');
        }

        function stopBadge() {
            return document.getElementById('video-feedback-stop-timer');
        }

        function setButtonState(nextState, extra = {}) {
            const button = videoButton();
            if (!button) {
                return;
            }

            button.dataset.state = nextState;
            button.disabled = nextState === 'uploading';
            button.setAttribute('aria-pressed', nextState === 'recording' ? 'true' : 'false');

            const label = button.querySelector('.video-feedback-label');
            if (label) {
                if (nextState === 'recording') {
                    label.textContent = 'Stop';
                } else if (nextState === 'uploading') {
                    label.textContent = 'Subiendo';
                } else {
                    label.textContent = 'Video';
                }
            }

            const timer = stopBadge();
            if (timer) {
                timer.hidden = nextState !== 'recording';
                timer.textContent = extra.elapsedLabel || '00:00';
            }

            const titleByState = {
                idle: 'Grabar feedback en video',
                recording: 'Detener grabacion y analizar',
                uploading: 'Subiendo video para analizar',
                error: 'Volver a intentar grabacion de feedback',
                ready: 'Abrir ultimo resultado de feedback'
            };
            button.title = titleByState[nextState] || titleByState.idle;
            button.setAttribute('aria-label', titleByState[nextState] || titleByState.idle);
        }

        function formatElapsed(ms) {
            const totalSeconds = Math.max(0, Math.floor(ms / 1000));
            const minutes = `${Math.floor(totalSeconds / 60)}`.padStart(2, '0');
            const seconds = `${totalSeconds % 60}`.padStart(2, '0');
            return `${minutes}:${seconds}`;
        }

        function clearTimer() {
            if (state.timerId) {
                window.clearInterval(state.timerId);
                state.timerId = null;
            }
        }

        function stopTracks() {
            if (state.stream) {
                state.stream.getTracks().forEach((track) => track.stop());
            }
            state.stream = null;
        }

        function resetRecordingState() {
            clearTimer();
            stopTracks();
            state.recorder = null;
            state.chunks = [];
            state.mimeType = '';
            state.startedAt = 0;
            state.stopPromise = null;
            state.active = false;
        }

        function pickMimeType() {
            const candidates = [
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8,opus',
                'video/webm',
                'video/mp4'
            ];
            return candidates.find((candidate) => window.MediaRecorder?.isTypeSupported?.(candidate)) || '';
        }

        function blobToDataUrl(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(`${reader.result || ''}`);
                reader.onerror = () => reject(new Error('No pude leer el video grabado.'));
                reader.readAsDataURL(blob);
            });
        }

        async function startRecording() {
            if (state.active || state.uploading) {
                return;
            }
            if (isWorkflowRecording()) {
                throw new Error('Deten primero la grabacion del lapiz antes de capturar feedback en video.');
            }
            if (!navigator.mediaDevices?.getDisplayMedia) {
                throw new Error('Este navegador no permite capturar pantalla para este flujo.');
            }

            const mimeType = pickMimeType();
            const mediaConstraints = {
                video: {
                    cursor: 'always',
                    frameRate: { ideal: 12, max: 15 },
                    width: { ideal: 1920, max: 1920 },
                    height: { ideal: 1080, max: 1080 }
                },
                audio: true
            };

            let stream;
            try {
                stream = await navigator.mediaDevices.getDisplayMedia(mediaConstraints);
            } catch (error) {
                stream = await navigator.mediaDevices.getDisplayMedia({
                    ...mediaConstraints,
                    audio: false
                });
            }

            const recorder = mimeType
                ? new MediaRecorder(stream, {
                    mimeType,
                    videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
                    audioBitsPerSecond: AUDIO_BITS_PER_SECOND
                })
                : new MediaRecorder(stream, {
                    videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
                    audioBitsPerSecond: AUDIO_BITS_PER_SECOND
                });

            state.stream = stream;
            state.recorder = recorder;
            state.chunks = [];
            state.mimeType = recorder.mimeType || mimeType || 'video/webm';
            state.startedAt = Date.now();
            state.active = true;

            recorder.addEventListener('dataavailable', (event) => {
                if (event.data && event.data.size > 0) {
                    state.chunks.push(event.data);
                }
            });

            recorder.addEventListener('stop', () => {
                clearTimer();
                stopTracks();
            });

            stream.getVideoTracks().forEach((track) => {
                track.addEventListener('ended', () => {
                    if (state.active) {
                        stopRecording().catch((error) => {
                            updateVoiceStatus(error.message || 'No pude terminar la grabacion de feedback.');
                        });
                    }
                });
            });

            recorder.start(1000);
            runtime()?.speak?.('Graba el cambio que quieres construir y senalalo con el cursor.', { mode: 'recording' });
            appendAgentMessage('assistant', 'Grabacion de feedback iniciada. Cuando termines, toca de nuevo el boton de video.', null, false);
            updateVoiceStatus('Grabando feedback en video...');
            setButtonState('recording', { elapsedLabel: '00:00' });

            state.timerId = window.setInterval(() => {
                const elapsed = Date.now() - state.startedAt;
                setButtonState('recording', { elapsedLabel: formatElapsed(elapsed) });
                if (elapsed >= MAX_DURATION_MS) {
                    stopRecording().catch((error) => {
                        updateVoiceStatus(error.message || 'No pude detener la grabacion automaticamente.');
                    });
                }
            }, 250);
        }

        async function stopRecording() {
            if (!state.active || !state.recorder) {
                return;
            }
            if (state.stopPromise) {
                return state.stopPromise;
            }

            state.stopPromise = (async () => {
                const recorder = state.recorder;
                const stopped = new Promise((resolve, reject) => {
                    recorder.addEventListener('stop', resolve, { once: true });
                    recorder.addEventListener('error', () => reject(new Error('No pude cerrar la grabacion de feedback.')), { once: true });
                });

                recorder.stop();
                await stopped;

                const durationMs = Math.max(0, Date.now() - state.startedAt);
                const blob = new Blob(state.chunks, { type: state.mimeType || 'video/webm' });
                const mimeType = state.mimeType || blob.type || 'video/webm';
                resetRecordingState();

                if (!blob.size) {
                    setButtonState('error');
                    throw new Error('La grabacion salio vacia. Intenta de nuevo.');
                }

                if (blob.size > MAX_UPLOAD_BYTES) {
                    setButtonState('error');
                    throw new Error('El video quedo demasiado pesado. Intenta grabar un clip mas corto o enfocar solo el tramo clave.');
                }

                state.uploading = true;
                setButtonState('uploading');
                updateVoiceStatus('Subiendo video para generar prompts...');

                try {
                    const videoDataUrl = await blobToDataUrl(blob);
                    const response = await requireApiClient().analyzeVideoFeedback({
                        videoDataUrl,
                        mimeType,
                        durationMs,
                        pageContext: getPageContext()
                    });

                    const resultId = `${response.resultId || ''}`.trim();
                    if (!resultId) {
                        throw new Error('El analisis termino sin devolver un resultado valido.');
                    }

                    setButtonState('ready');
                    updateVoiceStatus('Prompts listos.');
                    runtime()?.speak?.('Ya quedaron listos los prompts para construir esos cambios.', { mode: 'idle' });
                    openResultPage(resultId);
                } finally {
                    state.uploading = false;
                    if (videoButton()?.dataset.state !== 'ready') {
                        setButtonState('idle');
                    }
                }
            })();

            return state.stopPromise;
        }

        function openResultPage(resultId) {
            const host = getPluginHost();
            const baseUrl = `${host?.apiBaseUrl || getOptions()?.apiBaseUrl || window.location.origin || ''}`.replace(/\/+$/, '');
            const url = `${baseUrl}/feedback-prompts/${encodeURIComponent(resultId)}`;
            window.open(url, '_blank', 'noopener');
        }

        async function toggleRecording() {
            if (state.uploading) {
                return;
            }
            if (state.active) {
                await stopRecording();
                return;
            }
            await startRecording();
        }

        function bindButton() {
            const button = videoButton();
            if (!button || button.dataset.bound === 'true') {
                return;
            }

            button.dataset.bound = 'true';
            setButtonState('idle');
            button.addEventListener('click', async () => {
                try {
                    await toggleRecording();
                } catch (error) {
                    setButtonState('error');
                    updateVoiceStatus(error.message || 'No pude grabar este feedback en video.');
                    appendAgentMessage('assistant', error.message || 'No pude grabar este feedback en video.', null, false);
                }
            });
        }

        return {
            bindButton,
            isRecording() {
                return state.active;
            },
            isBusy() {
                return state.uploading;
            }
        };
    }

    window.GraphPluginVideoFeedbackClient = {
        create
    };
})();
