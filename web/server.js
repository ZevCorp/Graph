const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');

const Neo4jDriver = require('../src/infrastructure/Neo4jDriver');
const LLMProvider = require('../src/infrastructure/LLMProvider');
const PlaywrightRunner = require('../src/infrastructure/PlaywrightRunner');
const VoiceRealtimeGateway = require('../src/infrastructure/VoiceRealtimeGateway');
const Neo4jWorkflowRepository = require('../src/infrastructure/repositories/Neo4jWorkflowRepository');
const MarkdownCatalogWriter = require('../src/infrastructure/file-system/MarkdownCatalogWriter');

const WorkflowCatalog = require('../src/application/use-cases/WorkflowCatalog');
const WorkflowLearner = require('../src/application/use-cases/WorkflowLearner');
const WorkflowExecutor = require('../src/application/use-cases/WorkflowExecutor');
const AgentChat = require('../src/application/use-cases/AgentChat');
const GeneratePitchArtifacts = require('../src/application/use-cases/GeneratePitchArtifacts');
const ConversationInsights = require('../src/application/use-cases/ConversationInsights');

const GetGraphVisualization = require('../src/application/use-cases/GetGraphVisualization');

require('dotenv').config();

const app = express();

// Initialize Infrastructure
const db = new Neo4jDriver();
const llmProvider = new LLMProvider();
const playwrightRunner = new PlaywrightRunner(); // Decoupled!
const repository = new Neo4jWorkflowRepository(db);
const catalogWriter = new MarkdownCatalogWriter();

// Initialize Application Use Cases
const catalogService = new WorkflowCatalog(repository, catalogWriter);
const workflowLearner = new WorkflowLearner(repository, llmProvider, catalogWriter, catalogService);
const workflowExecutor = new WorkflowExecutor(catalogService, playwrightRunner, llmProvider);
const agentChat = new AgentChat(llmProvider, catalogService, workflowExecutor);
const generatePitchArtifacts = new GeneratePitchArtifacts(
  catalogService,
  llmProvider,
  path.join(process.cwd(), 'generated', 'pitch-personalities')
);
const conversationInsights = new ConversationInsights(
  llmProvider,
  path.join(process.cwd(), 'generated', 'conversation-insights')
);
const getGraphVisualization = new GetGraphVisualization(repository);

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.redirect('/examples/car-demo');
});

app.use(express.static('web/public'));
app.use('/rentacar/assets', express.static(path.join(process.cwd(), 'web/public', 'rentacar', 'assets')));

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

let currentWorkflowId = null;

function getLanHost() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }
  return 'localhost';
}

function getPublicBaseUrl(req) {
  const forwardedProto = `${req.get('x-forwarded-proto') || ''}`.split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'http';
  const host = req.get('host') || '';

  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  }

  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
  }

  if (process.env.RENDER || (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1'))) {
    return `${proto}://${host}`;
  }

  const port = req.app.get('port') || PORT;
  return `http://${getLanHost()}:${port}`;
}

function escapeHtml(value) {
  return `${value || ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CAR_DEMO_ASSISTANT_PROFILE = {
  tone: 'close, sincere, direct, human',
  style: 'helpful car-rental advisor',
  goals: [
    'Sound like a nearby, trustworthy salesperson.',
    'Guide the user through a natural conversation instead of a cold questionnaire.',
    'Ask about the trip, experience, route, passengers, luggage, and what the vehicle will be used for.',
    'Quietly collect the information needed to complete the forms correctly.',
    'Be direct about the missing information and avoid robotic wording.'
  ]
};

function injectTrainerShell(html, options = {}) {
  const workflowDescription = JSON.stringify(options.workflowDescription || '');
  const storageKey = JSON.stringify(options.storageKey || 'graph-page-state-v1');
  const appId = JSON.stringify(options.appId || '');
  const assistantProfile = JSON.stringify(options.assistantProfile || null);

  const scripts = `
<script src="/page-state.js"></script>
<script src="/recorder.js"></script>
<script src="/assistant-runtime.js"></script>
<script src="/trainer-plugin.js"></script>
<script>
window.addEventListener('load', function () {
  window.PageState.init({ storageKey: ${storageKey} });
  window.TrainerPlugin.mount({
    title: ${JSON.stringify(options.title || 'Trainer')},
    workflowDescription: ${workflowDescription},
    appId: ${appId},
    assistantProfile: ${assistantProfile}
  });
});
</script>
`;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${scripts}\n</body>`);
  }

  return `${html}\n${scripts}`;
}

