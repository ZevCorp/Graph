class AgentChat {
  constructor(llmProvider, catalogService, executor) {
    this.llmProvider = llmProvider;
    this.catalogService = catalogService;
    this.executor = executor;
  }

  normalizeStepOrders(rawStepOrders) {
    const source = Array.isArray(rawStepOrders) ? rawStepOrders : [];

    const parsed = source
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

  normalizeDecision(rawDecision = {}) {
    const decision = rawDecision && typeof rawDecision === 'object' ? rawDecision : {};
    const variables = decision.variables && typeof decision.variables === 'object' && !Array.isArray(decision.variables)
      ? decision.variables
      : {};
    const stepOrders = this.normalizeStepOrders(
      decision.stepOrders || decision.selectedStepOrders || decision.steps
    );
    const requestedMode = `${decision.executionMode || decision.mode || ''}`.trim().toLowerCase();
    const executionMode = requestedMode === 'partial' || requestedMode === 'full'
      ? requestedMode
      : stepOrders.length > 0
        ? 'partial'
        : 'full';

    return {
      reply: typeof decision.reply === 'string' ? decision.reply : '',
      workflowId: typeof decision.workflowId === 'string' && decision.workflowId.trim()
        ? decision.workflowId.trim()
        : null,
      variables,
      shouldExecute: Boolean(decision.shouldExecute),
      executionMode,
      stepOrders
    };
  }

  fallbackAgentDecision(message, workflows) {
    const normalizedMessage = `${message || ''}`.trim().toLowerCase();
    const chosen = workflows.find((workflow) =>
      normalizedMessage.includes((workflow.id || '').toLowerCase())
    );

    if (!chosen) {
      return {
        reply: 'I need the workflow activation model or an explicit workflow id before I can run anything safely.',
        workflowId: null,
        variables: {},
        shouldExecute: false,
        executionMode: 'full',
        stepOrders: []
      };
    }

    return {
      reply: `I can run ${chosen.id}.`,
      workflowId: chosen.id,
      variables: {},
      shouldExecute: true,
      executionMode: 'full',
      stepOrders: []
    };
  }

  async decideWorkflowFromMessage(message, workflows, history = []) {
    if (!this.llmProvider.hasApiKey()) {
      return this.fallbackAgentDecision(message, workflows);
    }

    const messages = [
      {
        role: 'system',
        content: [
          'You are the workflow activation assistant.',
          'Your job is to read the user request and the workflow catalog, then decide whether one workflow should be executed.',
          'Return JSON only with keys: reply, workflowId, variables, shouldExecute, executionMode, stepOrders.',
          'reply: short assistant message to show the user.',
          'workflowId: exact workflow id or null.',
          'variables: object mapping variable names like input_2 to their values.',
          'executionMode: use "partial" when the user wants only specific fields or actions. Use "full" only when the user clearly wants the whole recorded workflow.',
          'stepOrders: array of recorded step numbers to execute. In partial mode include only the steps that directly satisfy the request.',
          'Prefer input/select step numbers over intermediary click steps when filling fields, because the executor can navigate directly by page URL.',
          'Do not include unrelated later fields, save buttons, or completion buttons unless the user explicitly asks for them.',
          'If you infer a related field that should also be filled, include its step number and provide its value in variables.',
          'When a variable belongs to a select control, treat it as a closed set choice, not free text.',
          'When a variable belongs to a select control, prefer one of the allowed option values exactly.',
          'If the user intent matches an option label better than an option value, convert it to the corresponding option value.',
          'Use the field label and option meanings, not position in the dropdown.',
          'Never choose the first option just because it is first; choose based on semantic fit.',
          'shouldExecute: true only if the workflow and needed variables are clear enough to run now.',
          'If the request is ambiguous or missing required values, set shouldExecute to false and ask for the missing information in reply.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify({
          conversation: history,
          userMessage: message,
          workflows: workflows.map((workflow) => ({
            id: workflow.id,
            description: workflow.description,
            variables: workflow.variables,
            steps: workflow.steps.map((step) => ({
              stepOrder: step.stepOrder,
              actionType: step.actionType,
              selector: step.selector,
              label: step.label,
              url: step.url,
              value: step.value,
              explanation: step.explanation,
              controlType: step.controlType,
              selectedValue: step.selectedValue,
              selectedLabel: step.selectedLabel,
              allowedOptions: step.allowedOptions
            }))
          }))
        })
      }
    ];

    const content = await this.llmProvider.chatExpectingJson(messages, { type: 'json_object' });
    return this.normalizeDecision(this.llmProvider.parseJsonObject(content));
  }

  async handleMessage(message, history = []) {
    if (!message) {
      throw new Error('Message is required');
    }

    const workflows = await this.catalogService.getCatalog();
    let decision;
    
    try {
      decision = await this.decideWorkflowFromMessage(message, workflows, history);
    } catch (error) {
      console.warn(`[Agent Chat] LLM fallback: ${error.message}`);
      decision = this.fallbackAgentDecision(message, workflows);
      decision.reply = `${decision.reply} LLM fallback engaged because the provider request failed.`;
    }

    if (!decision.workflowId || !decision.shouldExecute) {
      return {
        reply: decision.reply || 'I need a bit more information before I can run a workflow.',
        workflowId: decision.workflowId || null,
        executed: false,
        variables: decision.variables || {}
      };
    }

    await this.executor.executeById(
      decision.workflowId,
      decision.variables || {},
      {
        executionMode: decision.executionMode,
        stepOrders: decision.stepOrders
      }
    );

    return {
      reply: decision.reply || `Executing workflow ${decision.workflowId}.`,
      workflowId: decision.workflowId,
      executed: true,
      variables: decision.variables || {}
    };
  }
}

module.exports = AgentChat;
