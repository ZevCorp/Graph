const DEFAULT_BACKEND_URL = 'https://graph-1-hap6.onrender.com';
const LOG_STORAGE_KEY = 'graphTrainerExtensionLogs';
const LOG_PANEL_STATE_KEY = 'graphTrainerPopupShowLogs';
const EXECUTION_LOG_SCOPES = new Set(['execution']);

function getStorage() {
  return chrome.storage?.sync || chrome.storage?.local;
}

function getLocalStorage() {
  return chrome.storage?.local || chrome.storage?.sync;
}

async function loadSettings() {
  const storage = getStorage();
  return new Promise((resolve) => {
    storage.get({
      enabled: true,
      backendUrl: DEFAULT_BACKEND_URL
    }, resolve);
  });
}

async function saveSettings(settings) {
  const storage = getStorage();
  return new Promise((resolve) => {
    storage.set(settings, resolve);
  });
}

async function readLogs() {
  const storage = getLocalStorage();
  return new Promise((resolve) => {
    storage.get({ [LOG_STORAGE_KEY]: [] }, (result) => {
      resolve(Array.isArray(result?.[LOG_STORAGE_KEY]) ? result[LOG_STORAGE_KEY] : []);
    });
  });
}

function isExecutionDiagnostic(entry = {}) {
  const scope = `${entry.scope || ''}`.trim().toLowerCase();
  return EXECUTION_LOG_SCOPES.has(scope);
}

function buildExecutionDiagnosticSummary(logs = []) {
  const diagnostics = logs.filter(isExecutionDiagnostic);
  const errors = diagnostics.filter((entry) => `${entry.level || ''}`.toLowerCase() === 'error').length;
  const warnings = diagnostics.filter((entry) => `${entry.level || ''}`.toLowerCase() === 'warn').length;

  if (!diagnostics.length) {
    return 'Sin diagnosticos de ejecucion todavia.';
  }

  if (!errors && !warnings) {
    return `${diagnostics.length} evento(s) recientes de ejecucion sin fallos reportados.`;
  }

  return `${errors} error(es), ${warnings} alerta(s) y ${diagnostics.length} evento(s) de ejecucion recientes.`;
}

async function clearLogs() {
  const storage = getLocalStorage();
  return new Promise((resolve) => {
    storage.set({ [LOG_STORAGE_KEY]: [] }, resolve);
  });
}

async function loadLogPanelState() {
  const storage = getLocalStorage();
  return new Promise((resolve) => {
    storage.get({ [LOG_PANEL_STATE_KEY]: false }, (result) => {
      resolve(Boolean(result?.[LOG_PANEL_STATE_KEY]));
    });
  });
}

async function saveLogPanelState(isOpen) {
  const storage = getLocalStorage();
  return new Promise((resolve) => {
    storage.set({ [LOG_PANEL_STATE_KEY]: Boolean(isOpen) }, resolve);
  });
}

function formatLogEntry(entry = {}) {
  const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'unknown-time';
  const level = `${entry.level || 'info'}`.toUpperCase();
  const details = entry.details && typeof entry.details === 'object' ? entry.details : {};
  const stepText = [
    details.workflowId ? `workflow=${details.workflowId}` : '',
    Number.isFinite(details.stepOrder) ? `step=${details.stepOrder}` : '',
    details.actionType ? `action=${details.actionType}` : '',
    details.selector ? `selector=${details.selector}` : '',
    details.label ? `label=${details.label}` : '',
    details.failureKind ? `failure=${details.failureKind}` : '',
    details.resolution ? `resolution=${details.resolution}` : ''
  ].filter(Boolean).join(' | ');
  const errorText = details.selectorError || details.errorMessage || '';
  const locationText = details.currentUrl ? `\nurl: ${details.currentUrl}` : '';
  const detailsBlock = entry.details ? `\n${JSON.stringify(entry.details, null, 2)}` : '';
  return [
    `${timestamp} ${level} ${entry.message || '(empty message)'}`.trim(),
    stepText,
    errorText ? `error: ${errorText}` : '',
    locationText ? locationText.trim() : '',
    detailsBlock.trim()
  ].filter(Boolean).join('\n');
}

function escapeHtml(value) {
  return `${value || ''}`
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderImprovementsView(payload = {}) {
  const settingsViewEl = document.getElementById('settingsView');
  const improvementsViewEl = document.getElementById('improvementsView');
  const titleEl = document.getElementById('popupImprovementsTitle');
  const statusEl = document.getElementById('popupImprovementsStatus');
  const listEl = document.getElementById('popupImprovementsList');
  const emptyEl = document.getElementById('popupImprovementsEmpty');
  const footnoteEl = document.getElementById('popupImprovementsFootnote');
  const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];

  settingsViewEl.classList.add('hidden');
  improvementsViewEl.classList.add('open');
  titleEl.textContent = payload?.title || 'Feedback visible sobre la pagina';
  statusEl.textContent = payload?.status || '';
  footnoteEl.textContent = payload?.footnote || '';
  listEl.innerHTML = '';

  if (!suggestions.length) {
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  suggestions.forEach((suggestion) => {
    const item = document.createElement('article');
    const priority = `${suggestion.priority || 'media'}`.toLowerCase();
    item.className = 'improvement-item';
    item.innerHTML = `
      <div class="improvement-item-header">
        <div>
          <div class="improvement-item-eyebrow">${escapeHtml(suggestion.area || 'Momento de la experiencia')}</div>
          <h4 class="improvement-item-title">${escapeHtml(suggestion.title || 'Sugerencia de mejora')}</h4>
        </div>
        <div class="improvement-item-pill" data-priority="${escapeHtml(priority)}">Prioridad ${escapeHtml(suggestion.priority || 'media')}</div>
      </div>
      <div class="improvement-item-meta">
        <div>${escapeHtml(suggestion.summary || '')}</div>
        <div class="improvement-item-quote">
          <span class="improvement-item-quote-label">Lo que una persona podria decir</span>
          ${escapeHtml(suggestion.evidence || 'Sin evidencia disponible.')}
        </div>
        <div class="improvement-item-recommendation">
          <span class="improvement-item-recommendation-label">Que conviene mejorar</span>
          ${escapeHtml(suggestion.opportunity || 'Sin oportunidad descrita.')}
        </div>
        <div><strong>Origen:</strong> ${escapeHtml(suggestion.source || 'Plugin')}</div>
      </div>
      <div class="improvement-item-target">Anclado a: ${escapeHtml(suggestion.selector || 'pagina actual')}</div>
    `;
    listEl.appendChild(item);
  });
}

async function getActiveTabId() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return activeTab?.id || null;
}