function enhanceCarDemoHome(html) {
  return html
    .replace('action="reservar.html"', 'action="/rentacar/reservar.html" data-testid="car-quote-form"')
    .replace(
      /<input type="text" class="form-control datetimepicker-input dateArrow hasDatepicker" id="desde" name="desde" data-target="#dateDel" autocomplete="off" value="\s*([^"]*)">/,
      '<input type="date" class="form-control datetimepicker-input dateArrow" id="desde" data-testid="pickup-date" name="desde" data-target="#dateDel" autocomplete="off" value="$1">'
    )
    .replace('id="searchFormRangeDateTimePicker-starTime" class="form-control datetimepicker-input"', 'id="searchFormRangeDateTimePicker-starTime" data-testid="pickup-time" class="form-control datetimepicker-input"')
    .replace('id="lugEntId" required="required"', 'id="lugEntId" data-testid="pickup-location" required="required"')
    .replace(
      /<input type="text" class="form-control datetimepicker-input dateArrow hasDatepicker" id="hasta" name="hasta" data-target="#dateDev" autocomplete="off" value="\s*([^"]*)">/,
      '<input type="date" class="form-control datetimepicker-input dateArrow" id="hasta" data-testid="return-date" name="hasta" data-target="#dateDev" autocomplete="off" value="$1">'
    )
    .replace('id="searchFormRangeDateTimePicker-endTime" class="form-control datetimepicker-input"', 'id="searchFormRangeDateTimePicker-endTime" data-testid="return-time" class="form-control datetimepicker-input"')
    .replace('id="lugDevId" required="required"', 'id="lugDevId" data-testid="return-location" required="required"')
    .replace('<input type="submit" class="btn btn-success btn-sm btn-block form-control rounded border border-white text-black font-weight-bold" value="COTIZAR">', '<input id="quote-submit" data-testid="quote-submit" type="submit" class="btn btn-success btn-sm btn-block form-control rounded border border-white text-black font-weight-bold" value="COTIZAR">');
}

