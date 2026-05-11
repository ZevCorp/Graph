const test = require('node:test');
const assert = require('node:assert/strict');

const WorkflowExecutor = require('../src/application/use-cases/WorkflowExecutor');

function buildWorkflow() {
  return {
    id: 'wf_selective',
    steps: [
      {
        stepOrder: 1,
        actionType: 'navigation',
        url: 'http://localhost:3000/index.html'
      },
      {
        stepOrder: 4,
        actionType: 'input',
        selector: '[data-testid="intake-first-name"]',
        url: 'http://localhost:3000/index.html',
        value: 'DefaultFirst'
      },
      {
        stepOrder: 5,
        actionType: 'input',
        selector: '[data-testid="intake-last-name"]',
        url: 'http://localhost:3000/index.html',
        value: 'DefaultLast'
      },
      {
        stepOrder: 22,
        actionType: 'click',
        selector: '[data-testid="intake-save-patient"]',
        url: 'http://localhost:3000/index.html'
      }
    ]
  };
}

test('WorkflowExecutor partial mode runs only requested steps with explicit values', async () => {
  const runnerCalls = [];
  const executor = new WorkflowExecutor(
    { getWorkflowById: async () => buildWorkflow() },
    {
      executeWorkflow: async (...args) => {
        runnerCalls.push(args);
      }
    },
    { hasApiKey: () => false }
  );

  await executor.executeById(
    'wf_selective',
    { input_4: 'Carolina' },
    { executionMode: 'partial', stepOrders: [1, 4, 5] }
  );

  assert.equal(runnerCalls.length, 1);
  const [steps, variables, metadata] = runnerCalls[0];
  assert.deepEqual(steps.map((step) => step.stepOrder), [1, 4]);
  assert.deepEqual(variables, { input_4: 'Carolina' });
  assert.equal(metadata.executionMode, 'partial');
});

test('WorkflowExecutor full mode preserves the full executable workflow', async () => {
  const runnerCalls = [];
  const executor = new WorkflowExecutor(
    { getWorkflowById: async () => buildWorkflow() },
    {
      executeWorkflow: async (...args) => {
        runnerCalls.push(args);
      }
    },
    { hasApiKey: () => false }
  );

  await executor.executeById('wf_selective', { input_4: 'Carolina' });

  assert.equal(runnerCalls.length, 1);
  const [steps, variables, metadata] = runnerCalls[0];
  assert.deepEqual(steps.map((step) => step.stepOrder), [1, 4, 5, 22]);
  assert.deepEqual(variables, { input_4: 'Carolina' });
  assert.equal(metadata.executionMode, 'full');
});

test('WorkflowExecutor partial mode can derive target steps from variables when step orders are omitted', async () => {
  const runnerCalls = [];
  const executor = new WorkflowExecutor(
    { getWorkflowById: async () => buildWorkflow() },
    {
      executeWorkflow: async (...args) => {
        runnerCalls.push(args);
      }
    },
    { hasApiKey: () => false }
  );

  await executor.executeById(
    'wf_selective',
    { input_5: 'Ortiz' },
    { executionMode: 'partial' }
  );

  assert.equal(runnerCalls.length, 1);
  const [steps] = runnerCalls[0];
  assert.deepEqual(steps.map((step) => step.stepOrder), [5]);
});
