const test = require('node:test');
const assert = require('node:assert/strict');

const AgentChat = require('../src/application/use-cases/AgentChat');

test('AgentChat forwards partial execution mode and normalized step orders', async () => {
  const workflow = {
    id: 'wf_partial',
    description: 'Fill intake fields',
    variables: [],
    steps: [
      { stepOrder: 4, actionType: 'input', selector: '[data-testid="intake-first-name"]', label: 'First name', url: 'http://localhost:3000/index.html' },
      { stepOrder: 5, actionType: 'input', selector: '[data-testid="intake-last-name"]', label: 'Last name', url: 'http://localhost:3000/index.html' }
    ]
  };

  const llmProvider = {
    hasApiKey: () => true,
    chatExpectingJson: async () => JSON.stringify({
      reply: 'I will fill only the requested name fields.',
      workflowId: 'wf_partial',
      variables: {
        input_4: 'Carolina',
        input_5: 'Ortiz'
      },
      shouldExecute: true,
      stepOrders: ['4', 5]
    }),
    parseJsonObject: (value) => JSON.parse(value)
  };

  const catalogService = {
    getCatalog: async () => [workflow]
  };

  const calls = [];
  const executor = {
    executeById: async (...args) => {
      calls.push(args);
    }
  };

  const agentChat = new AgentChat(llmProvider, catalogService, executor);
  const response = await agentChat.handleMessage('Llena solamente el nombre de Carolina Ortiz');

  assert.equal(response.executed, true);
  assert.deepEqual(calls, [[
    'wf_partial',
    {
      input_4: 'Carolina',
      input_5: 'Ortiz'
    },
    {
      executionMode: 'partial',
      stepOrders: [4, 5]
    }
  ]]);
});

test('AgentChat fallback stays non-executing without an explicit workflow id', async () => {
  const workflow = {
    id: 'wf_partial',
    description: 'Fill intake fields',
    variables: [],
    steps: []
  };

  const llmProvider = {
    hasApiKey: () => false
  };

  const catalogService = {
    getCatalog: async () => [workflow]
  };

  let executed = false;
  const executor = {
    executeById: async () => {
      executed = true;
    }
  };

  const agentChat = new AgentChat(llmProvider, catalogService, executor);
  const response = await agentChat.handleMessage('Llena solamente el nombre de Carolina Ortiz');

  assert.equal(response.executed, false);
  assert.equal(executed, false);
  assert.equal(response.workflowId, null);
});
