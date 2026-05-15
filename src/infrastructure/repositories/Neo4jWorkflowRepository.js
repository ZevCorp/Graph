class Neo4jWorkflowRepository {
  constructor(db) {
    this.db = db;
  }

  serializeAllowedOptions(rawValue) {
    if (Array.isArray(rawValue)) {
      return JSON.stringify(rawValue);
    }
    if (typeof rawValue === 'string') {
      return rawValue;
    }
    return '[]';
  }

  toNativeNumber(value) {
    if (value && typeof value.toNumber === 'function') return value.toNumber();
    return Number(value);
  }

  async getWorkflowRows(workflowId = null) {
    const params = {};
    const whereClause = workflowId ? 'WHERE w.id = $id' : '';
    if (workflowId) {
      params.id = workflowId;
    }

    return this.db.run(`
      MATCH (w:Workflow)
      ${whereClause}
      OPTIONAL MATCH (w)-[:HAS_STEP]->(s:Step)
      RETURN w.id as id,
             w.description as description,
             w.summary as summary,
             w.status as status,
             w.appId as appId,
             w.sourceUrl as sourceUrl,
             w.sourceOrigin as sourceOrigin,
             w.sourcePathname as sourcePathname,
             w.sourceTitle as sourceTitle,
             w.contextNotes as contextNotes,
             w.createdAt as createdAt,
             w.updatedAt as updatedAt,
             w.completedAt as completedAt,
             s.actionType as actionType,
             s.selector as selector,
             s.value as value,
             s.url as url,
             s.explanation as explanation,
             s.label as label,
             s.controlType as controlType,
             s.selectedValue as selectedValue,
             s.selectedLabel as selectedLabel,
             s.allowedOptions as allowedOptions,
             s.stepOrder as stepOrder
      ORDER BY w.id ASC, s.stepOrder ASC
    `, params);
  }

  async startWorkflow(id, description, context = {}) {
    await this.db.run(
      `CREATE (w:Workflow {
        id: $id,
        description: $desc,
        status: "recording",
        appId: $appId,
        sourceUrl: $sourceUrl,
        sourceOrigin: $sourceOrigin,
        sourcePathname: $sourcePathname,
        sourceTitle: $sourceTitle,
        contextNotes: $contextNotes,
        createdAt: timestamp()
      })`,
      {
        id,
        desc: description,
        appId: context.appId || '',
        sourceUrl: context.sourceUrl || '',
        sourceOrigin: context.sourceOrigin || '',
        sourcePathname: context.sourcePathname || '',
        sourceTitle: context.sourceTitle || '',
        contextNotes: JSON.stringify(Array.isArray(context.contextNotes) ? context.contextNotes : [])
      }
    );
  }

  async getStepCount(workflowId) {
    const countResult = await this.db.run(`
      MATCH (w:Workflow {id: $wfId})-[:HAS_STEP]->(s:Step)
      RETURN count(s) as total
    `, { wfId: workflowId });
    return this.toNativeNumber(countResult[0]?.total || 0);
  }

  async addStep(workflowId, step, nextStepOrder) {
    await this.db.run(`
      MATCH (w:Workflow {id: $wfId})
      CREATE (s:Step {
        actionType: $actionType,
        selector: $selector,
        value: $value,
        url: $url,
        explanation: $explanation,
        label: $label,
        controlType: $controlType,
        selectedValue: $selectedValue,
        selectedLabel: $selectedLabel,
        allowedOptions: $allowedOptions,
        stepOrder: $stepOrder,
        timestamp: timestamp()
      })
      CREATE (w)-[:HAS_STEP]->(s)
    `, {
      wfId: workflowId,
      ...step,
      allowedOptions: this.serializeAllowedOptions(step.allowedOptions),
      stepOrder: nextStepOrder
    });
  }

  async addContextNote(workflowId, note) {
    const existing = await this.db.run(
      'MATCH (w:Workflow {id: $id}) RETURN w.contextNotes as contextNotes',
      { id: workflowId }
    );

    const raw = existing[0]?.contextNotes || '[]';
    let currentNotes = [];
    if (Array.isArray(raw)) {
      currentNotes = raw;
    } else {
      try {
        currentNotes = JSON.parse(raw);
        if (!Array.isArray(currentNotes)) {
          currentNotes = [];
        }
      } catch (error) {
        currentNotes = [];
      }
    }

    currentNotes.push({
      transcript: `${note.transcript || ''}`.trim(),
      role: `${note.role || 'user'}`.trim() || 'user',
      mode: `${note.mode || 'unknown'}`.trim() || 'unknown',
      capturedAt: Number(note.capturedAt) || Date.now()
    });

    await this.db.run(
      'MATCH (w:Workflow {id: $id}) SET w.contextNotes = $contextNotes, w.updatedAt = timestamp()',
      {
        id: workflowId,
        contextNotes: JSON.stringify(currentNotes)
      }
    );
  }

  async getWorkflowSteps(workflowId) {
    return this.db.run(`
      MATCH (w:Workflow {id: $id})-[:HAS_STEP]->(s:Step)
      RETURN s.actionType as actionType,
             s.selector as selector,
             s.value as value,
             s.url as url,
             s.explanation as explanation,
             s.label as label,
             s.controlType as controlType,
             s.selectedValue as selectedValue,
             s.selectedLabel as selectedLabel,
             s.allowedOptions as allowedOptions,
             s.stepOrder as stepOrder
      ORDER BY s.stepOrder ASC
    `, { id: workflowId });
  }

  async getWorkflowDescription(workflowId) {
    const wf = await this.db.run(
      'MATCH (w:Workflow {id: $id}) RETURN w.description as desc',
      { id: workflowId }
    );
    return wf.length > 0 ? wf[0].desc : 'No description';
  }

  async completeWorkflow(workflowId, summary) {
    await this.db.run(
      'MATCH (w:Workflow {id: $id}) SET w.status = "done", w.summary = $summary, w.completedAt = timestamp()',
      { id: workflowId, summary }
    );
  }

  async createFullWorkflow(workflow) {
    await this.db.run(`
      CREATE (w:Workflow {
        id: $id,
        description: $description,
        summary: $summary,
        status: $status,
        appId: $appId,
        sourceUrl: $sourceUrl,
        sourceOrigin: $sourceOrigin,
        sourcePathname: $sourcePathname,
        sourceTitle: $sourceTitle,
        contextNotes: $contextNotes,
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
        controlType: step.controlType,
        selectedValue: step.selectedValue,
        selectedLabel: step.selectedLabel,
        allowedOptions: step.allowedOptions,
        stepOrder: step.stepOrder,
        timestamp: timestamp()
      })
      CREATE (w)-[:HAS_STEP]->(s)
    `, {
      ...workflow,
      steps: Array.isArray(workflow.steps)
        ? workflow.steps.map((step) => ({
            ...step,
            allowedOptions: this.serializeAllowedOptions(step.allowedOptions)
          }))
        : []
    });
  }

  async updateFullWorkflow(workflow) {
    await this.db.run(`
      MATCH (w:Workflow {id: $id})
      SET w.description = $description,
          w.summary = $summary,
          w.status = $status,
          w.appId = $appId,
          w.sourceUrl = $sourceUrl,
          w.sourceOrigin = $sourceOrigin,
          w.sourcePathname = $sourcePathname,
          w.sourceTitle = $sourceTitle,
          w.contextNotes = $contextNotes,
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
        controlType: step.controlType,
        selectedValue: step.selectedValue,
        selectedLabel: step.selectedLabel,
        allowedOptions: step.allowedOptions,
        stepOrder: step.stepOrder,
        timestamp: timestamp()
      })
      CREATE (w)-[:HAS_STEP]->(s)
    `, {
      ...workflow,
      steps: Array.isArray(workflow.steps)
        ? workflow.steps.map((step) => ({
            ...step,
            allowedOptions: this.serializeAllowedOptions(step.allowedOptions)
          }))
        : []
    });
  }

  async deleteWorkflow(workflowId) {
    await this.db.run(`
      MATCH (w:Workflow {id: $id})
      OPTIONAL MATCH (w)-[:HAS_STEP]->(s:Step)
      WITH w, collect(s) AS steps
      FOREACH (step IN [item IN steps WHERE item IS NOT NULL] | DETACH DELETE step)
      DETACH DELETE w
    `, { id: workflowId });
  }

  async getGraphVisualization() {
    const rawNodes = await this.db.run('MATCH (n) RETURN labels(n)[0] as type, properties(n) as props, id(n) as id');
    const rawEdges = await this.db.run('MATCH (a)-[r]->(b) RETURN id(a) as from, id(b) as to, type(r) as label');
    return { rawNodes, rawEdges };
  }
}

module.exports = Neo4jWorkflowRepository;
