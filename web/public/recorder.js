window.WorkflowRecorder = (() => {
  let isRecording = false;
  let statusId = null;
  let stepOrder = 0;
  let recordQueue = Promise.resolve();

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
    return (element.innerText || element.value || element.placeholder || element.name || element.id || '').trim().slice(0, 80);
  }

  function getExplanation() {
    const field = explanationField();
    if (!field) return '';
    const explanation = field.value.trim();
    field.value = '';
    return explanation;
  }

  function appendActivity(step) {
    const list = document.getElementById('activity-log');
    if (!list) return;
    const item = document.createElement('li');
    item.textContent = `${step.stepOrder}. ${step.actionType} ${step.selector || step.url}${step.value ? ` = ${step.value}` : ''}`;
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
      if (['btn-start', 'btn-stop', 'step-explanation', 'wf-desc'].includes(target.id)) return;

      await recordStep({
        actionType: 'click',
        selector: selectorForElement(target),
        label: labelForElement(target),
        value: ''
      });
    }, true);

    document.addEventListener('change', async (event) => {
      if (!isRecording) return;
      const target = event.target;
      const isField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      if (!isField) return;
      if (['step-explanation', 'wf-desc'].includes(target.id)) return;

      await recordStep({
        actionType: 'input',
        selector: selectorForElement(target),
        label: labelForElement(target),
        value: target.value
      });
    }, true);
  }

  installListeners();

  return {
    async startWorkflow(description) {
      const desc = (description || '').trim();
      await fetch('/api/workflow/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc })
      });

      isRecording = true;
      stepOrder = 0;
      recordQueue = Promise.resolve();
      if (startButton()) startButton().disabled = true;
      if (stopButton()) stopButton().disabled = false;
      if (statusField()) statusField().innerText = 'Recording live DOM actions';
      updateRecordingUI(true);
      const activity = document.getElementById('activity-log');
      if (activity) activity.innerHTML = '';
      await recordStep({ actionType: 'navigation', selector: 'document', label: document.title, value: '' });
    },

    async stopWorkflow(redirectTo) {
      await fetch('/api/workflow/stop', { method: 'POST' });
      isRecording = false;
      if (statusField()) statusField().innerText = 'Saved';
      updateRecordingUI(false);
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
      if (statusField()) statusField().innerText = 'Idle';
      if (startButton()) startButton().disabled = false;
      if (stopButton()) stopButton().disabled = true;
      updateRecordingUI(false);
    },

    syncStatus,
    isRecording: () => isRecording
  };
})();