async function renderLogs(logOutputEl) {
  const logs = await readLogs();
  const executionLogs = logs.filter(isExecutionDiagnostic);
  const summaryEl = document.getElementById('logSummary');
  if (summaryEl) {
    summaryEl.textContent = buildExecutionDiagnosticSummary(logs);
  }
  logOutputEl.textContent = executionLogs.length > 0
    ? executionLogs.slice().reverse().map((entry) => formatLogEntry(entry)).join('\n\n')
    : 'No hay diagnosticos de ejecucion todavia.';
}

async function setLogPanelOpen(panelEl, buttonEl, logOutputEl, isOpen) {
  panelEl.classList.toggle('open', isOpen);
  buttonEl.textContent = isOpen ? 'Ocultar diagnostico' : 'Ver diagnostico';
  await saveLogPanelState(isOpen);
  if (isOpen) {
    await renderLogs(logOutputEl);
  }
}

async function init() {
  const enabledEl = document.getElementById('enabled');
  const backendUrlEl = document.getElementById('backendUrl');
  const saveButton = document.getElementById('save');
  const showImprovementsButton = document.getElementById('showImprovements');
  const toggleLogsButton = document.getElementById('toggleLogs');
  const clearLogsButton = document.getElementById('clearLogs');
  const statusEl = document.getElementById('status');
  const logPanelEl = document.getElementById('logPanel');
  const logOutputEl = document.getElementById('logOutput');
  const refreshImprovementsButton = document.getElementById('popupImprovementsRefresh');
  const overlayToggleButton = document.getElementById('popupOverlayToggle');

  const settings = await loadSettings();
  const showLogs = await loadLogPanelState();
  enabledEl.checked = Boolean(settings.enabled);
  backendUrlEl.value = `${settings.backendUrl || DEFAULT_BACKEND_URL}`.trim() || DEFAULT_BACKEND_URL;
  await setLogPanelOpen(logPanelEl, toggleLogsButton, logOutputEl, showLogs);

  saveButton.addEventListener('click', async () => {
    const nextSettings = {
      enabled: enabledEl.checked,
      backendUrl: `${backendUrlEl.value || DEFAULT_BACKEND_URL}`.trim() || DEFAULT_BACKEND_URL
    };

    await saveSettings(nextSettings);
    statusEl.textContent = 'Saved. Reload the target tab.';
    window.setTimeout(() => {
      statusEl.textContent = '';
    }, 1800);
  });

  showImprovementsButton.addEventListener('click', async () => {
    const activeTabId = await getActiveTabId();
    if (!activeTabId) {
      statusEl.textContent = 'No pude encontrar la pestaña activa.';
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(activeTabId, { type: 'graph:open-improvements' });
      if (!response?.ok || !response?.payload) {
        throw new Error('No hubo datos de mejoras.');
      }
      renderImprovementsView(response.payload);
    } catch (error) {
      statusEl.textContent = 'No pude abrir mejoras en esta pestaña.';
      window.setTimeout(() => {
        statusEl.textContent = '';
      }, 1800);
    }
  });

  refreshImprovementsButton.addEventListener('click', async () => {
    const activeTabId = await getActiveTabId();
    if (!activeTabId) {
      return;
    }
    try {
      const response = await chrome.tabs.sendMessage(activeTabId, { type: 'graph:open-improvements' });
      if (response?.ok && response?.payload) {
        renderImprovementsView(response.payload);
      }
    } catch (error) {
      // Ignore silent refresh errors in the popup panel.
    }
  });

  overlayToggleButton.addEventListener('click', async () => {
    const activeTabId = await getActiveTabId();
    if (!activeTabId) {
      return;
    }
    try {
      await chrome.tabs.sendMessage(activeTabId, { type: 'graph:toggle-improvements-overlay' });
    } catch (error) {
      // Keep popup usable even if the page could not toggle the overlay.
    }
  });

  toggleLogsButton.addEventListener('click', async () => {
    const isOpen = !logPanelEl.classList.contains('open');
    await setLogPanelOpen(logPanelEl, toggleLogsButton, logOutputEl, isOpen);
  });

  clearLogsButton.addEventListener('click', async () => {
    await clearLogs();
    await renderLogs(logOutputEl);
    statusEl.textContent = 'Logs cleared.';
    window.setTimeout(() => {
      statusEl.textContent = '';
    }, 1600);
  });
}

init().catch((error) => {
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = error.message || 'Could not load extension settings.';
  }
});
