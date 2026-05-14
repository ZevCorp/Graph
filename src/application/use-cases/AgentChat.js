class AgentChat {
  constructor(llmProvider, catalogService, executor) {
    this.llmProvider = llmProvider;
    this.catalogService = catalogService;
    this.executor = executor;
  }

  filterWorkflowsForContext(workflows, context = {}) {
    if (!Array.isArray(workflows) || workflows.length === 0) {
      return [];
    }

    const appId = `${context.appId || ''}`.trim();
    if (appId) {
      const byAppId = workflows.filter((workflow) => `${workflow.appId || ''}`.trim() === appId);
      return byAppId;
    }

    const sourcePathname = `${context.sourcePathname || ''}`.trim();
    if (sourcePathname) {
      const byPath = workflows.filter((workflow) => `${workflow.sourcePathname || ''}`.trim() === sourcePathname);
      return byPath;
    }

    return workflows;
  }

  fallbackAgentDecision(message, workflows) {
    const chosen = workflows.find((workflow) =>
      `${workflow.id} ${workflow.description} ${workflow.summary || ''}`.toLowerCase().includes(message.toLowerCase())
    ) || workflows[0];

    if (!chosen) {
      return {
        reply: 'No workflows are available yet. Record one first.',
        workflowId: null,
        variables: {},
        shouldExecute: false
      };
    }

    return {
      reply: `I can run ${chosen.id}.`,
      workflowId: chosen.id,
      variables: {},
      shouldExecute: true
    };
  }

  async decideWorkflowFromMessage(message, workflows, history = [], context = {}) {
    if (!this.llmProvider.hasApiKey()) {
      return this.fallbackAgentDecision(message, workflows);
    }

    const assistantProfile = context.assistantProfile && typeof context.assistantProfile === 'object'
      ? context.assistantProfile
      : null;
    const assistantProfileText = assistantProfile
      ? JSON.stringify(assistantProfile)
      : '';

    const messages = [
      {
        role: 'system',
        content: [
          'You are the workflow activation assistant.',
          assistantProfileText
            ? `Adopt this page-specific assistant profile while you reply and decide what information is missing: ${assistantProfileText}.`
            : 'Use a concise, helpful, neutral tone.',
          'Your job is to read the user request and the workflow catalog, then decide whether one workflow should be executed.',
          'Return JSON only with keys: reply, workflowId, variables, shouldExecute.',
          'reply: short assistant message to show the user.',
          'workflowId: exact workflow id or null.',
          'variables: object mapping variable names like input_2 to their values.',
          'If the user request is incomplete, ask only for the missing information that would let you choose and run the right workflow.',
          'Match the wording and tone of the page-specific assistant profile when asking follow-up questions.',
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
          context,
          userMessage: message,
          workflows: workflows.map((workflow) => ({
            id: workflow.id,
            description: workflow.description,
            appId: workflow.appId,
            sourceUrl: workflow.sourceUrl,
            sourceOrigin: workflow.sourceOrigin,
            sourcePathname: workflow.sourcePathname,
            variables: workflow.variables,
            steps: workflow.steps.map((step) => ({
              stepOrder: step.stepOrder,
              actionType: step.actionType,
              selector: step.selector,
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
    return this.llmProvider.parseJsonObject(content);
  }

  async handleMessage(message, history = [], context = {}) {
    if (!message) {
      throw new Error('Message is required');
    }

    const workflows = this.filterWorkflowsForContext(await this.catalogService.getCatalog(), context);
    let decision;
    
    try {
      decision = await this.decideWorkflowFromMessage(message, workflows, history, context);
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

    await this.executor.executeById(decision.workflowId, decision.variables || {});

    return {
      reply: decision.reply || `Executing workflow ${decision.workflowId}.`,
      workflowId: decision.workflowId,
      executed: true,
      variables: decision.variables || {}
    };
  }
}

module.exports = AgentChat;
