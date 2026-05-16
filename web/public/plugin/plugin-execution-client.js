(function () {
    function create(deps = {}) {
        const getOptions = typeof deps.getOptions === 'function' ? deps.getOptions : () => ({});
        const getPluginHost = typeof deps.getPluginHost === 'function' ? deps.getPluginHost : () => null;
        const runtime = typeof deps.runtime === 'function' ? deps.runtime : () => null;
        const emitPluginEvent = typeof deps.emitPluginEvent === 'function' ? deps.emitPluginEvent : () => {};
        const updateWorkflowPanelStatus = typeof deps.updateWorkflowPanelStatus === 'function' ? deps.updateWorkflowPanelStatus : () => {};
        const executionState = deps.executionState || { running: false };
        const executionStoragePrefix = deps.executionStoragePrefix || 'graph-browser-workflow-execution-v1';
        const waitTimeoutMs = Number.isFinite(deps.waitTimeoutMs) ? deps.waitTimeoutMs : 15000;
        const stepDelayMs = Number.isFinite(deps.stepDelayMs) ? deps.stepDelayMs : 180;

        function cloneJson(value) {
            return JSON.parse(JSON.stringify(value));
        }

        function getExecutionStorageKey() {
            return `${executionStoragePrefix}:${getOptions()?.appId || 'page'}`;
        }

        function readPendingExecution() {
            try {
                const raw = getPluginHost()?.sessionStore?.get(getExecutionStorageKey()) || '';
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (!parsed || !parsed.workflowId || !Array.isArray(parsed.steps)) {
                    return null;
                }
                return parsed;
            } catch (error) {
                return null;
            }
        }

        function persistPendingExecution(plan) {
            try {
                getPluginHost()?.sessionStore?.set(getExecutionStorageKey(), JSON.stringify(plan || {}));
            } catch (error) {
                // Ignore session storage failures.
            }
        }

        function clearPendingExecution() {
            getPluginHost()?.sessionStore?.remove(getExecutionStorageKey());
        }

        function normalizeExecutionUrl(rawUrl) {
            if (!rawUrl) {
                return '';
            }
            try {
                const parsed = new URL(rawUrl, window.location.href);
                parsed.hash = '';
                return parsed.toString();
            } catch (error) {
                return `${rawUrl || ''}`.trim();
            }
        }

        function urlsMatch(left, right) {
            return normalizeExecutionUrl(left) === normalizeExecutionUrl(right);
        }

        function describeStep(step) {
            if (!step) return 'workflow';
            return step.label || step.selector || step.url || step.actionType || 'workflow';
        }

        function resolveElementFromStep(step) {
            if (!step?.selector) {
                return null;
            }

            const directMatch = document.querySelector(step.selector);
            if (directMatch) {
                return directMatch;
            }

            if (!step?.label) {
                return null;
            }

            const matches = Array.from(document.querySelectorAll('input, textarea, select, button, a'));
            return matches.find((element) => {
                const text = (element.textContent || element.value || element.getAttribute('aria-label') || '').trim();
                return text === step.label;
            }) || null;
        }

        async function waitForStepElement(step, timeoutMs = waitTimeoutMs) {
            const startedAt = Date.now();
            while (Date.now() - startedAt < timeoutMs) {
                const element = resolveElementFromStep(step);
                if (element) {
                    return element;
                }
                await new Promise((resolve) => window.setTimeout(resolve, 120));
            }
            throw new Error(`No pude encontrar ${describeStep(step)} en esta pagina.`);
        }

        function fireDomEvent(element, eventName) {
            element.dispatchEvent(new Event(eventName, { bubbles: true }));
        }

        function notifyAutomationStep(step, message, options = {}) {
            const selector = options.selector || step?.selector || 'body';
            runtime()?.handleAutomationEvent?.({
                selector,
                label: step?.label || '',
                mode: options.mode || 'executing',
                spotlight: options.spotlight !== false,
                message: message || step?.label || step?.selector || 'Estoy trabajando en esta parte.'
            });
            updateWorkflowPanelStatus(message || step?.label || step?.selector || 'Estoy trabajando en esta parte.');
        }

        function emitExtensionLog(level, message, details = null) {
            const detail = {
                level,
                scope: 'trainer-plugin',
                message,
                details
            };

            try {
                document.dispatchEvent(new CustomEvent('graph-trainer-extension-log', { detail }));
            } catch (error) {
                // Ignore.
            }

            try {
                window.postMessage({
                    source: 'graph-trainer-extension',
                    type: 'log',
                    detail
                }, '*');
            } catch (error) {
                // Ignore.
            }
        }

        async function applyInputStep(element, step, variables = {}) {
            const variableKey = `input_${step.stepOrder}`;
            const resolvedValue = Object.prototype.hasOwnProperty.call(variables, variableKey)
                ? variables[variableKey]
                : step.value;
            const value = resolvedValue == null ? '' : `${resolvedValue}`;

            element.focus();
            if ('value' in element) {
                element.value = '';
            }
            if (typeof element.select === 'function') {
                element.select();
            }

            const inputType = (element.type || '').toLowerCase();
            if (inputType === 'checkbox' || inputType === 'radio') {
                element.checked = Boolean(value);
                fireDomEvent(element, 'change');
                return;
            }

            if ('value' in element) {
                element.value = value;
            } else {
                element.textContent = value;
            }

            fireDomEvent(element, 'input');
            fireDomEvent(element, 'change');
            element.blur?.();
        }

        function normalizeChoiceText(value) {
            return `${value || ''}`
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        }

        function buildSelectCandidates(step, variables = {}) {
            const variableKey = `input_${step.stepOrder}`;
            const variableValue = Object.prototype.hasOwnProperty.call(variables, variableKey)
                ? variables[variableKey]
                : '';

            return [
                variableValue,
                step.selectedValue,
                step.selectedLabel,
                step.value
            ].map((value) => `${value || ''}`.trim()).filter(Boolean);
        }

        function findMatchingSelectOption(optionsList, requestedValue) {
            const target = normalizeChoiceText(requestedValue);
            if (!target) {
                return null;
            }

            const getNormalizedOptionParts = (option) => ({
                value: normalizeChoiceText(option?.value),
                label: normalizeChoiceText(option?.label),
                text: normalizeChoiceText(option?.text),
                rawValue: `${option?.value || ''}`.trim()
            });

            const exact = optionsList.find((option) => {
                const parts = getNormalizedOptionParts(option);
                return parts.rawValue && (parts.value === target || parts.label === target || parts.text === target);
            });
            if (exact) {
                return exact;
            }

            return optionsList.find((option) => {
                const parts = getNormalizedOptionParts(option);
                if (!parts.rawValue) {
                    return false;
                }
                return parts.value.includes(target) || parts.label.includes(target) || parts.text.includes(target);
            }) || null;
        }

        function dispatchMouseLikeEvent(element, eventName) {
            element.dispatchEvent(new MouseEvent(eventName, {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        }

        function dispatchKeyboardLikeEvent(element, eventName, key) {
            element.dispatchEvent(new KeyboardEvent(eventName, {
                key,
                bubbles: true,
                cancelable: true
            }));
        }

        function waitMs(duration) {
            return new Promise((resolve) => window.setTimeout(resolve, duration));
        }

        async function performSelectInteractionSequence(element) {
            element.scrollIntoView({ block: 'center', inline: 'nearest' });
            element.focus();
            dispatchMouseLikeEvent(element, 'pointerdown');
            dispatchMouseLikeEvent(element, 'mousedown');
            dispatchMouseLikeEvent(element, 'pointerup');
            dispatchMouseLikeEvent(element, 'mouseup');
            dispatchMouseLikeEvent(element, 'click');
            await waitMs(50);
        }

        function getSelectedOptionSnapshot(element) {
            const selectedOption = element.options?.[element.selectedIndex] || null;
            return {
                value: `${element.value || ''}`,
                label: `${selectedOption?.label || selectedOption?.text || ''}`.trim()
            };
        }

        function applyNativeSelectValue(element, selected) {
            const optionsList = Array.from(element.options || []);
            const index = optionsList.findIndex((option) => option.value === selected.value);
            if (index < 0) {
                return false;
            }

            element.selectedIndex = index;
            optionsList[index].selected = true;
            return true;
        }

        async function dispatchSelectCommitEvents(element) {
            fireDomEvent(element, 'input');
            fireDomEvent(element, 'change');
            dispatchKeyboardLikeEvent(element, 'keydown', 'Enter');
            dispatchKeyboardLikeEvent(element, 'keyup', 'Enter');
            await waitMs(40);
            element.blur?.();
            await waitMs(40);
        }

        async function verifyNativeSelectApplied(element, selected, timeoutMs = 1200) {
            const startedAt = Date.now();
            const targetValue = `${selected?.value || ''}`;
            const targetLabel = normalizeChoiceText(selected?.label || selected?.text || '');

            while (Date.now() - startedAt < timeoutMs) {
                const snapshot = getSelectedOptionSnapshot(element);
                if (`${snapshot.value || ''}` === targetValue) {
                    return true;
                }
                if (targetLabel && normalizeChoiceText(snapshot.label) === targetLabel) {
                    return true;
                }
                await waitMs(60);
            }

            return false;
        }

        async function applyNativeSelectWithKeyboardFallback(element, selected) {
            await performSelectInteractionSequence(element);

            if (typeof element.showPicker === 'function') {
                try {
                    element.showPicker();
                    emitExtensionLog('info', 'Invoked showPicker() for native select.', {
                        selector: element.id ? `#${element.id}` : element.name || 'select'
                    });
                    await waitMs(80);
                } catch (error) {
                    emitExtensionLog('info', 'showPicker() was not allowed for native select.', {
                        selector: element.id ? `#${element.id}` : element.name || 'select',
                        message: error?.message || 'not allowed'
                    });
                }
            }

            const optionsList = Array.from(element.options || []);
            const targetIndex = optionsList.findIndex((option) => option.value === selected.value);
            if (targetIndex < 0) {
                return false;
            }

            const startingIndex = Math.max(0, element.selectedIndex);
            const directionKey = targetIndex >= startingIndex ? 'ArrowDown' : 'ArrowUp';
            const moveCount = Math.abs(targetIndex - startingIndex);

            for (let moveIndex = 0; moveIndex < moveCount; moveIndex += 1) {
                dispatchKeyboardLikeEvent(element, 'keydown', directionKey);
                dispatchKeyboardLikeEvent(element, 'keyup', directionKey);
                await waitMs(25);
            }

            applyNativeSelectValue(element, selected);
            await dispatchSelectCommitEvents(element);
            return verifyNativeSelectApplied(element, selected);
        }

        async function waitForMatchingSelectOption(element, candidates, timeoutMs = waitTimeoutMs) {
            const startedAt = Date.now();
            while (Date.now() - startedAt < timeoutMs) {
                const optionsList = Array.from(element.options || []).map((option) => ({
                    value: `${option.value || ''}`.trim(),
                    label: `${option.label || option.text || ''}`.trim(),
                    text: `${option.text || option.label || ''}`.trim()
                }));

                for (const candidate of candidates) {
                    const selected = findMatchingSelectOption(optionsList, candidate);
                    if (selected) {
                        return selected;
                    }
                }

                await waitMs(120);
            }

            return null;
        }

        async function applySelectStep(element, step, variables = {}) {
            const candidates = buildSelectCandidates(step, variables);
            emitExtensionLog('info', 'Applying select step.', {
                selector: step.selector || '',
                label: step.label || '',
                candidates
            });

            const selected = await waitForMatchingSelectOption(element, candidates);
            if (!selected) {
                emitExtensionLog('error', 'No matching option found for select step.', {
                    selector: step.selector || '',
                    label: step.label || '',
                    candidates
                });
                throw new Error(`No encontre una opcion valida para ${describeStep(step)}.`);
            }

            let applied = false;
            await performSelectInteractionSequence(element);
            if (applyNativeSelectValue(element, selected)) {
                await dispatchSelectCommitEvents(element);
                applied = await verifyNativeSelectApplied(element, selected);
            }

            if (!applied) {
                emitExtensionLog('info', 'Semantic native select apply did not stick, trying keyboard fallback.', {
                    selector: step.selector || '',
                    label: step.label || '',
                    targetValue: selected.value,
                    targetLabel: selected.label || selected.text || ''
                });
                applied = await applyNativeSelectWithKeyboardFallback(element, selected);
            }

            if (!applied) {
                const snapshot = getSelectedOptionSnapshot(element);
                emitExtensionLog('error', 'Native select value did not persist after fallback.', {
                    selector: step.selector || '',
                    label: step.label || '',
                    targetValue: selected.value,
                    targetLabel: selected.label || selected.text || '',
                    currentValue: snapshot.value,
                    currentLabel: snapshot.label
                });
                throw new Error(`No pude confirmar la seleccion para ${describeStep(step)}.`);
            }

            emitExtensionLog('info', 'Applied select step.', {
                selector: step.selector || '',
                label: step.label || '',
                selectedValue: selected.value,
                resultingValue: element.value || '',
                selectedLabel: selected.label || selected.text || ''
            });
        }

        function updateExecutionProgress(plan, nextStepIndex) {
            const nextPlan = {
                ...plan,
                nextStepIndex,
                updatedAt: Date.now()
            };
            persistPendingExecution(nextPlan);
            return nextPlan;
        }

        async function executeWorkflowPlan(plan, trigger = 'panel') {
            if (!plan || !plan.workflowId || !Array.isArray(plan.steps) || plan.steps.length === 0) {
                throw new Error('No pude preparar la automatizacion para ayudarte con la reserva.');
            }

            if (executionState.running) {
                throw new Error('Ya estoy completando una reserva en esta pagina.');
            }

            executionState.running = true;
            let currentPlan = null;

            try {
                currentPlan = updateExecutionProgress({
                    ...cloneJson(plan),
                    trigger,
                    nextStepIndex: Number.isFinite(plan.nextStepIndex) ? plan.nextStepIndex : 0,
                    startedAt: plan.startedAt || Date.now()
                }, Number.isFinite(plan.nextStepIndex) ? plan.nextStepIndex : 0);

                updateWorkflowPanelStatus('Completando la reserva en esta pagina...');
                emitPluginEvent('workflow.execution.started', {
                    workflowId: currentPlan.workflowId,
                    trigger,
                    stepCount: currentPlan.steps.length
                });

                for (let stepIndex = currentPlan.nextStepIndex; stepIndex < currentPlan.steps.length; stepIndex += 1) {
                    const step = currentPlan.steps[stepIndex];
                    const expectedUrl = step.url ? normalizeExecutionUrl(step.url) : '';
                    emitPluginEvent('workflow.execution.step_started', {
                        workflowId: currentPlan.workflowId,
                        trigger,
                        stepIndex,
                        step
                    });

                    if (step.actionType === 'navigation') {
                        const targetUrl = normalizeExecutionUrl(step.url);
                        notifyAutomationStep(step, `Abriendo ${step.label || targetUrl}.`, {
                            selector: 'body',
                            spotlight: false
                        });
                        if (!urlsMatch(window.location.href, targetUrl)) {
                            currentPlan = updateExecutionProgress(currentPlan, stepIndex + 1);
                            updateWorkflowPanelStatus(`Abriendo ${targetUrl}...`);
                            window.location.assign(targetUrl);
                            return;
                        }

                        currentPlan = updateExecutionProgress(currentPlan, stepIndex + 1);
                        continue;
                    }

                    if (expectedUrl && !urlsMatch(window.location.href, expectedUrl)) {
                        currentPlan = updateExecutionProgress(currentPlan, stepIndex);
                        updateWorkflowPanelStatus(`Cambiando a la pagina correcta para ${describeStep(step)}...`);
                        window.location.assign(expectedUrl);
                        return;
                    }

                    const element = await waitForStepElement(step);
                    if (step.actionType === 'click') {
                        element.scrollIntoView({ block: 'center', inline: 'nearest' });
                        notifyAutomationStep(step, `Estoy interactuando con ${step.label || step.selector || 'este control'}.`);
                        if ('disabled' in element && element.disabled) {
                            throw new Error(`El elemento ${describeStep(step)} sigue deshabilitado.`);
                        }

                        currentPlan = updateExecutionProgress(currentPlan, stepIndex + 1);
                        element.click();
                    } else if (step.actionType === 'input') {
                        notifyAutomationStep(step, `Estoy completando ${step.label || step.selector || 'este campo'}.`);
                        await applyInputStep(element, step, currentPlan.variables || {});
                        currentPlan = updateExecutionProgress(currentPlan, stepIndex + 1);
                    } else if (step.actionType === 'select') {
                        notifyAutomationStep(step, `Estoy eligiendo una opcion en ${step.label || step.selector || 'este selector'}.`);
                        await applySelectStep(element, step, currentPlan.variables || {});
                        currentPlan = updateExecutionProgress(currentPlan, stepIndex + 1);
                    } else {
                        currentPlan = updateExecutionProgress(currentPlan, stepIndex + 1);
                    }

                    await waitMs(stepDelayMs);
                }

                clearPendingExecution();
                runtime()?.clearSpotlight?.();
                updateWorkflowPanelStatus('Reserva completada en esta pagina.');
                runtime()?.speak('Listo, termine de completar la reserva aqui mismo.', { mode: 'idle' });
                emitExtensionLog('info', 'Workflow execution finished on page.', {
                    workflowId: currentPlan.workflowId,
                    trigger
                });
                emitPluginEvent('workflow.execution.finished', {
                    workflowId: currentPlan.workflowId,
                    trigger
                });
            } finally {
                executionState.running = false;
            }
        }

        return {
            cloneJson,
            getExecutionStorageKey,
            readPendingExecution,
            persistPendingExecution,
            clearPendingExecution,
            normalizeExecutionUrl,
            urlsMatch,
            describeStep,
            resolveElementFromStep,
            waitForStepElement,
            fireDomEvent,
            notifyAutomationStep,
            emitExtensionLog,
            applyInputStep,
            normalizeChoiceText,
            buildSelectCandidates,
            findMatchingSelectOption,
            dispatchMouseLikeEvent,
            dispatchKeyboardLikeEvent,
            waitMs,
            performSelectInteractionSequence,
            getSelectedOptionSnapshot,
            applyNativeSelectValue,
            dispatchSelectCommitEvents,
            verifyNativeSelectApplied,
            applyNativeSelectWithKeyboardFallback,
            waitForMatchingSelectOption,
            applySelectStep,
            updateExecutionProgress,
            executeWorkflowPlan
        };
    }

    window.GraphPluginExecutionClient = {
        create
    };
})();
