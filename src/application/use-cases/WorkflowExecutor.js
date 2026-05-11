class WorkflowExecutor {
  constructor(catalogService, runner, llmProvider) {
    this.catalogService = catalogService;
    this.runner = runner; // Expects an object with an `executeWorkflow` method
    this.llmProvider = llmProvider;
  }

  normalizeStepOrders(rawStepOrders) {
    if (!Array.isArray(rawStepOrders)) {
      return [];
    }

    const parsed = rawStepOrders
      .map((value) => {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') return Number(value.trim());
        if (value && typeof value === 'object') {
          return Number(value.stepOrder ?? value.order ?? value.id);
        }
        return Number.NaN;
      })
      .filter((value) => Number.isInteger(value) && value > 0);

    return Array.from(new Set(parsed));
  }

  normalizeExecutionMode(options = {}) {
    const requestedMode = `${options.executionMode || options.mode || ''}`.trim().toLowerCase();
    if (requestedMode === 'partial' || requestedMode === 'full') {
      return requestedMode;
    }

    return this.normalizeStepOrders(options.stepOrders).length > 0 ? 'partial' : 'full';
  }

  getVariableBackedStepOrders(variables = {}) {
    return Object.keys(variables)
      .map((name) => {
        const match = /^input_(\d+)$/.exec(name);
        return match ? Number(match[1]) : Number.NaN;
      })
      .filter((value) => Number.isInteger(value) && value > 0);
  }

  buildExecutionPlan(workflow, variables = {}, options = {}) {
    const executableSteps = workflow.steps.filter((step) => this.isExecutableStep(step));
    const executionMode = this.normalizeExecutionMode(options);

    if (executionMode === 'full') {
      return { executionMode, steps: executableSteps };
    }

    const selectedOrders = new Set([
      ...this.normalizeStepOrders(options.stepOrders),
      ...this.getVariableBackedStepOrders(variables)
    ]);

    const steps = executableSteps.filter((step) => {
      if (!selectedOrders.has(step.stepOrder)) {
        return false;
      }

      if (!['input', 'select'].includes(step.actionType)) {
        return true;
      }

      return Object.prototype.hasOwnProperty.call(variables, `input_${step.stepOrder}`);
    });

    return { executionMode, steps };
  }

  isExecutableStep(step) {
    if (!step || !step.actionType) return false;
    if (step.actionType === 'navigation') return Boolean(step.url);
    if (step.actionType === 'click') return Boolean(step.selector);
    if (step.actionType === 'input') return Boolean(step.selector);
    if (step.actionType === 'select') return Boolean(step.selector);
    return false;
  }

  async chooseDynamicOptions(selects, context = {}) {
    if (!Array.isArray(selects) || selects.length === 0) {
      return [];
    }

    if (!this.llmProvider || !this.llmProvider.hasApiKey()) {
      return selects.map((select) => ({
        field: select.testid || select.id || select.name || 'select',
        value: select.options.find((option) => option.value)?.value || ''
      }));
    }

    const messages = [
      {
        role: 'system',
        content: [
          'You choose values for UI select fields during agent workflow execution.',
          'Return JSON only.',
          'The JSON must be an object with a single key "choices" which is an array of objects.',
          'Each object in the "choices" array must have keys: field and value.',
          'field must match the provided field identifier exactly.',
          'value must be exactly one of that field allowed option values.',
          'Use the field label and option labels to infer the best value semantically.',
          'Prefer choices that make the workflow coherent.',
          'Do not default to the first option unless it is semantically the best match.',
          'Never invent values outside the allowed options.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify({
          context,
          selects: selects.map((select) => ({
            field: select.testid || select.id || select.name || 'select',
            label: select.label || '',
            currentValue: select.value || '',
            options: select.options.map((option) => ({
              value: option.value,
              label: option.label || option.text || option.value,
              text: option.text || ''
            }))
          }))
        })
      }
    ];

    const content = await this.llmProvider.chatExpectingJson(messages, { type: 'json_object' });
    console.log('[DEBUG] LLM dynamic options raw response:', content);
    
    let parsed;
    try {
      parsed = this.llmProvider.parseJsonObject(content);
    } catch (e) {
      console.warn(`[DEBUG] Failed to parse JSON: ${e.message}`);
      return [];
    }

    let rawChoices = Array.isArray(parsed) ? parsed : (parsed.choices || parsed.fields || parsed.selects);
    
    if (!Array.isArray(rawChoices)) {
      // Fallback: If the LLM returned a key-value mapping directly
      const keys = Object.keys(parsed);
      if (keys.length > 0 && typeof parsed[keys[0]] === 'string') {
        rawChoices = keys.map(key => ({ field: key, value: parsed[key] }));
      } else {
        console.warn(`[DEBUG] Parsed JSON does not contain an array of choices. Parsed:`, parsed);
        return [];
      }
    }

    return rawChoices;
  }

  async executeById(workflowId, variables = {}, options = {}) {
    const workflow = await this.catalogService.getWorkflowById(workflowId);
    
    if (!workflow || !workflow.steps || workflow.steps.length === 0) {
      throw new Error(`Workflow ${workflowId} not found or has no steps.`);
    }

    const plan = this.buildExecutionPlan(workflow, variables, options);
    
    if (plan.steps.length === 0) {
      if (plan.executionMode === 'partial') {
        throw new Error(`Workflow ${workflowId} has no executable steps for partial activation.`);
      }
      throw new Error(`Workflow ${workflowId} has no executable steps.`);
    }

    const activationLabel = plan.executionMode === 'partial'
      ? `Activating Workflow Partially: ${workflowId}`
      : `Activating Workflow: ${workflowId}`;
    console.log(`\x1b[33m${activationLabel}\x1b[0m`);
    
    // Inject the dynamic option chooser into the runner
    await this.runner.executeWorkflow(plan.steps, variables, { 
      workflowId, 
      optionGuesser: this.chooseDynamicOptions.bind(this),
      executionMode: plan.executionMode
    });
    return `Workflow ${workflowId} executed successfully.`;
  }
}

module.exports = WorkflowExecutor;
