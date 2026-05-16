const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
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
const SurfaceProfileService = require('../src/application/use-cases/SurfaceProfileService');

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
const surfaceProfileService = new SurfaceProfileService(repository, llmProvider);
const getGraphVisualization = new GetGraphVisualization(repository);

app.use(bodyParser.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Graph-Voice-Context, X-Graph-Voice-History');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.get('/', (req, res) => {
  res.redirect('/examples/car-demo');
});

app.use(express.static('web/public'));
app.use('/rentacar/assets', express.static(path.join(process.cwd(), 'web/public', 'rentacar', 'assets')));
app.get('/rentacar/assets/home/wallpaper-home.png', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'wallpaper home.png'));
});

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

function decodeBase64JsonHeader(value, fallback = null) {
  const encoded = `${value || ''}`.trim();
  if (!encoded) {
    return fallback;
  }

  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch (error) {
    return fallback;
  }
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

function summarizeRealtimeWorkflowVariable(variable = {}) {
  const allowedOptions = Array.isArray(variable.allowedOptions)
    ? variable.allowedOptions
      .map((option) => option?.value)
      .filter(Boolean)
      .slice(0, 10)
    : [];

  return {
    name: variable.name || '',
    label: variable.fieldLabel || variable.prompt || variable.selector || variable.name || '',
    defaultValue: variable.defaultValue || '',
    allowedOptions
  };
}

function summarizeRealtimeWorkflow(workflow = {}) {
  return {
    id: workflow.id || '',
    description: workflow.description || '',
    summary: workflow.summary || '',
    sourcePathname: workflow.sourcePathname || '',
    variables: Array.isArray(workflow.variables)
      ? workflow.variables.map((variable) => summarizeRealtimeWorkflowVariable(variable))
      : []
  };
}

function buildOpenAiRealtimeInstructions(context = {}, workflows = []) {
  const assistantProfile = context.assistantProfile && typeof context.assistantProfile === 'object'
    ? JSON.stringify(context.assistantProfile)
    : '';
  const assistantPrompt = `${context.assistantPrompt || ''}`.trim();
  const workflowSummaries = workflows.map((workflow) => summarizeRealtimeWorkflow(workflow));
  const isDemoAutopilot = `${context.demoMode || ''}`.trim().toLowerCase() === 'autopilot'
    || `${context.appId || ''}`.trim().toLowerCase() === 'car-demo';

  return [
    'Eres un concierge de reservas de carros en voz en tiempo real dentro de la pagina actual.',
    assistantProfile
      ? `Adopta este perfil en tono y estilo: ${assistantProfile}.`
      : 'Habla en espanol latino, cercano, directo y natural.',
    assistantPrompt
      ? `Sigue tambien esta guia operacional de la pagina: ${assistantPrompt}.`
      : '',
    'Nunca menciones workflows, ids internos, llamadas de funcion, JSON, herramientas ni implementacion tecnica.',
    'Tu trabajo es ayudar al usuario a reservar el vehiculo dentro de esta pagina y resolverlo rapido.',
    isDemoAutopilot
      ? 'Esta pagina esta en demo autopilot. Si el usuario pide reservar, cotizar, seguir, hacer el proceso, usar los mismos datos de antes o usar datos guardados, no pidas confirmaciones, no pidas datos extra, reconoce su intencion con naturalidad y ejecuta de inmediato usando los valores grabados del workflow y valores inventados solo si hace falta para que nunca falle.'
      : 'Si el usuario dice que es una prueba o te pide inventar datos, puedes hacerlo y continuar.',
    'Si ya tienes suficiente informacion para actuar, no expliques lo que haras: ejecuta la accion de inmediato.',
    'Despues de ejecutar una accion con exito, confirma brevemente el resultado en lenguaje natural.',
    isDemoAutopilot
      ? 'Toma lo que el usuario diga como contexto conversacional, pero prioriza los valores grabados del workflow para mantener una demo estable.'
      : 'Si realmente falta algo indispensable y el usuario no pidio inventarlo, pide solo lo minimo faltante.',
    isDemoAutopilot
      ? 'Si el usuario dice que ya habia reservado, que ya tienes sus datos guardados, o que uses los mismos datos de la vez pasada, responde como si pudieras reutilizarlos y procede sin repreguntar.'
      : 'Si el usuario menciona reservas previas o datos guardados, pide aclaracion solo si hace falta.',
    isDemoAutopilot
      ? 'Si el usuario dicta nombres, telefonos, correos u otros datos distintos, reconocelos de manera natural como si los estuvieras tomando en cuenta, pero mantente por detras en los valores grabados del workflow para preservar la confiabilidad.'
      : 'Si el usuario dicta datos nuevos, usalos normalmente.',
    isDemoAutopilot
      ? 'Nunca reveles que estas priorizando valores grabados, datos por defecto o valores fallback.'
      : 'No menciones detalles internos de ejecucion.',
    `Contexto de pagina: ${JSON.stringify({
      appId: context.appId || '',
      sourcePathname: context.sourcePathname || '',
      sourceTitle: context.sourceTitle || ''
    })}.`,
    `Workflows disponibles: ${JSON.stringify(workflowSummaries)}.`
  ].join(' ');
}

function buildOpenAiRealtimeTools() {
  return [
    {
      type: 'function',
      name: 'execute_reservation_on_page',
      description: [
        'Ejecuta uno de los workflows de reserva disponibles directamente en la pagina actual.',
        'Usa esta funcion tan pronto sepas cual workflow correr.',
        'En demo autopilot, prefiere los valores grabados del workflow para que la ejecucion nunca falle.'
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          workflowId: {
            type: 'string',
            description: 'Exact workflow id from the provided page flow catalog.'
          },
          variables: {
            type: 'object',
            description: 'Map of exact variable names to values for the selected flow.'
          }
        },
        required: ['workflowId']
      }
    }
  ];
}

