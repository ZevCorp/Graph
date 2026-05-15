const DEFAULT_BACKEND_URL = 'https://graph-1-hap6.onrender.com';
const LOG_STORAGE_KEY = 'graphTrainerExtensionLogs';
const LOG_LIMIT = 200;

function getStorage() {
  return chrome.storage?.sync || chrome.storage?.local;
}

function getLocalStorage() {
  return chrome.storage?.local || chrome.storage?.sync;
}

function readSettings() {
  const storage = getStorage();
  return new Promise((resolve) => {
    storage.get({
      enabled: true,
      backendUrl: DEFAULT_BACKEND_URL
    }, resolve);
  });
}

function injectExternalScript(path) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(path);
    script.async = false;
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`Failed to load ${path}`));
    };
    (document.head || document.documentElement).appendChild(script);
  });
}

function injectInlineScript(code) {
  const script = document.createElement('script');
  script.textContent = code;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

function writeLog(entry) {
  const storage = getLocalStorage();
  return new Promise((resolve) => {
    storage.get({ [LOG_STORAGE_KEY]: [] }, (result) => {
      const current = Array.isArray(result?.[LOG_STORAGE_KEY]) ? result[LOG_STORAGE_KEY] : [];
      const next = [
        ...current,
        {
          timestamp: new Date().toISOString(),
          level: entry.level || 'info',
          scope: entry.scope || 'content',
          message: entry.message || '',
          details: entry.details || null
        }
      ].slice(-LOG_LIMIT);
      storage.set({ [LOG_STORAGE_KEY]: next }, resolve);
    });
  });
}

function log(level, scope, message, details = null) {
  return writeLog({ level, scope, message, details }).catch(() => {});
}

function normalizeHostname(value) {
  return `${value || 'page'}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page';
}

async function bootstrap() {
  if (window.top !== window) {
    await log('info', 'content', 'Skipped iframe mount.');
    return;
  }

  const settings = await readSettings();
  await log('info', 'content', 'Loaded extension settings.', {
    enabled: Boolean(settings.enabled),
    backendUrl: settings.backendUrl || DEFAULT_BACKEND_URL
  });
  if (!settings.enabled) {
    await log('info', 'content', 'Extension disabled for pages.');
    return;
  }

  if (document.documentElement.dataset.graphTrainerExtensionMounted === 'true') {
    await log('info', 'content', 'Skipped duplicate mount.');
    return;
  }
  document.documentElement.dataset.graphTrainerExtensionMounted = 'true';

  const runtimeScripts = [
    'assets/page-state.js',
    'assets/recorder.js',
    'assets/assistant-runtime.js',
    'assets/plugin/plugin-events.js',
    'assets/plugin/plugin-host.js',
    'assets/plugin/plugin-adapters.js',
    'assets/plugin/plugin-context.js',
    'assets/plugin/plugin-api.js',
    'assets/plugin/plugin-learning-bridge.js',
    'assets/trainer-plugin.js',
    'bootstrap.js'
  ];

  document.documentElement.dataset.graphTrainerBackendUrl = `${settings.backendUrl || DEFAULT_BACKEND_URL}`.trim() || DEFAULT_BACKEND_URL;
  document.documentElement.dataset.graphTrainerAppId = `chrome-extension-${normalizeHostname(window.location.hostname)}`;
  document.documentElement.dataset.graphTrainerStorageKey = `graph-extension-state-${normalizeHostname(window.location.hostname)}`;
  document.documentElement.dataset.graphTrainerWorkflowDescription = `Workflow on ${window.location.hostname || 'current-page'}`;
  await log('info', 'content', 'Prepared page dataset for Graph Trainer.', {
    backendUrl: document.documentElement.dataset.graphTrainerBackendUrl,
    appId: document.documentElement.dataset.graphTrainerAppId,
    storageKey: document.documentElement.dataset.graphTrainerStorageKey,
    hostname: window.location.hostname,
    pathname: window.location.pathname
  });

  document.addEventListener('graph-trainer-extension-log', (event) => {
    const detail = event?.detail || {};
    log(detail.level || 'info', detail.scope || 'page', detail.message || 'Page event received.', detail.details || null);
  });
  window.addEventListener('message', (event) => {
    if (event.source !== window) {
      return;
    }
    const payload = event.data;
    if (!payload || payload.source !== 'graph-trainer-extension' || payload.type !== 'log') {
      return;
    }
    const detail = payload.detail || {};
    log(detail.level || 'info', detail.scope || 'page', detail.message || 'Page message received.', detail.details || null);
  });

  for (const path of runtimeScripts) {
    await log('info', 'content', `Injecting ${path}.`);
    await injectExternalScript(path);
    await log('info', 'content', `Injected ${path}.`);
  }

  await log('info', 'content', 'All runtime scripts injected.');
}

bootstrap().catch((error) => {
  console.warn('[GraphTrainerExtension] bootstrap failed:', error);
  log('error', 'content', 'Extension bootstrap failed.', {
    message: error?.message || 'Unknown bootstrap error'
  });
});
