const DEFAULT_BACKEND_URL = 'https://graph-1-hap6.onrender.com';
const LOG_STORAGE_KEY = 'graphTrainerExtensionLogs';
const LOG_PANEL_STATE_KEY = 'graphTrainerPopupShowLogs';

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
  const scope = entry.scope ? ` [${entry.scope}]` : '';
  const message = `${entry.message || ''}`.trim() || '(empty message)';
  const details = entry.details ? `\n${JSON.stringify(entry.details, null, 2)}` : '';
  return `${timestamp} ${level}${scope} ${message}${details}`;
}

async function renderLogs(logOutputEl) {
  const logs = await readLogs();
  logOutputEl.textContent = logs.length > 0
    ? logs.slice().reverse().map((entry) => formatLogEntry(entry)).join('\n\n')
    : 'No logs yet.';
}

async function setLogPanelOpen(panelEl, buttonEl, logOutputEl, isOpen) {
  panelEl.classList.toggle('open', isOpen);
  buttonEl.textContent = isOpen ? 'Hide Logs' : 'Show Logs';
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
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      statusEl.textContent = 'No pude encontrar la pestaña activa.';
      return;
    }

    try {
      await chrome.tabs.sendMessage(activeTab.id, { type: 'graph:open-improvements' });
      statusEl.textContent = 'Panel de mejoras abierto en la pagina.';
    } catch (error) {
      statusEl.textContent = 'No pude abrir mejoras en esta pestaña.';
    }

    window.setTimeout(() => {
      statusEl.textContent = '';
    }, 1800);
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
