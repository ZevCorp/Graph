window.WorkflowRecorder = (() => {
  let isRecording = false;
  let statusId = null;
  let stepOrder = 0;
  let recordQueue = Promise.resolve();
  let lastFieldSignature = '';
  const focusedSelectValues = new Map();

  function pluginEvents() {
    return window.GraphPluginEvents || null;
  }

  function explanationField() {
    return document.getElementById('step-explanation');
  }

  function statusField() {
    return document.getElementById('recording-status');
  }

  function stopButton() {
    return document.getElementById('btn-stop');
  }

  function startButton() {
    return document.getElementById('btn-start');
  }

  function toggleButton() {
    return document.getElementById('btn-record-toggle');
  }

  function updateRecordingUI(recording) {
    const toggle = toggleButton();
    if (!toggle) return;
    toggle.dataset.recording = recording ? 'true' : 'false';
    toggle.setAttribute('aria-pressed', recording ? 'true' : 'false');
    toggle.title = recording ? 'Stop recording' : 'Start recording';
    toggle.innerHTML = recording
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5-4-4L4 16v4zm12-13 2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5-4-4L4 16v4zm12-13 2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function selectorForElement(element) {
    if (!element) return '';
    if (element.dataset && element.dataset.testid) return `[data-testid="${element.dataset.testid}"]`;
    if (element.tagName === 'A' && element.getAttribute('href')) {
      return `a[href="${element.getAttribute('href')}"]`;
    }
    if (element.tagName === 'BUTTON' && element.type) {
      return `button[type="${element.type}"]`;
    }
    if (element.id) return `#${element.id}`;
    if (element.name) return `[name="${element.name}"]`;
    return element.tagName ? element.tagName.toLowerCase() : '';
  }

  function labelForElement(element) {
    if (!element) return '';
    const explicitLabel = element.labels && element.labels.length > 0
      ? Array.from(element.labels).map((label) => label.textContent || '').join(' ').trim()
      : '';
    const ariaLabel = element.getAttribute && (element.getAttribute('aria-label') || element.getAttribute('aria-labelledby'));
    const fallback = element.placeholder || element.name || element.id || '';
    return (explicitLabel || ariaLabel || fallback || '').trim().slice(0, 120);
  }

  function controlTypeForElement(element) {
    if (element instanceof HTMLSelectElement) return 'select';
    if (element instanceof HTMLTextAreaElement) return 'textarea';
    if (element instanceof HTMLInputElement) return element.type || 'input';
    return element.tagName ? element.tagName.toLowerCase() : 'unknown';
  }

  function getAllowedOptions(element) {
    if (!(element instanceof HTMLSelectElement)) return [];
    return Array.from(element.options).map((option) => ({
      value: option.value,
      label: option.label || option.textContent || '',
      text: (option.textContent || '').trim()
    }));
  }

  function getControlMetadata(element) {
    const metadata = {
      controlType: controlTypeForElement(element),
      selectedValue: '',
      selectedLabel: '',
      allowedOptions: []
    };

    if (element instanceof HTMLSelectElement) {
      const selectedOption = element.options[element.selectedIndex];
      metadata.selectedValue = element.value;
      metadata.selectedLabel = selectedOption ? (selectedOption.label || selectedOption.textContent || '').trim() : '';
      metadata.allowedOptions = getAllowedOptions(element);
      return metadata;
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      metadata.selectedValue = element.value;
      return metadata;
    }

    return metadata;
  }

  function getExplanation() {
    const field = explanationField();
    if (!field) return '';
    const explanation = field.value.trim();
    field.value = '';
    return explanation;
  }

  function isRecorderControl(element) {
    return Boolean(
      element
      && ['btn-start', 'btn-stop', 'btn-record-toggle', 'step-explanation', 'wf-desc'].includes(element.id)
    );
  }

  function shouldSkipFieldEvent(element, actionType) {
    if (!element || isRecorderControl(element)) return true;
    const signature = [
      actionType,
      selectorForElement(element),
      element.value,
      element instanceof HTMLSelectElement ? getAllowedOptions(element).map((option) => option.value).join('|') : ''
    ].join('::');

    if (signature === lastFieldSignature) {
      return true;
    }

    lastFieldSignature = signature;
    return false;
  }

  function rememberFocusedSelect(element) {
    if (!(element instanceof HTMLSelectElement)) return;
    focusedSelectValues.set(selectorForElement(element), element.value || '');
  }

  function forgetFocusedSelect(element) {
    if (!(element instanceof HTMLSelectElement)) return;
    focusedSelectValues.delete(selectorForElement(element));
  }

  function didSelectValueChange(element) {
    if (!(element instanceof HTMLSelectElement)) return false;
    const key = selectorForElement(element);
    return focusedSelectValues.get(key) !== (element.value || '');
  }

  async function recordFieldState(element) {
    const actionType = element instanceof HTMLSelectElement ? 'select' : 'input';
    if (shouldSkipFieldEvent(element, actionType)) return;

    await recordStep({
      actionType,
      selector: selectorForElement(element),
      label: labelForElement(element),
      value: element.value,
      ...getControlMetadata(element)
    });
  }

  function appendActivity(step) {
    const list = document.getElementById('activity-log');
    if (!list) return;
    const item = document.createElement('li');
    const renderedValue = step.actionType === 'select'
      ? (step.selectedLabel || step.selectedValue || step.value || '')
      : (step.value || '');
    item.textContent = `${step.stepOrder}. ${step.actionType} ${step.selector || step.url}${renderedValue ? ` = ${renderedValue}` : ''}`;
    list.appendChild(item);
  }

  async function postStep(step) {
    if (!isRecording) return;

    stepOrder += 1;
    const payload = {
      ...step,
      url: window.location.href,
      explanation: getExplanation(),
      stepOrder
    };

    await fetch('/api/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    appendActivity(payload);
    pluginEvents()?.emit?.('learning.step.captured', { step: payload });
  }

  function recordStep(step) {
    recordQueue = recordQueue
      .then(() => postStep(step))
      .catch((error) => {
        console.error('Failed to record step', error);
      });

    return recordQueue;
  }

  async function syncStatus() {
    const res = await fetch('/api/status');
    const status = await res.json();

    isRecording = status.recording;
    statusId = status.id;
    stepOrder = 0;
    lastFieldSignature = '';
    focusedSelectValues.clear();

    if (status.recording) {
      if (startButton()) startButton().disabled = true;
      if (stopButton()) stopButton().disabled = false;
      if (stopButton()) stopButton().style.display = 'inline-block';
      if (statusField()) statusField().innerText = `Recording workflow ${status.id}`;
      updateRecordingUI(true);
      await recordStep({ actionType: 'navigation', selector: 'document', label: document.title, value: '' });
    } else if (statusField()) {
      statusField().innerText = 'Idle';
      updateRecordingUI(false);
    } else {
      updateRecordingUI(false);
    }
  }

  function installListeners() {
    document.addEventListener('click', async (event) => {
      if (!isRecording) return;
      const target = event.target.closest('a, button, input, textarea, select, option');
      if (!target) return;
      if (target.closest('.console')) return;
      if (isRecorderControl(target)) return;
      if (target instanceof HTMLSelectElement || target instanceof HTMLOptionElement) return;

      await recordStep({
        actionType: 'click',
        selector: selectorForElement(target),
        label: labelForElement(target),
        value: '',
        ...getControlMetadata(target)
      });
    }, true);

    document.addEventListener('change', async (event) => {
      if (!isRecording) return;
      const target = event.target;
      const isField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      if (!isField) return;
      if (isRecorderControl(target)) return;
      await recordFieldState(target);
    }, true);

    document.addEventListener('input', async (event) => {
      if (!isRecording) return;
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (isRecorderControl(target)) return;
      await recordFieldState(target);
    }, true);

    document.addEventListener('focusin', (event) => {
      if (!isRecording) return;
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (isRecorderControl(target)) return;
      rememberFocusedSelect(target);
    }, true);

    document.addEventListener('focusout', async (event) => {
      if (!isRecording) return;
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (isRecorderControl(target)) return;
      const changed = didSelectValueChange(target);
      if (target.value && changed) {
        await recordFieldState(target);
      }
      forgetFocusedSelect(target);
    }, true);
  }

  installListeners();

  return {
    async startWorkflow(description, context = {}) {
      const desc = (description || '').trim();
      const pageState = window.PageState?.current || window.PageState || window.EMRState;
      if (pageState && typeof pageState.clearAll === 'function') {
        pageState.clearAll();
      }

      await fetch('/api/workflow/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc, context })
      });

      isRecording = true;
      stepOrder = 0;
      lastFieldSignature = '';
      focusedSelectValues.clear();
      recordQueue = Promise.resolve();
      if (startButton()) startButton().disabled = true;
      if (stopButton()) stopButton().disabled = false;
      if (statusField()) statusField().innerText = 'Recording live DOM actions';
      updateRecordingUI(true);
      const activity = document.getElementById('activity-log');
      if (activity) activity.innerHTML = '';
      pluginEvents()?.emit?.('learning.session.started', {
        description: desc,
        context
      });
      await recordStep({ actionType: 'navigation', selector: 'document', label: document.title, value: '' });
    },

    async stopWorkflow(redirectTo) {
      await fetch('/api/workflow/stop', { method: 'POST' });
      isRecording = false;
      lastFieldSignature = '';
      focusedSelectValues.clear();
      if (statusField()) statusField().innerText = 'Saved';
      updateRecordingUI(false);
      pluginEvents()?.emit?.('learning.session.finished', {
        redirectTo: redirectTo || ''
      });
      if (redirectTo) {
        window.location.href = redirectTo;
        return;
      }
      window.location.reload();
    },

    async resetWorkflow() {
      await fetch('/api/reset', { method: 'POST' });
      isRecording = false;
      stepOrder = 0;
      lastFieldSignature = '';
      focusedSelectValues.clear();
      if (statusField()) statusField().innerText = 'Idle';
      if (startButton()) startButton().disabled = false;
      if (stopButton()) stopButton().disabled = true;
      updateRecordingUI(false);
      pluginEvents()?.emit?.('learning.session.reset', {});
    },

    syncStatus,
    isRecording: () => isRecording
  };
})();
