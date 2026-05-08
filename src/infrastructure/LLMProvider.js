const axios = require('axios');

class LLMProvider {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.baseUrl = 'https://openrouter.ai/api/v1';
    this.model = 'nvidia/nemotron-3-nano-30b-a3b';
  }

  hasApiKey() {
    return Boolean(this.apiKey);
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
}

module.exports = LLMProvider;
