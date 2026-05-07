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
              explanation: step.explanation
            }))
          }))
        })
      }
    ]);

    return this.parseJsonObject(content);
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
