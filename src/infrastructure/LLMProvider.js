const axios = require('axios');

class LLMProvider {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.baseUrl = 'https://openrouter.ai/api/v1';
    this.model = 'nvidia/nemotron-3-nano-30b-a3b';
  }

  async chat(messages, responseFormat) {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is required for conversational LLM mode.');
    }

    const payload = {
      model: this.model,
      messages
    };

    if (responseFormat) {
      payload.response_format = responseFormat;
    }

    try {
      const response = await axios.post(`${this.baseUrl}/chat/completions`, payload, {
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }
      });

      return response.data.choices[0].message.content.trim();
    } catch (error) {
      const status = error.response?.status;
      const details = typeof error.response?.data === 'string'
        ? error.response.data
        : JSON.stringify(error.response?.data || {});
      throw new Error(`LLM request failed (${status || 'unknown'}): ${details}`);
    }
  }

  parseJsonObject(content) {
    try {
      return JSON.parse(content);
    } catch (error) {
      const fencedMatch = content.match(/```json\s*([\s\S]*?)```/i) || content.match(/```([\s\S]*?)```/);
      if (fencedMatch) {
        return JSON.parse(fencedMatch[1].trim());
      }
      throw new Error(`Could not parse LLM JSON response: ${content}`);
    }
  }

  async chatExpectingJson(messages, preferredResponseFormat) {
    try {
      return await this.chat(messages, preferredResponseFormat);
    } catch (error) {
      const message = `${error.message || ''}`;
      if (!preferredResponseFormat || !message.includes('response format is not supported')) {
        throw error;
      }

      return this.chat(messages);
    }
  }

  async translateToCypher(prompt, schema) {
    const content = await this.chat([
      { role: 'system', content: `Translate natural language to Neo4j Cypher. Schema: ${schema}. Return ONLY the Cypher query.` },
      { role: 'user', content: prompt }
    ]);
    return content.replace(/```cypher|```/g, '').trim();
  }

  fallbackWorkflowChoice(prompt, workflows) {
    const normalizedPrompt = prompt.toLowerCase();
    const match = workflows.find((workflow) =>
      `${workflow.id} ${workflow.description || workflow.desc || ''}`.toLowerCase().includes(normalizedPrompt)
    );
    return match ? match.id : workflows[0]?.id;
  }

  async getWorkflowAction(prompt, workflows) {
    if (!this.apiKey) {
      const fallback = this.fallbackWorkflowChoice(prompt, workflows);
      if (!fallback) throw new Error('No workflows are available to activate.');
      return fallback;
    }

    return this.chat([
      {
        role: 'system',
        content: `Based on the following workflows: ${JSON.stringify(workflows)}, identify which workflow the user wants to activate. Return ONLY the workflow ID.`
      },
      { role: 'user', content: prompt }
    ]);
  }

  fallbackAgentDecision(message, workflows) {
    const chosen = workflows.find((workflow) =>
      `${workflow.id} ${workflow.description} ${workflow.rawDescription || ''}`.toLowerCase().includes(message.toLowerCase())
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

  async decideWorkflowFromMessage(message, workflows, history = []) {
    if (!this.apiKey) {
      return this.fallbackAgentDecision(message, workflows);
    }

    const content = await this.chat([
      {
        role: 'system',
        content: [
          'You are the workflow activation assistant.',
          'Your job is to read the user request and the workflow catalog, then decide whether one workflow should be executed.',
          'Return JSON only with keys: reply, workflowId, variables, shouldExecute.',
          'reply: short assistant message to show the user.',
          'workflowId: exact workflow id or null.',
          'variables: object mapping variable names like input_2 to their values.',
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
              explanation: step.explanation,
              controlType: step.controlType,
              selectedValue: step.selectedValue,
              selectedLabel: step.selectedLabel,
              allowedOptions: step.allowedOptions
            }))
          }))
        })
      }
    ]);

    return this.parseJsonObject(content);
  }

  async chooseSelectValues(selects, context = {}) {
    if (!Array.isArray(selects) || selects.length === 0) {
      return [];
    }

    if (!this.apiKey) {
      return selects.map((select) => ({
        field: select.testid || select.id || select.name || 'select',
        value: select.options.find((option) => option.value)?.value || ''
      }));
    }

    const content = await this.chatExpectingJson([
      {
        role: 'system',
        content: [
          'You choose values for HTML select fields during browser workflow execution.',
          'Return JSON only.',
          'The JSON must be an array of objects with keys: field and value.',
          'field must match the provided field identifier exactly.',
          'value must be exactly one of that field allowed option values.',
          'Use the field label and option labels to infer the best value semantically.',
          'Prefer choices that make the workflow coherent and clinically plausible.',
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
    ], { type: 'json_object' });

    const parsed = this.parseJsonObject(content);
    const rawChoices = Array.isArray(parsed) ? parsed : parsed.choices;
    if (!Array.isArray(rawChoices)) {
      throw new Error(`Could not parse select choices from LLM response: ${content}`);
    }

    return rawChoices;
  }

  async summarizeWorkflow(description, steps) {
    if (!this.apiKey) {
      const firstActions = steps
        .slice(0, 3)
        .map((step) => `${step.actionType} ${step.selector || step.url || ''}`.trim())
        .join(', ');
      return `${description}. Steps: ${firstActions || 'No recorded steps.'}`;
    }

    return this.chat([
      {
        role: 'system',
        content: 'Summarize a user navigation workflow for a technical log. Use the initial description and the steps provided. Keep it concise but clear.'
      },
      { role: 'user', content: `Initial Description: ${description}\nSteps: ${JSON.stringify(steps)}` }
    ]);
  }
}

module.exports = LLMProvider;
