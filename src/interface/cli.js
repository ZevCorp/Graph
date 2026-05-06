require('dotenv').config();
const readline = require('readline');
const Neo4jDriver = require('../infrastructure/Neo4jDriver');
const LLMProvider = require('../infrastructure/LLMProvider');
const GraphNavigator = require('../application/GraphNavigator');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'graph> '
});

const navigator = new GraphNavigator(new Neo4jDriver(), new LLMProvider());

console.log("\x1b[32mGraph Navigator CLI (Agentic Mode)\x1b[0m");
console.log("Commands:");
console.log("- 'exit': Quit");
console.log("- '/<cypher>': Raw Cypher");
console.log("- '<natural language>': Activate a recorded workflow (via OpenRouter/Nemotron)");
rl.prompt();

rl.on('line', async (line) => {
  const input = line.trim();
  if (input.toLowerCase() === 'exit') rl.close();
  if (!input) { rl.prompt(); return; }

  try {
    if (input.startsWith('/')) {
      const result = await navigator.raw(input.slice(1));
      console.table(result);
    } else {
      const msg = await navigator.activateWorkflow(input);
      console.log(msg);
    }
  } catch (err) {
    console.error("\x1b[31mError:\x1b[0m", err.message);
  }
  rl.prompt();
}).on('close', () => {
  process.exit(0);
});
