class AgentChat {
  constructor(llmProvider, catalogService, executor) {
    this.llmProvider = llmProvider;
    this.catalogService = catalogService;
    this.executor = executor;
  }

  wantsInventedValues(message = '', history = []) {
    const combined = [
      ...history.map((item) => item?.content || ''),
      message || ''
    ].join(' ').toLowerCase();

    return [
      'inventa',
      'inventalo',
      'invéntalo',
      'inventa todo',
      'usa datos falsos',
      'datos falsos',
      'es una prueba',
      'no me preguntes',
      'no te voy a dar',
      'rellena tu',
      'rellénalo tú',
      'hazlo tu',
      'hazlo tú'
    ].some((token) => combined.includes(token));
  }

  pickWorkflowForInventedExecution(workflows = [], decision = {}, message = '') {
    if (!Array.isArray(workflows) || workflows.length === 0) {
      return null;
    }

    if (decision?.workflowId) {
      const exact = workflows.find((workflow) => workflow.id === decision.workflowId);
      if (exact) {
        return exact;
      }
    }

    const lowerMessage = `${message || ''}`.toLowerCase();
    const matched = workflows.find((workflow) =>
      `${workflow.id || ''} ${workflow.description || ''} ${workflow.summary || ''}`.toLowerCase().includes(lowerMessage)
    );

    return matched || workflows[0];
  }

  buildSyntheticValue(variable = {}, index = 0) {
    const label = `${variable.fieldLabel || variable.prompt || variable.selector || ''}`.toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOffset = label.includes('hasta') || label.includes('return') ? 2 : 1;
    const baseDate = new Date(today);
    baseDate.setDate(today.getDate() + dayOffset + Math.floor(index / 8));
    const isoDate = baseDate.toISOString().slice(0, 10);

    if (label.includes('mail') || label.includes('correo') || label.includes('email')) {
      return `prueba.graph.${index + 1}@example.com`;
    }
    if (label.includes('fecha de nacimiento') || label.includes('birth')) {
      return '1994-08-17';
    }
    if (label.includes('fecha') || label.includes('desde') || label.includes('hasta') || label.includes('pickup') || label.includes('return')) {
      return isoDate;
    }
    if (label.includes('telefono') || label.includes('whatsapp') || label.includes('phone') || label.includes('cel')) {
      return '+573001112233';
    }
    if (label.includes('documento') || label.includes('cedula') || label.includes('passport') || label.includes('ident')) {
      return `90000${String(100 + index)}`;
    }
    if (label.includes('nombre')) {
      return index % 2 === 0 ? 'Alex' : 'Jordan';
    }
    if (label.includes('apellido')) {
      return 'Prueba';
    }
    if (label.includes('ciudad')) {
      return 'Medellin';
    }
    if (label.includes('nacionalidad')) {
      return 'Colombiana';
    }
    if (label.includes('direccion') || label.includes('dirección')) {
      return 'Calle 10 # 43A-25';
    }
    if (label.includes('comentario') || label.includes('requerimiento')) {
      return 'Prueba automatizada con un pasajero, dos maletas y preferencia por Mercedes.';
    }
    if (label.includes('aerolinea')) {
      return 'Avianca';
    }
    if (label.includes('vuelo')) {
      return 'AV9543';
    }
    if (label.includes('reserva')) {
      return 'PRUEBA123';
    }

    return `prueba-${index + 1}`;
  }

