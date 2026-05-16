(function () {
    function buildStepTitle(step, index) {
        const order = Number(step?.stepOrder) || index + 1;
        const label = `${step?.label || ''}`.trim();
        const explanation = `${step?.explanation || ''}`.trim();
        const actionType = `${step?.actionType || 'step'}`.trim().toLowerCase();

        if (label) {
            return label;
        }
        if (explanation) {
            return explanation;
        }
        if (actionType === 'click') {
            return 'Hacer click';
        }
        if (actionType === 'input') {
            return 'Escribir valor';
        }
        if (actionType === 'select') {
            return 'Seleccionar opcion';
        }
        if (actionType === 'navigate') {
            return 'Ir a la pagina';
        }
        return `Paso ${order}`;
    }

    function buildStepEvidence(step) {
        const parts = [];
        if (`${step?.explanation || ''}`.trim()) {
            parts.push(`${step.explanation}`.trim());
        }
        if (`${step?.selectedLabel || ''}`.trim()) {
            parts.push(`Opcion: ${`${step.selectedLabel}`.trim()}`);
        } else if (`${step?.selectedValue || ''}`.trim()) {
            parts.push(`Valor seleccionado: ${`${step.selectedValue}`.trim()}`);
        } else if (`${step?.value || ''}`.trim()) {
            parts.push(`Valor: ${`${step.value}`.trim()}`);
        }
        if (`${step?.url || ''}`.trim()) {
            parts.push(`URL: ${`${step.url}`.trim()}`);
        }
        return parts.join('\n') || 'Paso guardado dentro de este workflow.';
    }

    function buildStepFootnote(step) {
        const selector = `${step?.selector || ''}`.trim();
        const controlType = `${step?.controlType || ''}`.trim();
        if (selector && controlType) {
            return `${controlType} · ${selector}`;
        }
        if (selector) {
            return selector;
        }
        return 'Sin selector visible para este paso.';
    }

    window.GraphWorkflowOverlayBridge = {
        buildOverlayItems(workflow) {
            const steps = Array.isArray(workflow?.steps) ? workflow.steps.slice() : [];
            return steps
                .sort((left, right) => (Number(left?.stepOrder) || 0) - (Number(right?.stepOrder) || 0))
                .map((step, index) => {
                    const order = Number(step?.stepOrder) || index + 1;
                    return {
                        order,
                        selector: `${step?.selector || ''}`.trim() || 'body',
                        area: `Paso ${order}`,
                        title: buildStepTitle(step, index),
                        evidence: buildStepEvidence(step),
                        opportunity: buildStepFootnote(step),
                        source: workflow?.description || workflow?.id || 'Workflow'
                    };
                });
        }
    };
})();