app.get('/examples/car-demo', (req, res) => {
  try {
    const htmlPath = path.join(process.cwd(), 'Demo de carros', 'Alquiler de Carros en Medellín _ Rent a Car Medellín 24h.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/\.\/Alquiler de Carros en MedellÃ­n _ Rent a Car MedellÃ­n 24h_files\//g, '/rentacar/assets/');
    html = html.replace(/\.\/Alquiler de Carros en Medellín _ Rent a Car Medellín 24h_files\//g, '/rentacar/assets/');
    html = enhanceCarDemoHome(html);
    html = injectTrainerShell(html, {
      title: 'Car Rental Trainer',
      workflowDescription: 'Car rental quote workflow',
      storageKey: 'graph-car-demo-state-v1',
      appId: 'car-demo',
      assistantProfile: CAR_DEMO_ASSISTANT_PROFILE
    });
    res.type('html').send(html);
  } catch (error) {
    console.error(`[Car Demo] Error: ${error.message}`);
    res.status(500).send(error.message);
  }
});

app.get('/api/status', (req, res) => {
  res.json({ recording: !!currentWorkflowId, id: currentWorkflowId });
});

app.post('/api/workflow/start', async (req, res) => {
  try {
    const description = (req.body?.description || '').trim() || 'Untitled workflow';
    currentWorkflowId = await workflowLearner.startSession(description, req.body?.context || {});
    console.log(`[Server] Starting workflow: ${currentWorkflowId}`);
    res.json({ id: currentWorkflowId });
  } catch (err) {
    console.error(`[Server] Start Error: ${err.message}`);
    currentWorkflowId = null;
    res.status(500).send(err.message);
  }
});

app.post('/api/step', async (req, res) => {
  try {
    const stepOrder = await workflowLearner.recordStep(currentWorkflowId, req.body);
    console.log(`[Server] Logging step ${stepOrder} for ${currentWorkflowId}`);
    res.sendStatus(200);
  } catch (err) {
    console.error(`[Server] Step Error: ${err.message}`);
    res.status(500).send(err.message);
  }
});

app.post('/api/workflow/stop', async (req, res) => {
  try {
    console.log(`[Server] Stopping workflow: ${currentWorkflowId}`);
    const summary = await workflowLearner.finishSession(currentWorkflowId);
    console.log(`[Server] Final Summary: ${summary}`);
    currentWorkflowId = null;
    res.sendStatus(200);
  } catch (err) {
    console.error(`[Server] Stop Error: ${err.message}`);
    res.status(500).send(err.message);
  }
});

app.get('/api/workflows', async (req, res) => {
  try {
    const workflows = await catalogService.getCatalog();
    res.json({ workflows });
  } catch (err) {
    console.error(`[Workflows] List Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/workflows/:id', async (req, res) => {
  try {
    const workflow = await catalogService.getWorkflowById(req.params.id);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    res.json({ workflow });
  } catch (err) {
    console.error(`[Workflows] Read Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/workflows', async (req, res) => {
  try {
    const workflow = req.body || {};
    workflow.id = (workflow.id || '').trim() || `wf_${Date.now()}`;
    const newWf = await catalogService.saveWorkflow(workflow);
    res.status(201).json({ workflow: newWf });
  } catch (err) {
    console.error(`[Workflows] Create Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/workflows/:id', async (req, res) => {
  try {
    const workflow = { ...req.body, id: (req.params.id || '').trim() };
    const updated = await catalogService.updateWorkflow(workflow);
    res.json({ workflow: updated });
  } catch (err) {
    console.error(`[Workflows] Update Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/workflows/:id', async (req, res) => {
  try {
    const workflowId = (req.params.id || '').trim();
    await catalogService.deleteWorkflow(workflowId);
    res.json({ deleted: true, id: workflowId });
  } catch (err) {
    console.error(`[Workflows] Delete Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/workflows/:id/execute', async (req, res) => {
  try {
    const workflowId = (req.params.id || '').trim();
    const workflow = await catalogService.getWorkflowById(workflowId);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    await workflowExecutor.executeById(workflowId, req.body?.variables || {});
    res.json({ executed: true, workflowId });
  } catch (err) {
    console.error(`[Workflows] Execute Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pitch/generate', async (req, res) => {
  try {
    const context = {
      appId: req.body?.appId || '',
      sourceUrl: req.body?.sourceUrl || '',
      sourceOrigin: req.body?.sourceOrigin || '',
      sourcePathname: req.body?.sourcePathname || '',
      sourceTitle: req.body?.sourceTitle || '',
      workflowDescription: req.body?.workflowDescription || '',
      assistantProfile: req.body?.assistantProfile || null
    };

    const result = await generatePitchArtifacts.execute(context);
    res.status(201).json(result);
  } catch (err) {
    console.error(`[Pitch] Generate Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pitch/improvements', async (req, res) => {
  try {
    const context = {
      appId: req.body?.appId || '',
      sourceUrl: req.body?.sourceUrl || '',
      sourceOrigin: req.body?.sourceOrigin || '',
      sourcePathname: req.body?.sourcePathname || '',
      sourceTitle: req.body?.sourceTitle || '',
      workflowDescription: req.body?.workflowDescription || '',
      assistantProfile: req.body?.assistantProfile || null
    };

    const result = await generatePitchArtifacts.previewImprovements(context);
    res.json(result);
  } catch (err) {
    console.error(`[Pitch] Improvement Preview Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/voice/complaints/process', async (req, res) => {
  try {
    const context = {
      appId: req.body?.appId || '',
      sourceUrl: req.body?.sourceUrl || '',
      sourceOrigin: req.body?.sourceOrigin || '',
      sourcePathname: req.body?.sourcePathname || '',
      sourceTitle: req.body?.sourceTitle || '',
      workflowDescription: req.body?.workflowDescription || '',
      assistantProfile: req.body?.assistantProfile || null
    };

    const workflows = generatePitchArtifacts.filterWorkflowsForContext(
      await catalogService.getCatalog(),
      context
    );
    const result = await conversationInsights.processComplaints(context, workflows);
    res.json(result);
  } catch (err) {
    console.error(`[Voice Complaints] Process Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/voice/phone-session', async (req, res) => {
  try {
    const id = `phone_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
    const phoneUrl = `${getPublicBaseUrl(req)}/phone-mic/${encodeURIComponent(id)}`;
    const qrDataUrl = await QRCode.toDataURL(phoneUrl, {
      margin: 1,
      width: 260
    });

    res.json({ id, phoneUrl, qrDataUrl });
  } catch (err) {
    console.error(`[Voice Phone] Session Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/phone-mic/:id', (req, res) => {
  const id = escapeHtml(req.params.id || '');
  res.type('html').send(`<!doctype html>
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
    const sessionId = ${JSON.stringify(id)};
    const statusEl = document.getElementById('status');
    const button = document.getElementById('toggle');
    const state = { active: false, socket: null, stream: null, audioContext: null, processor: null, source: null, silenceGain: null };

    function setStatus(text) { statusEl.textContent = text || ''; }
    function downsampleTo16k(floatSamples, inputSampleRate) {
      const targetSampleRate = 16000;
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
          const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const source = audioContext.createMediaStreamSource(stream);
          const processor = audioContext.createScriptProcessor(4096, 1, 1);
          const silenceGain = audioContext.createGain();
          silenceGain.gain.value = 0;
          processor.onaudioprocess = (event) => {
            if (!state.active || socket.readyState !== WebSocket.OPEN) return;
            const input = event.inputBuffer.getChannelData(0);
            socket.send(floatTo16BitPcm(downsampleTo16k(input, audioContext.sampleRate)));
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
</html>`);
});

app.post('/api/agent/chat', async (req, res) => {
  try {
    const response = await agentChat.handleMessage(req.body?.message, req.body?.history, req.body?.context || {});
    res.json(response);
  } catch (err) {
    console.error(`[Agent Chat] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/visualize', async (req, res) => {
  try {
    const data = await getGraphVisualization.execute();
    console.log(`[Visualize] Returning ${data.nodes.length} nodes and ${data.edges.length} edges`);
    res.json(data);
  } catch (err) {
    console.error(`[Visualize] Error: ${err.message}`);
    res.status(500).send(err.message);
  }
});

app.post('/api/reset', (req, res) => {
  console.log('[Server] Manual status reset');
  currentWorkflowId = null;
  res.sendStatus(200);
});

const PORT = process.env.PORT || process.env.WEB_PORT || 3000;
app.set('port', PORT);
const server = http.createServer(app);
const voiceGateway = new VoiceRealtimeGateway({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  agentChat,
  conversationInsights
});
voiceGateway.attach(server);

server.listen(PORT, () => console.log(`[Server] Running on http://localhost:${PORT}`));
