const express = require('express');
const bodyParser = require('body-parser');
const Neo4jDriver = require('../src/infrastructure/Neo4jDriver');
const fs = require('fs');
require('dotenv').config();

const app = express();
const db = new Neo4jDriver();
app.use(bodyParser.json());
app.use(express.static('web/public'));

let currentWorkflowId = null;

app.post('/api/workflow/start', async (req, res) => {
  currentWorkflowId = `wf_${Date.now()}`;
  const { description } = req.body;
  await db.run('CREATE (w:Workflow {id: $id, description: $desc, status: "recording"})', { id: currentWorkflowId, desc: description });
  res.json({ id: currentWorkflowId });
});

app.post('/api/step', async (req, res) => {
  if (!currentWorkflowId) return res.status(400).send("No active workflow");
  const { url, explanation } = req.body;
  await db.run(`
    MATCH (w:Workflow {id: $wfId})
    CREATE (s:Step {url: $url, explanation: $explanation, timestamp: timestamp()})
    CREATE (w)-[:HAS_STEP]->(s)
  `, { wfId: currentWorkflowId, url, explanation });
  res.sendStatus(200);
});

app.post('/api/workflow/stop', async (req, res) => {
  await db.run('MATCH (w:Workflow {id: $id}) SET w.status = "done"', { id: currentWorkflowId });
  
  // Sync WORKFLOWS.md
  const workflows = await db.run('MATCH (w:Workflow) RETURN w.id as id, w.description as desc');
  const content = "# Registered Workflows\n\n" + workflows.map(w => `- **${w.id}**: ${w.desc}`).join('\n');
  fs.writeFileSync('WORKFLOWS.md', content);
  
  currentWorkflowId = null;
  res.sendStatus(200);
});

app.listen(process.env.WEB_PORT, () => console.log(`Web app on port ${process.env.WEB_PORT}`));
