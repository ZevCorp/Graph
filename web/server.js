const express = require('express');
const bodyParser = require('body-parser');

const Neo4jDriver = require('../src/infrastructure/Neo4jDriver');
const LLMProvider = require('../src/infrastructure/LLMProvider');
const PlaywrightRunner = require('../src/infrastructure/PlaywrightRunner');
const Neo4jWorkflowRepository = require('../src/infrastructure/repositories/Neo4jWorkflowRepository');
const MarkdownCatalogWriter = require('../src/infrastructure/file-system/MarkdownCatalogWriter');

const WorkflowCatalog = require('../src/application/use-cases/WorkflowCatalog');
const WorkflowLearner = require('../src/application/use-cases/WorkflowLearner');
const WorkflowExecutor = require('../src/application/use-cases/WorkflowExecutor');
const AgentChat = require('../src/application/use-cases/AgentChat');

const GetGraphVisualization = require('../src/application/use-cases/GetGraphVisualization');

require('dotenv').config();

const app = express();

// Initialize Infrastructure
const db = new Neo4jDriver();
const llmProvider = new LLMProvider();
const playwrightRunner = new PlaywrightRunner(); // Decoupled!
const repository = new Neo4jWorkflowRepository(db);
const catalogWriter = new MarkdownCatalogWriter();

// Initialize Application Use Cases
const catalogService = new WorkflowCatalog(repository, catalogWriter);
const workflowLearner = new WorkflowLearner(repository, llmProvider, catalogWriter, catalogService);
const workflowExecutor = new WorkflowExecutor(catalogService, playwrightRunner, llmProvider);
const agentChat = new AgentChat(llmProvider, catalogService, workflowExecutor);
const getGraphVisualization = new GetGraphVisualization(repository);

app.use(bodyParser.json());
app.use(express.static('web/public'));

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

let currentWorkflowId = null;

app.get('/api/status', (req, res) => {
  res.json({ recording: !!currentWorkflowId, id: currentWorkflowId });
});

app.post('/api/workflow/start', async (req, res) => {
  try {
    const description = (req.body?.description || '').trim() || 'Untitled workflow';
    currentWorkflowId = await workflowLearner.startSession(description);
    console.log(`[Server] Starting workflow: ${currentWorkflowId}`);
    res.json({ id: currentWorkflowId });
  } catch (err) {
    console.error(`[Server] Start Error: ${err.message}`);
    currentWorkflowId = null;
    res.status(500).send(err.message);
  }
});

app.post('/api/step', async (req, res) => {
  try {
    const stepOrder = await workflowLearner.recordStep(currentWorkflowId, req.body);
    console.log(`[Server] Logging step ${stepOrder} for ${currentWorkflowId}`);
    res.sendStatus(200);
  } catch (err) {
    console.error(`[Server] Step Error: ${err.message}`);
    res.status(500).send(err.message);
  }
});

app.post('/api/workflow/stop', async (req, res) => {
  try {
    console.log(`[Server] Stopping workflow: ${currentWorkflowId}`);
    const summary = await workflowLearner.finishSession(currentWorkflowId);
    console.log(`[Server] Final Summary: ${summary}`);
    currentWorkflowId = null;
    res.sendStatus(200);
  } catch (err) {
    console.error(`[Server] Stop Error: ${err.message}`);
    res.status(500).send(err.message);
  }
});

app.get('/api/workflows', async (req, res) => {
  try {
    const workflows = await catalogService.getCatalog();
    res.json({ workflows });
  } catch (err) {
    console.error(`[Workflows] List Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/workflows/:id', async (req, res) => {
  try {
    const workflow = await catalogService.getWorkflowById(req.params.id);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    res.json({ workflow });
  } catch (err) {
    console.error(`[Workflows] Read Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/workflows', async (req, res) => {
  try {
    const workflow = req.body || {};
    workflow.id = (workflow.id || '').trim() || `wf_${Date.now()}`;
    const newWf = await catalogService.saveWorkflow(workflow);
    res.status(201).json({ workflow: newWf });
  } catch (err) {
    console.error(`[Workflows] Create Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/workflows/:id', async (req, res) => {
  try {
    const workflow = { ...req.body, id: (req.params.id || '').trim() };
    const updated = await catalogService.updateWorkflow(workflow);
    res.json({ workflow: updated });
  } catch (err) {
    console.error(`[Workflows] Update Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/workflows/:id', async (req, res) => {
  try {
    const workflowId = (req.params.id || '').trim();
    await catalogService.deleteWorkflow(workflowId);
    res.json({ deleted: true, id: workflowId });
  } catch (err) {
    console.error(`[Workflows] Delete Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agent/chat', async (req, res) => {
  try {
    const response = await agentChat.handleMessage(req.body?.message, req.body?.history);
    res.json(response);
  } catch (err) {
    console.error(`[Agent Chat] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/visualize', async (req, res) => {
  try {
    const data = await getGraphVisualization.execute();
    console.log(`[Visualize] Returning ${data.nodes.length} nodes and ${data.edges.length} edges`);
    res.json(data);
  } catch (err) {
    console.error(`[Visualize] Error: ${err.message}`);
    res.status(500).send(err.message);
  }
});

app.post('/api/reset', (req, res) => {
  console.log('[Server] Manual status reset');
  currentWorkflowId = null;
  res.sendStatus(200);
});

const PORT = process.env.WEB_PORT || 3000;
app.listen(PORT, () => console.log(`[Server] Running on http://localhost:${PORT}`));
