const DEFAULT_BACKEND_URL = 'http://localhost:3000';

function getStorage() {
  return chrome.storage?.sync || chrome.storage?.local;
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

function normalizeHostname(value) {
  return `${value || 'page'}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page';
}

async function bootstrap() {
  if (window.top !== window) {
    return;
  }

  const settings = await readSettings();
  if (!settings.enabled) {
    return;
  }

  if (document.documentElement.dataset.graphTrainerExtensionMounted === 'true') {
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

  for (const path of runtimeScripts) {
    await injectExternalScript(path);
  }
}

bootstrap().catch((error) => {
  console.warn('[GraphTrainerExtension] bootstrap failed:', error);
});