  buildInventedVariables(workflow, existingVariables = {}) {
    const output = { ...(existingVariables || {}) };
    const variables = Array.isArray(workflow?.variables) ? workflow.variables : [];

    for (let index = 0; index < variables.length; index += 1) {
      const variable = variables[index];
      if (!variable?.name || Object.prototype.hasOwnProperty.call(output, variable.name)) {
        continue;
      }

      const allowedOptions = Array.isArray(variable.allowedOptions)
        ? variable.allowedOptions.filter((option) => option && option.value)
        : [];

      if (`${variable.defaultValue || ''}`.trim()) {
        output[variable.name] = variable.defaultValue;
        continue;
      }

      if (allowedOptions.length > 0) {
        output[variable.name] = allowedOptions[0].value;
        continue;
      }

      output[variable.name] = this.buildSyntheticValue(variable, index);
    }

    return output;
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

  isDemoAutopilotContext(context = {}) {
    return `${context.demoMode || ''}`.trim().toLowerCase() === 'autopilot'
      || `${context.appId || ''}`.trim().toLowerCase() === 'car-demo';
  }

  wantsImmediateDemoExecution(message = '', history = []) {
    const combined = [
      ...history.map((item) => item?.content || ''),
      message || ''
    ].join(' ').toLowerCase();

    return [
      'reserva',
      'reservar',
      'haz la reserva',
      'hazme la reserva',
      'hazlo',
      'cotiza',
      'cotizacion',
      'cotíz',
      'separa el carro',
      'apartalo',
      'apártalo',
      'quiero ese',
      'quiero este',
      'me lo llevo',
      'dale',
      'continua',
      'continua',
      'sigue'
    ].some((token) => combined.includes(token));
  }

  buildDemoAutopilotDecision(workflows = [], message = '', history = []) {
    const chosenWorkflow = this.pickWorkflowForInventedExecution(workflows, {}, message);
    if (!chosenWorkflow) {
      return null;
    }

    return {
      reply: 'Perfecto, ya me encargo de la reserva.',
      workflowId: chosenWorkflow.id,
      variables: this.buildInventedVariables(chosenWorkflow, {}),
      shouldExecute: true
    };
  }

  fallbackAgentDecision(message, workflows) {
    const chosen = workflows.find((workflow) =>
      `${workflow.id} ${workflow.description} ${workflow.summary || ''}`.toLowerCase().includes(message.toLowerCase())
    ) || workflows[0];

    if (!chosen) {
      return {
        reply: 'Todavia no tengo una forma lista para ayudarte en esta pagina.',
        workflowId: null,
        variables: {},
        shouldExecute: false
      };
    }

    return {
      reply: 'Puedo encargarme de esto por ti.',
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
          'Never mention workflow ids, internal automation, technical modes, or implementation details to the user.',
          'Speak in the language of the service being offered, such as helping with a reservation, form, or request.',
          'Your job is to read the user request and the workflow catalog, then decide whether one workflow should be executed.',
          'Return JSON only with keys: reply, workflowId, variables, shouldExecute.',
          'reply: short assistant message to show the user.',
          'workflowId: exact workflow id or null.',
          'variables: object mapping variable names like input_2 to their values.',
          this.isDemoAutopilotContext(context)
            ? 'This page is running in demo autopilot mode. If the user asks to reserve, quote, continue, or do the process, never ask for confirmations, never ask for extra data, choose the best matching workflow immediately, reuse recorded defaults, invent any remaining values, and set shouldExecute to true.'
            : 'If the user request is incomplete, ask only for the missing information that would let you choose and run the right workflow.',
          'If the user explicitly says this is a test, asks you to invent values, use fake data, fill defaults, or proceed without asking, then do not ask follow-up questions.',
          'In that case, choose the workflow, reuse recorded default values when available, invent any remaining required values, and set shouldExecute to true.',
          'Match the wording and tone of the page-specific assistant profile when asking follow-up questions.',
          'When a variable belongs to a select control, treat it as a closed set choice, not free text.',
          'When a variable belongs to a select control, prefer one of the allowed option values exactly.',
          'If the user intent matches an option label better than an option value, convert it to the corresponding option value.',
          'Use the field label and option meanings, not position in the dropdown.',
          'Any date you choose or invent must be today or later, never in the past.',
          'Return dates must be the same day as pickup or later.',
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

  async handleMessage(message, history = [], context = {}, options = {}) {
    if (!message) {
      throw new Error('Message is required');
    }

    const workflows = this.filterWorkflowsForContext(await this.catalogService.getCatalog(), context);
    let decision;

    if (this.isDemoAutopilotContext(context) && this.wantsImmediateDemoExecution(message, history)) {
      decision = this.buildDemoAutopilotDecision(workflows, message, history);
    }
    
    if (!decision) {
      try {
        decision = await this.decideWorkflowFromMessage(message, workflows, history, context);
      } catch (error) {
        console.warn(`[Agent Chat] LLM fallback: ${error.message}`);
        decision = this.fallbackAgentDecision(message, workflows);
        decision.reply = this.isDemoAutopilotContext(context)
          ? 'Perfecto, ya me encargo de la reserva.'
          : `${decision.reply} LLM fallback engaged because the provider request failed.`;
      }
    }

    if (this.isDemoAutopilotContext(context) && decision && decision.workflowId) {
      const chosenWorkflow = this.pickWorkflowForInventedExecution(workflows, decision, message);
      if (chosenWorkflow) {
        decision = {
          ...decision,
          workflowId: chosenWorkflow.id,
          shouldExecute: true,
          variables: this.buildInventedVariables(chosenWorkflow, decision.variables || {}),
          reply: 'Perfecto, ya me encargo de la reserva.'
        };
      }
    } else if (this.wantsInventedValues(message, history)) {
      const chosenWorkflow = this.pickWorkflowForInventedExecution(workflows, decision, message);
      if (chosenWorkflow) {
        decision = {
          ...decision,
          workflowId: chosenWorkflow.id,
          shouldExecute: true,
          variables: this.buildInventedVariables(chosenWorkflow, decision.variables || {}),
          reply: decision.reply && decision.shouldExecute
            ? decision.reply
            : `Voy a completar la prueba con datos inventados y ejecutar ${chosenWorkflow.id}.`
        };
        decision.reply = 'Perfecto, voy a completar la prueba con datos inventados y encargarme de la reserva por ti.';
      }
    }

    if (!decision.workflowId || !decision.shouldExecute) {
      return {
        reply: decision.reply || 'Todavia me falta un poco de informacion para encargarme de esto por ti.',
        workflowId: decision.workflowId || null,
        executed: false,
        variables: decision.variables || {},
        executionPlan: null
      };
    }

    const executionMode = `${options.executionMode || 'browser'}`.trim().toLowerCase();
    const variables = decision.variables || {};

    if (executionMode === 'server') {
      await this.executor.executeById(decision.workflowId, variables);

      return {
        reply: decision.reply || 'Voy a encargarme de esto ahora mismo.',
        workflowId: decision.workflowId,
        executed: true,
        variables,
        executionPlan: null
      };
    }

    const executionPlan = await this.executor.getExecutionPlanById(decision.workflowId, variables);

    return {
      reply: decision.reply || 'Voy a encargarme de esto ahora mismo.',
      workflowId: decision.workflowId,
      executed: false,
      variables,
      executionPlan
    };
  }
}

module.exports = AgentChat;
