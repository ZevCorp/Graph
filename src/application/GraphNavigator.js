const PlaywrightRunner = require('../infrastructure/PlaywrightRunner');

class GraphNavigator {
  constructor(db, ai) {
    this.db = db;
    this.ai = ai;
    this.runner = new PlaywrightRunner();
  }

  async activateWorkflow(prompt) {
    const workflows = await this.db.run('MATCH (w:Workflow) RETURN w.id as id, w.description as desc');
    const workflowId = await this.ai.getWorkflowAction(prompt, workflows);
    
    console.log(`\x1b[33mActivating Workflow: ${workflowId}\x1b[0m`);
    
    const steps = await this.db.run(`
      MATCH (w:Workflow {id: $id})-[:HAS_STEP]->(s:Step)
      RETURN s.url as url, s.explanation as explanation
      ORDER BY s.timestamp ASC
    `, { id: workflowId });

    if (steps.length === 0) throw new Error("Workflow not found or has no steps.");
    
    await this.runner.executeWorkflow(steps);
    return `Workflow ${workflowId} executed successfully.`;
  }

  async raw(cypher) {
    return await this.db.run(cypher);
  }
}

module.exports = GraphNavigator;
