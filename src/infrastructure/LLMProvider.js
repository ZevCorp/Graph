const axios = require('axios');

class LLMProvider {
  constructor() {
    this.openRouterApiKey = (process.env.OPENROUTER_API_KEY || '').trim();
    this.openAiApiKey = (process.env.OPENAI_API_KEY || '').trim();
    this.provider = this.openRouterApiKey ? 'openrouter' : (this.openAiApiKey ? 'openai' : null);
    this.apiKey = this.provider === 'openrouter' ? this.openRouterApiKey : this.openAiApiKey;
    this.baseUrl = this.provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1'
      : 'https://api.openai.com/v1';
    this.model = this.provider === 'openrouter'
      ? (process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free')
      : (process.env.OPENAI_MODEL || 'gpt-4o');
  }

  hasApiKey() {
    return Boolean(this.apiKey);
  }

  getHeaders() {
    if (!this.hasApiKey()) {
      throw new Error('No LLM API key is configured');
    }

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };

    if (this.provider === 'openrouter') {
      headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL || 'http://localhost:3000';
      headers['X-Title'] = process.env.OPENROUTER_APP_NAME || 'Graph Workflow Trainer';
    }

    return headers;
  }

  async postChatCompletions(payload) {
    try {
      const response = await axios.post(`${this.baseUrl}/chat/completions`, payload, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const details = typeof error.response?.data === 'string'
        ? error.response.data
        : JSON.stringify(error.response?.data || {});
      throw new Error(`LLM request failed (${status || 'unknown'}): ${details}`);
    }
  }

  async translateToCypher(prompt, schema) {
    const content = await this.chat([
      { role: 'system', content: `Translate natural language to Neo4j Cypher. Schema: ${schema}. Return ONLY the Cypher query.` },
      { role: 'user', content: prompt }
    ]);

    return content.replace(/```cypher|```/gi, '').trim();
  }

  async chat(messages, options = {}) {
    const data = await this.postChatCompletions({
      model: options.model || this.model,
      messages
    });

    return data.choices?.[0]?.message?.content?.trim() || '';
  }

  async chatExpectingJson(messages, responseFormat = { type: 'json_object' }, options = {}) {
    try {
      const data = await this.postChatCompletions({
        model: options.model || this.model,
        messages,
        response_format: responseFormat
      });

      return data.choices?.[0]?.message?.content?.trim() || '{}';
    } catch (error) {
      const message = `${error.message || ''}`;
      const formatUnsupported =
        message.includes('response format is not supported')
        || message.includes('response_format')
        || message.includes('Invalid request');

      if (!responseFormat || !formatUnsupported) {
        throw error;
      }

      return this.chat(messages, options);
    }
  }

  parseJsonObject(content) {
    if (typeof content !== 'string') {
      throw new Error('LLM content must be a string');
    }

    const cleaned = content
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    if (!cleaned) {
      throw new Error('LLM returned empty content');
    }

    try {
      return JSON.parse(cleaned);
    } catch (error) {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      }
      throw new Error(`Could not parse LLM JSON response: ${cleaned}`);
    }
  }
}

module.exports = LLMProvider;
