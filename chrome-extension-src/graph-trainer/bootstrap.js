(function () {
  const root = document.documentElement;
  const backendUrl = `${root.dataset.graphTrainerBackendUrl || 'https://graph-1-hap6.onrender.com'}`.trim() || 'https://graph-1-hap6.onrender.com';
  const appId = `${root.dataset.graphTrainerAppId || 'chrome-extension-page'}`.trim() || 'chrome-extension-page';
  const storageKey = `${root.dataset.graphTrainerStorageKey || 'graph-extension-state-page'}`.trim() || 'graph-extension-state-page';
  const workflowDescription = `${root.dataset.graphTrainerWorkflowDescription || 'Workflow on current page'}`.trim() || 'Workflow on current page';

  window.__GRAPH_EXTENSION_SETTINGS__ = {
    backendUrl,
    appId
  };

  window.PageState.init({ storageKey });
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
})();
