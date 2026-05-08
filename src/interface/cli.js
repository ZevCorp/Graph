require('dotenv').config();
const readline = require('readline');
const Neo4jDriver = require('../infrastructure/Neo4jDriver');
const LLMProvider = require('../infrastructure/LLMProvider');
const PlaywrightRunner = require('../infrastructure/PlaywrightRunner');
const Neo4jWorkflowRepository = require('../infrastructure/repositories/Neo4jWorkflowRepository');
const MarkdownCatalogWriter = require('../infrastructure/file-system/MarkdownCatalogWriter');
const WorkflowCatalog = require('../application/use-cases/WorkflowCatalog');
const WorkflowExecutor = require('../application/use-cases/WorkflowExecutor');
const AgentChat = require('../application/use-cases/AgentChat');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'graph> '
});

// Setup Clean Architecture DI
const db = new Neo4jDriver();
const llmProvider = new LLMProvider();
const playwrightRunner = new PlaywrightRunner();
const repository = new Neo4jWorkflowRepository(db);
const catalogWriter = new MarkdownCatalogWriter();

const catalogService = new WorkflowCatalog(repository, catalogWriter);
const executor = new WorkflowExecutor(catalogService, playwrightRunner, llmProvider);
const agentChat = new AgentChat(llmProvider, catalogService, executor);

function parseVariableFlags(tokens) {
  const variables = {};
  for (const token of tokens) {
    if (!token.startsWith('--')) continue;
    const eqIndex = token.indexOf('=');
    if (eqIndex === -1) continue;
    const key = token.slice(2, eqIndex);
    const value = token.slice(eqIndex + 1).replace(/^"(.*)"$/, '$1');
    variables[key] = value;
  }
  return variables;
}

async function handleCommand(input) {
  if (input.startsWith('/')) {
    // Raw cypher
    const result = await db.run(input.slice(1));
    console.table(result);
    return;
  }

  if (input === 'list') {
    const workflows = await catalogService.getCatalog();
    console.table(workflows.map(w => ({
      id: w.id,
      description: w.summary || w.description,
      status: w.status,
      totalSteps: w.totalSteps
    })));
    return;
  }

  if (input.startsWith('run ')) {
    const tokens = input.split(/\s+/);
    const workflowId = tokens[1];
    const variables = parseVariableFlags(tokens.slice(2));
    const msg = await executor.executeById(workflowId, variables);
    console.log(msg);
    return;
  }

  const response = await agentChat.handleMessage(input);
  console.log(`[Agent] ${response.reply}`);
}

console.log('\x1b[32mGraph Navigator CLI (Agentic Mode)\x1b[0m');
console.log('Commands:');
console.log("- 'list': Show recorded workflows");
console.log("- 'run <workflowId> --input_<stepOrder>=value': Execute a recorded workflow directly");
console.log("- '/<cypher>': Raw Cypher");
console.log("- '<natural language>': Let the LLM choose a workflow");
console.log("- 'exit': Quit");
rl.prompt();

rl.on('line', async (line) => {
  const input = line.trim();
  if (input.toLowerCase() === 'exit') rl.close();
  if (!input) {
    rl.prompt();
    return;
  }

  try {
    await handleCommand(input);
  } catch (err) {
    console.error('\x1b[31mError:\x1b[0m', err.message);
  }

  rl.prompt();
}).on('close', () => {
  process.exit(0);
});
