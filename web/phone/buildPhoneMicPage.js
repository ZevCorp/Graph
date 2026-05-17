function buildPhoneMicPage(sessionId) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Microfono Graph</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #101820; color: #f7fbff; }
    main { width: min(420px, calc(100vw - 32px)); display: grid; gap: 18px; text-align: center; }
    button { border: 0; border-radius: 999px; padding: 18px 22px; font: inherit; font-weight: 800; background: #22c55e; color: #092013; }
    button[data-active="true"] { background: #ef4444; color: white; }
    .status { min-height: 48px; color: #cbd5e1; line-height: 1.45; }
    .badge { width: fit-content; margin: 0 auto; padding: 7px 11px; border-radius: 999px; background: rgba(255,255,255,.1); color: #dbeafe; font-size: 12px; }
  </style>
</head>
<body>
  <main>
    <div class="badge">Graph phone mic</div>
    <h1>Usar este telefono como microfono</h1>
    <button id="toggle" type="button" data-active="false">Activar microfono</button>
    <div class="status" id="status">Abre la conversacion de voz en el computador y toca activar.</div>
  </main>
  <script>
    const sessionId = ${JSON.stringify(sessionId || '')};
    const statusEl = document.getElementById('status');
    const button = document.getElementById('toggle');
    const state = { active: false, socket: null, stream: null, audioContext: null, processor: null, source: null, silenceGain: null };

    function setStatus(text) { statusEl.textContent = text || ''; }
    function downsampleForRealtime(floatSamples, inputSampleRate) {
      const targetSampleRate = 24000;
      if (inputSampleRate === targetSampleRate) return floatSamples;
      const ratio = inputSampleRate / targetSampleRate;
      const outputLength = Math.floor(floatSamples.length / ratio);
      const output = new Float32Array(outputLength);
      let inputIndex = 0;
      for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
        const nextInputIndex = Math.floor((outputIndex + 1) * ratio);
        let sum = 0;
        let count = 0;
        for (let i = inputIndex; i < nextInputIndex && i < floatSamples.length; i += 1) {
          sum += floatSamples[i];
          count += 1;
        }
        output[outputIndex] = count ? sum / count : 0;
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
    async function start() {
      if (state.active) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('Este navegador no permite microfono en esta pagina. Si estas en HTTP, abre con HTTPS o un tunel seguro.');
        return;
      }
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(protocol + '//' + location.host + '/api/voice/phone-mic/' + encodeURIComponent(sessionId));
      socket.binaryType = 'arraybuffer';
      state.socket = socket;
      socket.addEventListener('open', async () => {
        setStatus('Conectado. Pidiendo permiso de microfono...');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true, latency: 0 } });
          const audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
          await audioContext.resume();
          const source = audioContext.createMediaStreamSource(stream);
          const processor = audioContext.createScriptProcessor(1024, 1, 1);
          const silenceGain = audioContext.createGain();
          silenceGain.gain.value = 0;
          processor.onaudioprocess = (event) => {
            if (!state.active || socket.readyState !== WebSocket.OPEN) return;
            const input = event.inputBuffer.getChannelData(0);
            socket.send(floatTo16BitPcm(downsampleForRealtime(input, audioContext.sampleRate)));
          };
          source.connect(processor);
          processor.connect(silenceGain);
          silenceGain.connect(audioContext.destination);
          Object.assign(state, { active: true, stream, audioContext, source, processor, silenceGain });
          button.dataset.active = 'true';
          button.textContent = 'Detener microfono';
          setStatus('Transmitiendo microfono al computador.');
          socket.send(JSON.stringify({ type: 'phone_status', status: 'Transmitiendo microfono desde el telefono.' }));
        } catch (error) {
          setStatus(error.message || 'No se pudo activar el microfono.');
          stop(false);
        }
      });
      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'desktop_connected') setStatus('Computador sincronizado. Toca activar y habla.');
        } catch (error) {}
      });
      socket.addEventListener('close', () => stop(false));
    }
    function stop(sendClose = true) {
      if (state.processor) state.processor.disconnect();
      if (state.source) state.source.disconnect();
      if (state.silenceGain) state.silenceGain.disconnect();
      if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
      if (state.audioContext) state.audioContext.close();
      if (sendClose && state.socket && state.socket.readyState === WebSocket.OPEN) state.socket.close();
      Object.assign(state, { active: false, socket: null, stream: null, audioContext: null, processor: null, source: null, silenceGain: null });
      button.dataset.active = 'false';
      button.textContent = 'Activar microfono';
    }
    button.addEventListener('click', () => state.active ? stop() : start());
  </script>
</body>
</html>`;
}

module.exports = buildPhoneMicPage;
