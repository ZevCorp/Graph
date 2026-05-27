const axios = require('axios');

const DEFAULT_MODEL = 'google/gemini-3.5-flash';
const DEFAULT_REFERER = 'http://localhost:3000';
const DEFAULT_TITLE = 'Graph Video Feedback Prompts';

const RESPONSE_SCHEMA = {
  name: 'video_feedback_prompt_result',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['actionablePrompts', 'futureIdeas'],
    properties: {
      actionablePrompts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'prompt', 'userIntentSummary', 'pageLocationHint'],
          properties: {
            title: { type: 'string' },
            prompt: { type: 'string' },
            userIntentSummary: { type: 'string' },
            pageLocationHint: { type: 'string' }
          }
        }
      },
      futureIdeas: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['idea', 'context'],
          properties: {
            idea: { type: 'string' },
            context: { type: 'string' }
          }
        }
      }
    }
  }
};

class OpenRouterVideoFeedbackAnalyzer {
  constructor(options = {}) {
    this.apiKey = `${options.apiKey || process.env.OPENROUTER_API_KEY || ''}`.trim();
    this.baseUrl = `${options.baseUrl || 'https://openrouter.ai/api/v1'}`.replace(/\/+$/, '');
    this.model = `${options.model || process.env.OPENROUTER_VIDEO_FEEDBACK_MODEL || DEFAULT_MODEL}`.trim() || DEFAULT_MODEL;
    this.referer = `${options.referer || process.env.OPENROUTER_SITE_URL || DEFAULT_REFERER}`.trim() || DEFAULT_REFERER;
    this.title = `${options.title || process.env.OPENROUTER_APP_NAME || DEFAULT_TITLE}`.trim() || DEFAULT_TITLE;
  }

  hasApiKey() {
    return Boolean(this.apiKey);
  }

  async analyzeVideo({ videoDataUrl, mimeType, pageContext, durationMs }) {
    if (!this.hasApiKey()) {
      throw new Error('OPENROUTER_API_KEY is not configured on the server.');
    }

    if (!videoDataUrl || typeof videoDataUrl !== 'string' || !videoDataUrl.startsWith('data:video/')) {
      throw new Error('A valid video data URL is required.');
    }

    const requestBody = {
      model: this.model,
      provider: {
        order: ['google-vertex'],
        allow_fallbacks: false
      },
      messages: [
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: [
                'You analyze short screen-recording videos where a person narrates requested software changes while moving the mouse cursor over a webpage or web app.',
                'Your job is to convert that narrated feedback into implementation-ready Codex prompts.',
                'Prioritize explicit user requests. Use the cursor position, visible labels, section names, and spoken references to infer exactly what UI area the person means.',
                'If the speaker references visible text, preserve that text inside the result whenever possible so the engineer can quickly locate the target.',
                'Each actionable change must become its own standalone prompt for Codex.',
                'Each prompt must be optimized for a coding agent working inside an existing repository. It should ask for a concrete implementation, preserve surrounding behavior, and avoid broad rewrites.',
                'Treat this as software development feedback only.',
                'If a request is ambiguous, aspirational, or clearly about a future capability rather than a concrete change to implement now, place it in futureIdeas instead of actionablePrompts.',
                'Do not output markdown. Return only JSON that matches the requested schema.'
              ].join(' ')
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'video_url',
              video_url: {
                url: videoDataUrl
              }
            },
            {
              type: 'text',
              text: [
                'Analyze this screen recording and generate JSON.',
                `Page context: ${JSON.stringify(pageContext || {})}.`,
                `Recorded video mime type: ${mimeType || 'unknown'}.`,
                `Approximate duration in milliseconds: ${Number.isFinite(durationMs) ? durationMs : 0}.`,
                'For each actionable prompt:',
                '- give it a short title',
                '- summarize the user intent',
                '- include a strong location hint for the page area involved',
                '- write a production-ready Codex prompt in Spanish',
                '- make the prompt specific about the visible UI target, copy, interaction, or transition the user wants',
                '- ask Codex to preserve the rest of the page and existing behavior unless the request requires otherwise',
                'For futureIdeas, keep them concise and separate.'
              ].join('\n')
            }
          ]
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: RESPONSE_SCHEMA
      }
    };

    const data = await this.postChatCompletions(requestBody).catch(async (error) => {
      const message = `${error.message || ''}`;
      const structuredOutputUnsupported =
        message.includes('response_format')
        || message.includes('json_schema')
        || message.includes('structured');

      if (!structuredOutputUnsupported) {
        throw error;
      }

      return this.postChatCompletions({
        ...requestBody,
        response_format: { type: 'json_object' }
      });
    });
    const content = data?.choices?.[0]?.message?.content?.trim() || '';
    const parsed = this.parseJsonObject(content);

    return {
      actionablePrompts: Array.isArray(parsed.actionablePrompts) ? parsed.actionablePrompts : [],
      futureIdeas: Array.isArray(parsed.futureIdeas) ? parsed.futureIdeas : []
    };
  }

  async postChatCompletions(payload) {
    try {
      const response = await axios.post(`${this.baseUrl}/chat/completions`, payload, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.referer,
          'X-Title': this.title
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const details = typeof error.response?.data === 'string'
        ? error.response.data
        : JSON.stringify(error.response?.data || {});
      throw new Error(`OpenRouter video analysis failed (${status || 'unknown'}): ${details}`);
    }
  }

  parseJsonObject(content) {
    const cleaned = `${content || ''}`
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    if (!cleaned) {
      throw new Error('OpenRouter returned empty content for video analysis.');
    }

    try {
      return JSON.parse(cleaned);
    } catch (error) {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      }
      throw new Error(`Could not parse video analysis JSON: ${cleaned}`);
    }
  }
}

module.exports = OpenRouterVideoFeedbackAnalyzer;
