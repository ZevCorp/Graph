(function () {
  function emitExtensionLog(level, message, details) {
    document.dispatchEvent(new CustomEvent('graph-trainer-extension-log', {
      detail: {
        level,
        scope: 'bootstrap',
        message,
        details: details || null
      }
    }));
  }

  const root = document.documentElement;
  const backendUrl = `${root.dataset.graphTrainerBackendUrl || 'https://graph-1-hap6.onrender.com'}`.trim() || 'https://graph-1-hap6.onrender.com';
  const appId = `${root.dataset.graphTrainerAppId || 'chrome-extension-page'}`.trim() || 'chrome-extension-page';
  const storageKey = `${root.dataset.graphTrainerStorageKey || 'graph-extension-state-page'}`.trim() || 'graph-extension-state-page';
  const workflowDescription = `${root.dataset.graphTrainerWorkflowDescription || 'Workflow on current page'}`.trim() || 'Workflow on current page';

  window.__GRAPH_EXTENSION_SETTINGS__ = {
    backendUrl,
    appId
  };

  emitExtensionLog('info', 'Starting Graph Trainer bootstrap.', {
    backendUrl,
    appId,
    storageKey,
    workflowDescription
  });

  try {
    window.PageState.init({ storageKey });
    emitExtensionLog('info', 'PageState initialized.', { storageKey });

    window.TrainerPlugin.mount({
      title: 'Graph Trainer',
      workflowDescription,
      appId,
      apiBaseUrl: backendUrl,
      assistantRuntime: {
        name: 'Graph',
        accentColor: '#0f5f8c',
        idleMessage: 'Puedo aprender y ejecutar tareas en esta pagina cuando quieras.'
      }
    });

    emitExtensionLog('info', 'Trainer plugin mounted.', {
      appId,
      backendUrl
    });
  } catch (error) {
    emitExtensionLog('error', 'Trainer bootstrap failed.', {
      message: error?.message || 'Unknown bootstrap error'
    });
    throw error;
  }
})();
