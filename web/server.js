const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const path = require('path');

const Neo4jDriver = require('../src/infrastructure/Neo4jDriver');
const LLMProvider = require('../src/infrastructure/LLMProvider');
const PlaywrightRunner = require('../src/infrastructure/PlaywrightRunner');
const VoiceRealtimeGateway = require('../src/infrastructure/VoiceRealtimeGateway');
const Neo4jWorkflowRepository = require('../src/infrastructure/repositories/Neo4jWorkflowRepository');
const MarkdownCatalogWriter = require('../src/infrastructure/file-system/MarkdownCatalogWriter');

const WorkflowCatalog = require('../src/application/use-cases/WorkflowCatalog');
const WorkflowLearner = require('../src/application/use-cases/WorkflowLearner');
const WorkflowExecutor = require('../src/application/use-cases/WorkflowExecutor');
const AgentChat = require('../src/application/use-cases/AgentChat');
const GeneratePitchArtifacts = require('../src/application/use-cases/GeneratePitchArtifacts');
const ConversationInsights = require('../src/application/use-cases/ConversationInsights');
const SurfaceProfileService = require('../src/application/use-cases/SurfaceProfileService');
const LearningSessionService = require('../src/application/use-cases/LearningSessionService');
const ExecutionIntelligenceService = require('../src/application/use-cases/ExecutionIntelligenceService');
const registerLearningRoutes = require('./api/registerLearningRoutes');
const registerWorkflowRoutes = require('./api/registerWorkflowRoutes');
const registerContextRoutes = require('./api/registerContextRoutes');
const registerExecutionIntelligenceRoutes = require('./api/registerExecutionIntelligenceRoutes');
const registerVoiceRoutes = require('./api/registerVoiceRoutes');

const GetGraphVisualization = require('../src/application/use-cases/GetGraphVisualization');

require('dotenv').config();

const app = express();

const db = new Neo4jDriver();
const llmProvider = new LLMProvider();
const playwrightRunner = new PlaywrightRunner();
const repository = new Neo4jWorkflowRepository(db);
const catalogWriter = new MarkdownCatalogWriter();

const catalogService = new WorkflowCatalog(repository, catalogWriter);
const workflowLearner = new WorkflowLearner(repository, llmProvider, catalogWriter, catalogService);
const workflowExecutor = new WorkflowExecutor(catalogService, playwrightRunner, llmProvider);
const agentChat = new AgentChat(llmProvider, catalogService, workflowExecutor);
const generatePitchArtifacts = new GeneratePitchArtifacts(
  catalogService,
  llmProvider,
  path.join(process.cwd(), 'generated', 'pitch-personalities')
);
const conversationInsights = new ConversationInsights(
  llmProvider,
  path.join(process.cwd(), 'generated', 'conversation-insights')
);
const surfaceProfileService = new SurfaceProfileService(repository, llmProvider);
const learningSessionService = new LearningSessionService(workflowLearner);
const getGraphVisualization = new GetGraphVisualization(repository);
const executionIntelligenceService = new ExecutionIntelligenceService(llmProvider);

app.use(bodyParser.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Graph-Voice-Context, X-Graph-Voice-History');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.get('/', (req, res) => {
  res.redirect('/index.html');
});

app.get('/examples/medical-demo', (req, res) => {
  res.redirect('/index.html');
});

app.use(express.static('web/public'));

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

registerLearningRoutes(app, { learningSessionService });
registerWorkflowRoutes(app, { catalogService, workflowExecutor });
registerContextRoutes(app, {
  generatePitchArtifacts,
  conversationInsights,
  catalogService,
  surfaceProfileService
});
registerExecutionIntelligenceRoutes(app, { catalogService, executionIntelligenceService });
registerVoiceRoutes(app, {
  express,
  agentChat,
  catalogService
});

app.post('/api/agent/chat', async (req, res) => {
  try {
    const response = await agentChat.handleMessage(
      req.body?.message,
      req.body?.history,
      req.body?.context || {},
      { executionMode: req.body?.executionMode || 'browser' }
    );
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

const PORT = process.env.PORT || process.env.WEB_PORT || 3000;
app.set('port', PORT);
const server = http.createServer(app);
const voiceGateway = new VoiceRealtimeGateway({
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  openAiApiKey: process.env.OPENAI_API_KEY,
  llmProvider,
  catalogService,
  agentChat,
  conversationInsights
});
voiceGateway.attach(server);

server.listen(PORT, () => console.log(`[Server] Running on http://localhost:${PORT}`));
