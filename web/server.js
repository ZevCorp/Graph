const express = require('express');
const bodyParser = require('body-parser');
const Neo4jDriver = require('../src/infrastructure/Neo4jDriver');
const LLMProvider = require('../src/infrastructure/LLMProvider');
const GraphNavigator = require('../src/application/GraphNavigator');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const db = new Neo4jDriver();
const ai = new LLMProvider();
const navigator = new GraphNavigator(db, ai);

function toNativeNumber(value) {
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  return Number(value);
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStepInput(step = {}, index = 0) {
  return {
    actionType: normalizeText(step.actionType) || '',
    selector: normalizeText(step.selector),
    value: typeof step.value === 'string' ? step.value : '',
    url: normalizeText(step.url),
    explanation: normalizeText(step.explanation),
    label: normalizeText(step.label),
    stepOrder: Number.isFinite(step.stepOrder) ? step.stepOrder : Number(step.stepOrder) || index + 1
  };
}

function normalizeWorkflowInput(body = {}) {
  const id = normalizeText(body.id) || `wf_${Date.now()}`;
  const description = normalizeText(body.description) || 'Untitled workflow';
  const summary = normalizeText(body.summary);
  const status = normalizeText(body.status) || 'draft';
  const steps = Array.isArray(body.steps)
    ? body.steps
        .map((step, index) => normalizeStepInput(step, index))
        .filter((step) => step.actionType || step.selector || step.url)
    : [];

  return { id, description, summary, status, steps };
}

app.use(bodyParser.json());
app.use(express.static('web/public'));

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

let currentWorkflowId = null;

function normalizeAction(step = {}) {
  const actionType = normalizeText(step.actionType) || 'unknown';
  const selector = normalizeText(step.selector);
  const value = typeof step.value === 'string' ? step.value : '';
  const url = normalizeText(step.url);
  const explanation = normalizeText(step.explanation);
  const label = normalizeText(step.label);
  return {
    actionType,
    selector,
    value,
    url,
    explanation,
    label,
    stepOrder: Number.isFinite(step.stepOrder) ? step.stepOrder : Number(step.stepOrder)
  };
}

function inferVariables(steps) {
  return navigator.inferVariables(steps);
}

async function getWorkflowRows(workflowId = null) {
  const params = {};
  const whereClause = workflowId ? 'WHERE w.id = $id' : '';

  if (workflowId) {
    params.id = workflowId;
  }

  return db.run(`
    MATCH (w:Workflow)
    ${whereClause}
    OPTIONAL MATCH (w)-[:HAS_STEP]->(s:Step)
    RETURN w.id as id,
           w.description as description,
           w.summary as summary,
           w.status as status,
           w.createdAt as createdAt,
           w.updatedAt as updatedAt,
           w.completedAt as completedAt,
           s.actionType as actionType,
           s.selector as selector,
           s.value as value,
           s.url as url,
           s.explanation as explanation,
           s.label as label,
           s.stepOrder as stepOrder
    ORDER BY w.id ASC, s.stepOrder ASC
  `, params);
}

function groupWorkflowRows(rows) {
  const grouped = new Map();

  for (const row of rows) {
    if (!grouped.has(row.id)) {
      grouped.set(row.id, {
        id: row.id,
        description: row.description,
        summary: row.summary,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        completedAt: row.completedAt,
        steps: []
      });
    }

    if (row.actionType || row.url || row.selector) {
      grouped.get(row.id).steps.push(normalizeStepInput({
        actionType: row.actionType,
        selector: row.selector,
        value: row.value,
        url: row.url,
        explanation: row.explanation,
        label: row.label,
        stepOrder: row.stepOrder
      }, grouped.get(row.id).steps.length));
    }
  }

  return Array.from(grouped.values()).map((workflow) => ({
    ...workflow,
    variables: inferVariables(workflow.steps),
    totalSteps: workflow.steps.length
  }));
}

async function getWorkflowCatalog() {
  return groupWorkflowRows(await getWorkflowRows());
}

async function getWorkflowById(workflowId) {
  const workflows = groupWorkflowRows(await getWorkflowRows(workflowId));
  return workflows[0] || null;
}

async function saveWorkflowCatalog() {
  const catalog = await getWorkflowCatalog();
  fs.writeFileSync(
    path.join(process.cwd(), 'WORKFLOWS.md'),
    renderWorkflowCatalog(catalog)
  );
  return catalog;
}

function formatCliExample(workflowId, variables) {
  const parts = [`node index.js "run ${workflowId}"`];

  for (const variable of variables) {
    parts.push(`--${variable.name}="..."`);
  }

  return parts.join(' ');
}

function renderWorkflowCatalog(workflows) {
  const lines = ['# Registered Workflows', ''];

  for (const workflow of workflows) {
    lines.push(`## ${workflow.id}`);
    lines.push('');
    lines.push(`- Purpose: ${workflow.summary || workflow.description || 'No summary available.'}`);
    lines.push(`- Status: ${workflow.status || 'unknown'}`);
    lines.push(`- CLI: \`${formatCliExample(workflow.id, workflow.variables)}\``);
    lines.push('');
    lines.push('### Variables');

    if (workflow.variables.length === 0) {
      lines.push('- None');
    } else {
      for (const variable of workflow.variables) {
        lines.push(`- \`${variable.name}\`: ${variable.prompt} (default: \`${variable.defaultValue || ''}\`)`);
      }
    }

    lines.push('');
    lines.push('### Steps');

    for (const step of workflow.steps) {
      const base = `${step.stepOrder}. ${step.actionType.toUpperCase()} ${step.selector || step.url || '(no target)'}`;
      const extras = [];

      if (step.value) extras.push(`value="${step.value}"`);
      if (step.url) extras.push(`url=${step.url}`);
      if (step.explanation) extras.push(`note="${step.explanation}"`);

      lines.push(`- ${base}${extras.length ? ` | ${extras.join(' | ')}` : ''}`);
    }

    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

async function rebuildWorkflowCatalog() {
  await saveWorkflowCatalog();
}

app.get('/api/status', (req, res) => {
  res.json({ recording: !!currentWorkflowId, id: currentWorkflowId });
});

app.post('/api/workflow/start', async (req, res) => {
  try {
    currentWorkflowId = `wf_${Date.now()}`;
    const description = normalizeText(req.body?.description) || 'Untitled workflow';
    console.log(`[Server] Starting workflow: ${currentWorkflowId}`);
    await db.run(
      'CREATE (w:Workflow {id: $id, description: $desc, status: "recording", createdAt: timestamp()})',
      { id: currentWorkflowId, desc: description }
    );
    res.json({ id: currentWorkflowId });
  } catch (err) {
    console.error(`[Server] Start Error: ${err.message}`);
    currentWorkflowId = null;
    res.status(500).send(err.message);
  }
});

app.post('/api/step', async (req, res) => {
  try {
    if (!currentWorkflowId) throw new Error('No active workflow');

    const step = normalizeAction(req.body);
    if (!step.actionType) {
      throw new Error('Step requires actionType');
    }

    const countResult = await db.run(`
      MATCH (w:Workflow {id: $wfId})-[:HAS_STEP]->(s:Step)
      RETURN count(s) as total
    `, { wfId: currentWorkflowId });
    const nextStepOrder = toNativeNumber(countResult[0]?.total || 0) + 1;

    console.log(
      `[Server] Logging step ${nextStepOrder} for ${currentWorkflowId}: ${step.actionType} ${step.selector || step.url}`
    );

    await db.run(`
      MATCH (w:Workflow {id: $wfId})
      CREATE (s:Step {
        actionType: $actionType,
        selector: $selector,
        value: $value,
        url: $url,
        explanation: $explanation,
        label: $label,
        stepOrder: $stepOrder,
        timestamp: timestamp()
      })
      CREATE (w)-[:HAS_STEP]->(s)
    `, {
      wfId: currentWorkflowId,
      ...step,
      stepOrder: nextStepOrder
    });

    res.sendStatus(200);
  } catch (err) {
    console.error(`[Server] Step Error: ${err.message}`);
    res.status(500).send(err.message);
  }
});

app.post('/api/workflow/stop', async (req, res) => {
  try {
    if (!currentWorkflowId) throw new Error('No active workflow');

    console.log(`[Server] Stopping workflow: ${currentWorkflowId}`);
    const steps = await db.run(`
      MATCH (w:Workflow {id: $id})-[:HAS_STEP]->(s:Step)
      RETURN s.actionType as actionType,
             s.selector as selector,
             s.value as value,
             s.url as url,
             s.explanation as explanation,
             s.label as label,
             s.stepOrder as stepOrder
      ORDER BY s.stepOrder ASC
    `, { id: currentWorkflowId });

    const wf = await db.run(
      'MATCH (w:Workflow {id: $id}) RETURN w.description as desc',
      { id: currentWorkflowId }
    );
    const initialDesc = wf.length > 0 ? wf[0].desc : 'No description';

    console.log(`[Server] Processing LLM summary for ${steps.length} steps...`);
    let summary = initialDesc;

    try {
      summary = await ai.summarizeWorkflow(initialDesc, steps);
      console.log(`[Server] LLM Summary: ${summary}`);
    } catch (err) {
      console.warn(`[Server] LLM Warning: ${err.message}`);
    }

    await db.run(
      'MATCH (w:Workflow {id: $id}) SET w.status = "done", w.summary = $summary, w.completedAt = timestamp()',
      { id: currentWorkflowId, summary }
    );

    await rebuildWorkflowCatalog();

    currentWorkflowId = null;
    res.sendStatus(200);
  } catch (err) {
    console.error(`[Server] Stop Error: ${err.message}`);
    res.status(500).send(err.message);
  }
});

app.get('/api/workflows', async (req, res) => {
  try {
    const workflows = await getWorkflowCatalog();
    res.json({ workflows });
  } catch (err) {
    console.error(`[Workflows] List Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/workflows/:id', async (req, res) => {
  try {
    const workflow = await getWorkflowById(req.params.id);
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
    const workflow = normalizeWorkflowInput(req.body || {});
    const existing = await getWorkflowById(workflow.id);
    if (existing) {
      return res.status(409).json({ error: `Workflow ${workflow.id} already exists` });
    }

    await db.run(`
      CREATE (w:Workflow {
        id: $id,
        description: $description,
        summary: $summary,
        status: $status,
        createdAt: timestamp(),
        updatedAt: timestamp()
      })
      WITH w
      UNWIND $steps AS step
      CREATE (s:Step {
        actionType: step.actionType,
        selector: step.selector,
        value: step.value,
        url: step.url,
        explanation: step.explanation,
        label: step.label,
        stepOrder: step.stepOrder,
        timestamp: timestamp()
      })
      CREATE (w)-[:HAS_STEP]->(s)
    `, workflow);

    await saveWorkflowCatalog();
    res.status(201).json({ workflow: await getWorkflowById(workflow.id) });
  } catch (err) {
    console.error(`[Workflows] Create Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/workflows/:id', async (req, res) => {
  try {
    const workflowId = normalizeText(req.params.id);
    const existing = await getWorkflowById(workflowId);
    if (!existing) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const workflow = normalizeWorkflowInput({ ...req.body, id: workflowId });

    await db.run(`
      MATCH (w:Workflow {id: $id})
      SET w.description = $description,
          w.summary = $summary,
          w.status = $status,
          w.updatedAt = timestamp()
      WITH w
      OPTIONAL MATCH (w)-[rel:HAS_STEP]->(old:Step)
      WITH w, collect({rel: rel, old: old}) AS removals
      FOREACH (item IN [entry IN removals WHERE entry.old IS NOT NULL] | DELETE item.rel, item.old)
      WITH w
      UNWIND $steps AS step
      CREATE (s:Step {
        actionType: step.actionType,
        selector: step.selector,
        value: step.value,
        url: step.url,
        explanation: step.explanation,
        label: step.label,
        stepOrder: step.stepOrder,
        timestamp: timestamp()
      })
      CREATE (w)-[:HAS_STEP]->(s)
    `, workflow);

    await saveWorkflowCatalog();
    res.json({ workflow: await getWorkflowById(workflow.id) });
  } catch (err) {
    console.error(`[Workflows] Update Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/workflows/:id', async (req, res) => {
  try {
    const workflowId = normalizeText(req.params.id);
    const existing = await getWorkflowById(workflowId);
    if (!existing) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    await db.run(`
      MATCH (w:Workflow {id: $id})
      OPTIONAL MATCH (w)-[:HAS_STEP]->(s:Step)
      WITH w, collect(s) AS steps
      FOREACH (step IN [item IN steps WHERE item IS NOT NULL] | DETACH DELETE step)
      DETACH DELETE w
    `, { id: workflowId });

    await saveWorkflowCatalog();
    res.json({ deleted: true, id: workflowId });
  } catch (err) {
    console.error(`[Workflows] Delete Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agent/chat', async (req, res) => {
  try {
    const message = normalizeText(req.body?.message);
    const history = Array.isArray(req.body?.history)
      ? req.body.history
          .map((entry) => ({
            role: normalizeText(entry.role) || 'user',
            content: normalizeText(entry.content)
          }))
          .filter((entry) => entry.content)
      : [];
    if (!message) {
      throw new Error('Message is required');
    }

    const workflows = await navigator.getWorkflowCatalog();
    let decision;
    try {
      decision = await ai.decideWorkflowFromMessage(message, workflows, history);
    } catch (error) {
      console.warn(`[Agent Chat] LLM fallback: ${error.message}`);
      decision = ai.fallbackAgentDecision(message, workflows);
      decision.reply = `${decision.reply} LLM fallback engaged because the provider request failed.`;
    }

    if (!decision.workflowId || !decision.shouldExecute) {
      return res.json({
        reply: decision.reply || 'I need a bit more information before I can run a workflow.',
        workflowId: decision.workflowId || null,
        executed: false,
        variables: decision.variables || {}
      });
    }

    await navigator.executeWorkflowById(decision.workflowId, decision.variables || {});

    res.json({
      reply: decision.reply || `Executing workflow ${decision.workflowId}.`,
      workflowId: decision.workflowId,
      executed: true,
      variables: decision.variables || {}
    });
  } catch (err) {
    console.error(`[Agent Chat] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/visualize', async (req, res) => {
  try {
    const neo4j = require('neo4j-driver');
    const toInt = (v) => neo4j.isInt(v) ? v.toNumber() : v;

    const rawNodes = await db.run('MATCH (n) RETURN labels(n)[0] as type, properties(n) as props, id(n) as id');
    const rawEdges = await db.run('MATCH (a)-[r]->(b) RETURN id(a) as from, id(b) as to, type(r) as label');

    const nodes = rawNodes.map((n) => ({ type: n.type, props: n.props, id: toInt(n.id) }));
    const edges = rawEdges.map((e) => ({ from: toInt(e.from), to: toInt(e.to), label: e.label }));

    console.log(`[Visualize] Returning ${nodes.length} nodes and ${edges.length} edges`);
    res.json({ nodes, edges });
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