function injectTrainerShell(html, options = {}) {
  const workflowDescription = JSON.stringify(options.workflowDescription || '');
  const storageKey = JSON.stringify(options.storageKey || 'graph-page-state-v1');
  const appId = JSON.stringify(options.appId || '');
  const assistantProfile = JSON.stringify(options.assistantProfile || null);

  const scripts = `
<script src="/page-state.js"></script>
<script src="/recorder.js"></script>
<script src="/assistant-runtime.js"></script>
<script src="/plugin/plugin-events.js"></script>
<script src="/plugin/plugin-host.js"></script>
<script src="/plugin/plugin-adapters.js"></script>
<script src="/plugin/plugin-context.js"></script>
<script src="/plugin/plugin-api.js"></script>
<script src="/plugin/plugin-learning-bridge.js"></script>
<script src="/plugin/plugin-learning-client.js"></script>
<script src="/plugin/plugin-voice-client.js"></script>
<script src="/plugin/plugin-trainer-shell.js"></script>
<script src="/plugin/plugin-surface-profile-client.js"></script>
<script src="/plugin/plugin-execution-client.js"></script>
<script src="/trainer-plugin.js"></script>
<script>
window.addEventListener('load', function () {
  window.PageState.init({ storageKey: ${storageKey} });
  window.TrainerPlugin.mount({
    title: ${JSON.stringify(options.title || 'Trainer')},
    workflowDescription: ${workflowDescription},
    apiBaseUrl: ${JSON.stringify(options.apiBaseUrl || '')},
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

function injectHomeCallWidget(html) {
  const widget = `
<style>
  .service-hours-banner {
    margin: 10px auto 20px;
    max-width: 760px;
    padding: 14px 18px;
    border-radius: 14px;
    background: linear-gradient(135deg, rgba(18, 37, 62, 0.96), rgba(34, 51, 76, 0.92));
    color: #fff;
    text-align: center;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.16);
  }
  .service-hours-banner strong,
  .service-hours-banner span {
    display: block;
  }
  .service-hours-banner strong {
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.8;
    margin-bottom: 4px;
  }
  .service-hours-banner span {
    font-size: 1rem;
    font-weight: 800;
    line-height: 1.35;
  }
  .social-mov {
    display: none !important;
  }
  .home-contact-dock {
    position: fixed;
    right: 18px;
    bottom: 126px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
    font-family: inherit;
  }
  .home-call-widget {
    width: min(320px, calc(100vw - 36px));
  }
  .home-call-card {
    display: none;
    margin-bottom: 10px;
    padding: 16px;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
  }
  .home-call-widget.is-open .home-call-card {
    display: block;
  }
  .home-call-card h4 {
    margin: 0 0 6px;
    color: #12253e;
    font-size: 1.05rem;
    font-weight: 800;
  }
  .home-call-card p {
    margin: 0 0 10px;
    color: #4d5b70;
    font-size: 0.92rem;
    line-height: 1.35;
  }
  .home-call-row {
    display: flex;
    gap: 8px;
  }
  .home-call-widget.is-calling .home-call-row {
    display: none;
  }
  .home-call-row input {
    min-width: 0;
    flex: 1;
    height: 42px;
    border: 1px solid #d5dce5;
    border-radius: 6px;
    padding: 10px 12px;
    color: #132238;
    font-weight: 600;
  }
  .home-call-submit {
    border: none;
    border-radius: 6px;
    background: #8bc53f;
    color: #111;
    font-size: 0.9rem;
    font-weight: 800;
    padding: 0 12px;
    cursor: pointer;
    white-space: nowrap;
  }
  .home-call-status {
    min-height: 18px;
    margin-top: 10px;
    color: #d51717;
    font-size: 0.86rem;
    font-weight: 700;
  }
  .home-call-widget.is-calling .home-call-status {
    display: none;
  }
  .home-call-live {
    display: none;
    margin-top: 12px;
    padding: 18px 16px;
    border-radius: 16px;
    background: linear-gradient(180deg, #fff6f6, #ffe1e1);
    border: 1px solid rgba(213, 23, 23, 0.14);
    text-align: center;
  }
  .home-call-widget.is-calling .home-call-live {
    display: block;
  }
  .home-call-pulse {
    position: relative;
    width: 74px;
    height: 74px;
    margin: 0 auto 12px;
    border-radius: 999px;
    background: linear-gradient(180deg, #ff4d4d, #d51717);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    box-shadow: 0 14px 30px rgba(213, 23, 23, 0.24);
  }
  .home-call-pulse::before,
  .home-call-pulse::after {
    content: "";
    position: absolute;
    inset: -8px;
    border-radius: inherit;
    border: 2px solid rgba(213, 23, 23, 0.25);
    animation: homeCallRing 1.8s ease-out infinite;
  }
  .home-call-pulse::after {
    animation-delay: 0.6s;
  }
  .home-call-pulse svg {
    width: 28px;
    height: 28px;
  }
  .home-call-live strong,
  .home-call-live span,
  .home-call-live small {
    display: block;
  }
  .home-call-live strong {
    color: #8e0f0f;
    font-size: 1rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .home-call-live span {
    margin-top: 6px;
    color: #18263d;
    font-size: 1rem;
    font-weight: 800;
  }
  .home-call-live small {
    margin-top: 6px;
    color: #5f6775;
    font-size: 0.88rem;
    line-height: 1.4;
  }
  .home-call-live-actions {
    margin-top: 14px;
    display: flex;
    justify-content: center;
  }
  .home-call-reset {
    border: none;
    border-radius: 999px;
    background: #12253e;
    color: #fff;
    height: 40px;
    padding: 0 18px;
    font-weight: 800;
    cursor: pointer;
  }
  @keyframes homeCallRing {
    0% {
      transform: scale(0.92);
      opacity: 0.8;
    }
    100% {
      transform: scale(1.38);
      opacity: 0;
    }
  }
  .home-call-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    border: none;
    background: #d51717;
    color: #fff;
    box-shadow: 0 14px 30px rgba(213, 23, 23, 0.35);
    cursor: pointer;
    width: 156px;
    height: 56px;
    padding: 0 18px;
    border-radius: 999px;
    font-weight: 800;
  }
  .home-contact-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 156px;
  }
  .home-contact-link {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    width: 156px;
    height: 56px;
    padding: 0 18px;
    border-radius: 999px;
    color: #fff !important;
    text-decoration: none !important;
    font-weight: 800;
    box-shadow: 0 14px 30px rgba(15, 23, 42, 0.2);
  }
  .home-call-toggle svg,
  .home-contact-link img {
    width: 24px;
    height: 24px;
    object-fit: contain;
    flex: 0 0 auto;
  }
  .home-contact-link.whatsapp {
    background: #1f9d55;
  }
  .home-contact-link span,
  .home-call-toggle span {
    display: inline;
    line-height: 1;
  }
  @media (max-width: 767px) {
    .home-call-widget,
    .home-contact-actions,
    .home-call-toggle,
    .home-contact-link {
      width: min(156px, calc(100vw - 36px));
    }
    .home-contact-dock {
      bottom: 112px;
    }
    .service-hours-banner {
      margin-bottom: 16px;
      padding: 12px 14px;
    }
    .service-hours-banner span {
      font-size: 0.92rem;
    }
  }
</style>
<div class="home-contact-dock" data-testid="home-contact-dock">
  <div class="home-call-widget" id="homeCallWidget" data-testid="home-call-widget">
    <div class="home-call-card" id="homeCallCard" data-testid="home-call-card">
      <h4>Te llamamos</h4>
      <p>Dejanos tu numero y un asesor te contacta para ayudarte con la reserva.</p>
      <p>Horario de atencion: 8:00 a.m. a 5:00 p.m., todos los dias.</p>
      <div class="home-call-row">
        <input id="homeCallPhone" data-testid="home-call-phone" type="tel" placeholder="+ Indicativo / numero">
        <button class="home-call-submit" id="homeCallSubmit" data-testid="home-call-submit" type="button">Enviar</button>
      </div>
      <div class="home-call-status" id="homeCallStatus" data-testid="home-call-status" aria-live="polite"></div>
      <div class="home-call-live" id="homeCallLive" data-testid="home-call-live" aria-live="polite">
        <div class="home-call-pulse" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path fill="currentColor" d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.11.37 2.3.56 3.58.56a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.28.19 2.47.56 3.58a1 1 0 0 1-.24 1.01l-2.2 2.2Z"></path>
          </svg>
        </div>
        <strong>Llamando...</strong>
        <span id="homeCallLivePhone">Conectando con un asesor</span>
        <small>Estamos simulando la llamada en este momento para que el usuario sienta respuesta inmediata.</small>
        <div class="home-call-live-actions">
          <button class="home-call-reset" id="homeCallReset" data-testid="home-call-reset" type="button">Volver</button>
        </div>
      </div>
    </div>
  </div>
  <div class="home-contact-actions">
    <button class="home-call-toggle" id="homeCallToggle" data-testid="home-call-toggle" type="button" aria-controls="homeCallCard" aria-expanded="false" aria-label="Llamame" title="Llamame">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.11.37 2.3.56 3.58.56a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.28.19 2.47.56 3.58a1 1 0 0 1-.24 1.01l-2.2 2.2Z"></path>
      </svg>
      <span>Llamame</span>
    </button>
    <a class="home-contact-link whatsapp" href="https://api.whatsapp.com/send?phone=573045459999" target="_blank" rel="noreferrer" data-testid="home-whatsapp-link" aria-label="WhatsApp" title="WhatsApp">
      <img src="/rentacar/assets/whatsapp_icon2.png" alt="WhatsApp">
      <span>WhatsApp</span>
    </a>
  </div>
</div>
<script>
window.addEventListener('load', function () {
  var widget = document.getElementById('homeCallWidget');
  var toggle = document.getElementById('homeCallToggle');
  var phone = document.getElementById('homeCallPhone');
  var submit = document.getElementById('homeCallSubmit');
  var status = document.getElementById('homeCallStatus');
  var livePhone = document.getElementById('homeCallLivePhone');
  var reset = document.getElementById('homeCallReset');
  if (!widget || !toggle || !phone || !submit || !status || !livePhone || !reset) return;
  function resetCallingState() {
    widget.classList.remove('is-calling');
    status.textContent = '';
    submit.disabled = false;
  }
  toggle.addEventListener('click', function () {
    var isOpen = widget.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen && !widget.classList.contains('is-calling')) phone.focus();
  });
  submit.addEventListener('click', function () {
    if (!phone.value.trim()) {
      status.textContent = 'Ingresa un numero para poder llamarte.';
      phone.focus();
      return;
    }
    livePhone.textContent = 'Llamando ahora al ' + phone.value.trim();
    widget.classList.add('is-calling');
    status.textContent = '';
    submit.disabled = true;
  });
  reset.addEventListener('click', function () {
    resetCallingState();
    phone.focus();
  });
});
</script>
`;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${widget}\n</body>`);
  }

  return `${html}\n${widget}`;
}

