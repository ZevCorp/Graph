(function () {
    function create(deps = {}) {
        const getOptions = typeof deps.getOptions === 'function' ? deps.getOptions : () => ({});
        const runtime = typeof deps.runtime === 'function' ? deps.runtime : () => null;
        const getPageContext = typeof deps.getPageContext === 'function' ? deps.getPageContext : () => ({});
        const emitPluginEvent = typeof deps.emitPluginEvent === 'function' ? deps.emitPluginEvent : () => {};
        const markWorkflowPanelDirty = typeof deps.markWorkflowPanelDirty === 'function' ? deps.markWorkflowPanelDirty : () => {};

        async function startWorkflow() {
            const options = getOptions();
            const descField = document.getElementById('wf-desc');
            const description = (descField?.value || '').trim() || options.workflowDescription || document.title;
            if (descField && !descField.value) {
                descField.value = description;
            }

            runtime()?.pinBottomRight?.();
            runtime()?.speak?.(`Empece a aprender este recorrido: "${description}".`, { mode: 'recording' });
            emitPluginEvent('learning.session.requested', {
                description,
                context: getPageContext()
            });
            await window.WorkflowRecorder.startWorkflow(description, getPageContext());
            markWorkflowPanelDirty();
        }

        async function stopWorkflow() {
            runtime()?.unpin?.();
            runtime()?.speak?.('Listo, guarde este recorrido.', { mode: 'idle' });
            await window.WorkflowRecorder.stopWorkflow();
            emitPluginEvent('learning.session.stop_requested', {
                context: getPageContext()
            });
            markWorkflowPanelDirty();
        }

        async function resetWorkflow() {
            await window.WorkflowRecorder.resetWorkflow();
            markWorkflowPanelDirty();
        }

        function syncRecorderStatus() {
            if (getOptions()?.autoSyncStatus && window.WorkflowRecorder?.syncStatus) {
                window.WorkflowRecorder.syncStatus();
            }
        }

        return {
            startWorkflow,
            stopWorkflow,
            resetWorkflow,
            syncRecorderStatus
        };
    }

    window.GraphPluginLearningClient = {
        create
    };
})();
