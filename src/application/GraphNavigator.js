const PlaywrightRunner = require('../infrastructure/PlaywrightRunner');

class GraphNavigator {
  constructor(db, ai) {
    this.db = db;
    this.ai = ai;
    this.runner = new PlaywrightRunner();
  }

  toNativeNumber(value) {
    if (value && typeof value.toNumber === 'function') return value.toNumber();
    return Number(value);
  }

  normalizeStep(step, index = 0) {
    const hasExplicitAction = Boolean(step.actionType);
    const inferredActionType = hasExplicitAction
      ? step.actionType
      : step.url
        ? 'navigation'
        : null;

    return {
      ...step,
      actionType: inferredActionType,
      stepOrder: step.stepOrder ?? index + 1
    };
  }

  isExecutableStep(step) {
    if (!step || !step.actionType) return false;
    if (step.actionType === 'navigation') return Boolean(step.url);
    if (step.actionType === 'click') return Boolean(step.selector);
    if (step.actionType === 'input') return Boolean(step.selector);
    return false;
  }

  isExecutableWorkflow(workflow) {
    return workflow.steps.some((step) => this.isExecutableStep(step));
  }

  inferVariables(steps) {
    const variableMap = new Map();

    for (const step of steps) {
      if (step.actionType !== 'input' || !step.value) continue;
      const variableName = `input_${step.stepOrder}`;
      variableMap.set(variableName, {
        name: variableName,
        selector: step.selector,
        sourceStep: step.stepOrder,
        defaultValue: step.value,
        prompt: step.explanation || `Value for ${step.label || step.selector || `step ${step.stepOrder}`}`
      });
    }

    return Array.from(variableMap.values());
  }

  async listWorkflows() {
    const workflows = await this.db.run(`
      MATCH (w:Workflow)
      OPTIONAL MATCH (w)-[:HAS_STEP]->(s:Step)
      RETURN w.id as id,
             coalesce(w.summary, w.description) as description,
             w.status as status,
             count(s) as totalSteps,
             count(CASE
               WHEN s.actionType IS NOT NULL OR s.url IS NOT NULL
               THEN 1
             END) as executableSteps
      ORDER BY w.id DESC
    `);

    return workflows.filter((workflow) => this.toNativeNumber(workflow.executableSteps || 0) > 0);
  }

  async getWorkflowSteps(workflowId) {
    const steps = await this.db.run(`
      MATCH (w:Workflow {id: $id})-[:HAS_STEP]->(s:Step)
      RETURN s.actionType as actionType,
             s.selector as selector,
             s.value as value,
             s.url as url,
             s.explanation as explanation,
             s.label as label,
             s.stepOrder as stepOrder,
             s.timestamp as timestamp
      ORDER BY coalesce(s.stepOrder, s.timestamp) ASC
    `, { id: workflowId });

    return steps
      .map((step, index) => this.normalizeStep(step, index))
      .filter((step) => this.isExecutableStep(step));
  }

  async getWorkflowCatalog() {
    const workflows = await this.db.run(`
      MATCH (w:Workflow)
      OPTIONAL MATCH (w)-[:HAS_STEP]->(s:Step)
      RETURN w.id as id,
             w.description as rawDescription,
             coalesce(w.summary, w.description) as description,
             w.status as status,
             s.actionType as actionType,
             s.selector as selector,
             s.value as value,
             s.url as url,
             s.explanation as explanation,
             s.label as label,
             s.stepOrder as stepOrder
      ORDER BY w.id DESC, s.stepOrder ASC
    `);

    const grouped = new Map();

    for (const row of workflows) {
      if (!grouped.has(row.id)) {
        grouped.set(row.id, {
          id: row.id,
          description: row.description,
          rawDescription: row.rawDescription,
          status: row.status,
          steps: []
        });
      }

      if (row.actionType) {
        grouped.get(row.id).steps.push(this.normalizeStep({
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

    return Array.from(grouped.values())
      .map((workflow) => ({
        ...workflow,
        steps: workflow.steps.filter((step) => this.isExecutableStep(step)),
        variables: this.inferVariables(workflow.steps)
      }))
      .filter((workflow) => this.isExecutableWorkflow(workflow));
  }

  async executeWorkflowById(workflowId, variables = {}) {
    const steps = await this.getWorkflowSteps(workflowId);
    if (steps.length === 0) {
      throw new Error(`Workflow ${workflowId} not found or has no steps.`);
    }

    console.log(`\x1b[33mActivating Workflow: ${workflowId}\x1b[0m`);
    await this.runner.executeWorkflow(steps, variables);
    return `Workflow ${workflowId} executed successfully.`;
  }

  async activateWorkflow(prompt, variables = {}) {
    const workflows = await this.listWorkflows();
    const workflowId = await this.ai.getWorkflowAction(prompt, workflows);
    return this.executeWorkflowById(workflowId, variables);
  }

  async raw(cypher) {
    return this.db.run(cypher);
  }
}

module.exports = GraphNavigator;