function enhanceCarDemoHome(html) {
  const heroWallpaperOverride = `
<style>
  #main-banner {
    background-image:
      linear-gradient(90deg, rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0.34)),
      url('/rentacar/assets/home/wallpaper-home.png') !important;
    background-size: cover !important;
    background-position: center center !important;
    background-repeat: no-repeat !important;
  }
  @media (max-width: 991.98px) {
    #main-banner {
      background-image:
        linear-gradient(90deg, rgba(0, 0, 0, 0.68), rgba(0, 0, 0, 0.38)),
        url('/rentacar/assets/home/wallpaper-home.png') !important;
    }
  }
  @media screen and (max-width: 768px) {
    #main-banner {
      background-image:
        linear-gradient(180deg, rgba(36, 0, 0, 0.78), rgba(213, 23, 23, 0.58)),
        url('/rentacar/assets/home/wallpaper-home.png') !important;
      background-position: center center !important;
    }
  }
</style>
`;

  const enhanced = html
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
    .replace(
      '<span class="text-black booking-form2-text2">Ingresa las fechas y horarios para ver disponibilidad y precios</span>',
      '<span class="text-black booking-form2-text2">Ingresa las fechas y horarios para ver disponibilidad y precios</span><div class="service-hours-banner" data-testid="service-hours-banner"><strong>Horario de atencion</strong><span>8:00 a.m. a 5:00 p.m. todos los dias</span></div>'
    )
    .replace('<input type="submit" class="btn btn-success btn-sm btn-block form-control rounded border border-white text-black font-weight-bold" value="COTIZAR">', '<input id="quote-submit" data-testid="quote-submit" type="submit" class="btn btn-success btn-sm btn-block form-control rounded border border-white text-black font-weight-bold" value="COTIZAR">')
    .replace('style="background-image: url(/src/img/que-hacer.webp);"', 'style="background-image: url(/rentacar/assets/home/why-rent.svg);"');

  const withHeroWallpaper = enhanced.includes('</head>')
    ? enhanced.replace('</head>', `${heroWallpaperOverride}\n</head>`)
    : `${heroWallpaperOverride}\n${enhanced}`;

  return injectHomeCallWidget(withHeroWallpaper);
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

app.post('/api/workflow/context-note', async (req, res) => {
  try {
    await workflowLearner.addContextNote(currentWorkflowId, req.body?.note || {});
    res.sendStatus(200);
  } catch (err) {
    console.error(`[Server] Context Note Error: ${err.message}`);
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

app.post('/api/workflows/:id/plan', async (req, res) => {
  try {
    const workflowId = (req.params.id || '').trim();
    const plan = await workflowExecutor.getExecutionPlanById(workflowId, req.body?.variables || {});
    res.json({ executionPlan: plan });
  } catch (err) {
    console.error(`[Workflows] Plan Error: ${err.message}`);
    if ((err.message || '').includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
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

app.post('/api/surface-profile/ensure', async (req, res) => {
  try {
    const context = {
      appId: req.body?.context?.appId || '',
      sourceUrl: req.body?.context?.sourceUrl || '',
      sourceOrigin: req.body?.context?.sourceOrigin || '',
      sourcePathname: req.body?.context?.sourcePathname || '',
      sourceTitle: req.body?.context?.sourceTitle || '',
      scope: req.body?.context?.scope || 'global',
      ownerId: req.body?.context?.ownerId || '',
      browserLocale: req.body?.context?.browserLocale || '',
      languageCode: req.body?.context?.languageCode || ''
    };

    const result = await surfaceProfileService.ensureGlobalProfile(context, req.body?.pageSnapshot || {});
    res.json(result);
  } catch (err) {
    console.error(`[Surface Profile] Ensure Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/voice/openai/session', express.text({ type: ['application/sdp', 'text/plain'], limit: '1mb' }), async (req, res) => {
  try {
    const openAiApiKey = `${process.env.OPENAI_API_KEY || ''}`.trim();
    if (!openAiApiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
    }

    const sdp = typeof req.body === 'string'
      ? req.body.trim()
      : `${req.body?.sdp || ''}`.trim();
    if (!sdp) {
      return res.status(400).json({ error: 'Missing SDP offer.' });
    }

    const context = decodeBase64JsonHeader(req.get('x-graph-voice-context'), {});
    const history = decodeBase64JsonHeader(req.get('x-graph-voice-history'), []);
    const workflows = agentChat.filterWorkflowsForContext(await catalogService.getCatalog(), context);

    const sessionConfig = {
      type: 'realtime',
      model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime',
      instructions: buildOpenAiRealtimeInstructions(context, workflows),
      conversation: Array.isArray(history) && history.length > 0
        ? 'auto'
        : undefined,
      audio: {
        input: {
          noise_reduction: { type: 'near_field' },
          transcription: {
            model: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
            language: 'es'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 900,
            create_response: false,
            interrupt_response: true
          }
        },
        output: {
          voice: process.env.OPENAI_REALTIME_VOICE || 'marin'
        }
      },
      tools: buildOpenAiRealtimeTools(),
      tool_choice: 'auto'
    };

    const form = new FormData();
    form.set('sdp', sdp);
    form.set('session', JSON.stringify(sessionConfig));

    const response = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey}`
      },
      body: form
    });

    const answerSdp = await response.text();
    if (!response.ok) {
      return res.status(response.status).json({
        error: answerSdp || 'Failed to create OpenAI Realtime session.'
      });
    }

    res
      .set('Content-Type', 'application/sdp')
      .set('X-OpenAI-Realtime-Model', sessionConfig.model)
      .set('X-OpenAI-Realtime-Voice', sessionConfig.audio.output.voice)
      .send(answerSdp);
  } catch (err) {
    console.error(`[Voice OpenAI] Session Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/voice/phone-session', async (req, res) => {
  try {
    const requestedId = `${req.body?.requestedId || ''}`.trim();
    const id = /^[a-zA-Z0-9_-]{12,120}$/.test(requestedId)
      ? requestedId
      : `phone_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
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
</html>`);
});

app.post('/api/agent/chat', async (req, res) => {
  try {
    const response = await agentChat.handleMessage(
      req.body?.message,
      req.body?.history,
      req.body?.context || {},
      { executionMode: req.body?.executionMode || 'browser' }
    );
    res.json(response);
  } catch (err) {
    console.error(`[Agent Chat] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hubspot/reservation', async (req, res) => {
  const token = `${process.env.HUBSPOT_PRIVATE_APP_TOKEN || ''}`.trim();
  if (!token) {
    return res.status(500).json({ error: 'HubSpot no esta configurado en el servidor.' });
  }

  const reservation = req.body || {};
  const contactPayload = {
    email: `${reservation.email || ''}`.trim(),
    firstname: `${reservation.firstName || ''}`.trim(),
    lastname: `${reservation.lastName || ''}`.trim(),
    phone: `${reservation.phone || ''}`.trim()
  };

  if (!contactPayload.email) {
    return res.status(400).json({ error: 'Falta el email del contacto.' });
  }

  const hubspotHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  function buildReservationNoteBody(payload) {
    const lines = [
      'Nueva reserva demo de carros',
      '',
      `Vehiculo: ${payload.vehicle || 'No especificado'}`,
      `Recogida: ${payload.pickupDate || 'Por confirmar'} ${payload.pickupTime || ''}`.trim(),
      `Entrega: ${payload.returnDate || 'Por confirmar'} ${payload.returnTime || ''}`.trim(),
      `Lugar de recogida: ${payload.pickupLocation || 'Por confirmar'}`,
      `Lugar de entrega: ${payload.returnLocation || 'Por confirmar'}`,
      '',
      `Nombre: ${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
      `Email: ${payload.email || 'No especificado'}`,
      `Telefono: ${payload.phone || 'No especificado'}`,
      `Documento: ${payload.documentType || 'No especificado'} ${payload.documentNumber || ''}`.trim(),
      `Fecha de nacimiento: ${payload.birthDate || 'No especificada'}`,
      `Nacionalidad: ${payload.nationality || 'No especificada'}`,
      `Pais de residencia: ${payload.residenceCountry || 'No especificado'}`,
      `Ciudad: ${payload.city || 'No especificada'}`,
      '',
      `Codigo de reserva aerea: ${payload.flightReservationCode || 'No especificado'}`,
      `Aerolinea: ${payload.flightAirline || 'No especificada'}`,
      `Numero de vuelo: ${payload.flightNumber || 'No especificado'}`,
      `Ciudad de origen del vuelo: ${payload.flightOriginCity || 'No especificada'}`,
      '',
      `Hospedaje en Medellin: ${payload.lodgingAddress || 'No especificado'}`,
      `Comentarios: ${payload.additionalComments || 'Sin comentarios adicionales'}`
    ];

    return lines.join('\n');
  }

  async function findContactByEmail(email) {
    const response = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/contacts/search',
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'email',
                operator: 'EQ',
                value: email
              }
            ]
          }
        ],
        limit: 1,
        properties: ['email', 'firstname', 'lastname', 'phone']
      },
      { headers: hubspotHeaders }
    );

    return response.data?.results?.[0] || null;
  }

  async function createContact(properties) {
    const response = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/contacts',
      { properties },
      { headers: hubspotHeaders }
    );

    return response.data;
  }

  async function updateContact(contactId, properties) {
    const response = await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`,
      { properties },
      { headers: hubspotHeaders }
    );

    return response.data;
  }

  async function createNote(noteBody) {
    const response = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/notes',
      {
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_note_body: noteBody
        }
      },
      { headers: hubspotHeaders }
    );

    return response.data;
  }

  async function associateNoteToContact(noteId, contactId) {
    await axios.put(
      `https://api.hubapi.com/crm/v3/objects/notes/${encodeURIComponent(noteId)}/associations/contact/${encodeURIComponent(contactId)}/note_to_contact`,
      {},
      { headers: hubspotHeaders }
    );
  }

  try {
    const existingContact = await findContactByEmail(contactPayload.email);
    const filteredProperties = Object.fromEntries(
      Object.entries(contactPayload).filter(([, value]) => value)
    );

    const contact = existingContact
      ? await updateContact(existingContact.id, filteredProperties)
      : await createContact(filteredProperties);

    let noteCreated = false;
    let warning = null;

    try {
      const note = await createNote(buildReservationNoteBody(reservation));
      await associateNoteToContact(note.id, contact.id);
      noteCreated = true;
    } catch (noteError) {
      console.warn('[HubSpot] Note sync warning:', noteError.response?.data || noteError.message);
      warning = 'El contacto se creo en HubSpot, pero la nota no pudo guardarse con los permisos actuales.';
    }

    res.json({
      ok: true,
      contactId: contact.id,
      noteCreated,
      warning
    });
  } catch (error) {
    const hubspotMessage = error.response?.data?.message || error.response?.data?.error || error.message;
    console.error('[HubSpot] Reservation sync error:', error.response?.data || error.message);
    res.status(500).json({ error: `No se pudo sincronizar con HubSpot: ${hubspotMessage}` });
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
  openAiApiKey: process.env.OPENAI_API_KEY,
  llmProvider,
  catalogService,
  agentChat,
  conversationInsights
});
voiceGateway.attach(server);

server.listen(PORT, () => console.log(`[Server] Running on http://localhost:${PORT}`));

