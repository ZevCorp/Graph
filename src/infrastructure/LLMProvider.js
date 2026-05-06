const axios = require('axios');

class LLMProvider {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.baseUrl = 'https://openrouter.ai/api/v1';
    this.model = 'nvidia/nemotron-3-nano-30b-a3b'; // Nemotron 3 Omni Nano
  }

  async translateToCypher(prompt, schema) {
    const response = await axios.post(`${this.baseUrl}/chat/completions`, {
      model: this.model,
      messages: [
        { role: 'system', content: `Translate natural language to Neo4j Cypher. Schema: ${schema}. Return ONLY the Cypher query.` },
        { role: 'user', content: prompt }
      ]
    }, {
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }
    });
    return response.data.choices[0].message.content.replace(/```cypher|```/g, '').trim();
  }

  async getWorkflowAction(prompt, workflows) {
    const response = await axios.post(`${this.baseUrl}/chat/completions`, {
      model: this.model,
      messages: [
        { role: 'system', content: `Based on the following workflows: ${JSON.stringify(workflows)}, identify which workflow the user wants to activate. Return ONLY the workflow ID.` },
        { role: 'user', content: prompt }
      ]
    }, {
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }
    });
    return response.data.choices[0].message.content.trim();
  }
}

module.exports = LLMProvider;
