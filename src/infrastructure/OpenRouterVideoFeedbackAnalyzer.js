const axios = require('axios');

const DEFAULT_MODEL = 'google/gemini-3.5-flash';
const DEFAULT_REFERER = 'http://localhost:3000';
const DEFAULT_TITLE = 'Graph Video Feedback Prompts';

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

    const requestBody = this.buildPrimaryRequestBody({
      videoDataUrl,
      mimeType,
      pageContext,
      durationMs
    });

    let data;
    try {
      data = await this.postChatCompletions(requestBody);
    } catch (error) {
      const message = `${error.message || ''}`;
      const invalidArgument =
        message.includes('INVALID_ARGUMENT')
        || message.includes('invalid argument')
        || message.includes('Provider returned error');

      if (!invalidArgument) {
        throw error;
      }

      data = await this.postChatCompletions(this.buildRetryRequestBody({
        videoDataUrl,
        mimeType,
        pageContext,
        durationMs
      }));
    }

    const content = data?.choices?.[0]?.message?.content?.trim() || '';
    const parsed = this.parseJsonObject(content);

    return {
      actionablePrompts: Array.isArray(parsed.actionablePrompts) ? parsed.actionablePrompts : [],
      futureIdeas: Array.isArray(parsed.futureIdeas) ? parsed.futureIdeas : []
    };
  }

  buildPrimaryRequestBody({ videoDataUrl, mimeType, pageContext, durationMs }) {
    return {
      model: this.model,
      provider: {
        only: ['google-vertex'],
        allow_fallbacks: false
      },
      plugins: [
        { id: 'response-healing' }
      ],
      stream: false,
      messages: [
        {
          role: 'system',
          content: [
            'You analyze short screen-recording videos where a person narrates requested software changes while moving the mouse cursor over a webpage or web app.',
            'Your job is to convert that narrated feedback into implementation-ready Codex prompts.',
            'Prioritize explicit user requests. Use the cursor position, visible labels, section names, and spoken references to infer exactly what UI area the person means.',
            'If the speaker references visible text, preserve that text inside the result whenever possible so the engineer can quickly locate the target.',
            'Each actionable change must become its own standalone prompt for Codex.',
            'Each prompt must be optimized for a coding agent working inside an existing repository. It should ask for a concrete implementation, preserve surrounding behavior, and avoid broad rewrites.',
            'Treat this as software development feedback only.',
            'If a request is ambiguous, aspirational, or clearly about a future capability rather than a concrete change to implement now, place it in futureIdeas instead of actionablePrompts.',
            'Return a JSON object with exactly these top-level keys: actionablePrompts, futureIdeas.',
            'Each actionablePrompts item must contain: title, prompt, userIntentSummary, pageLocationHint.',
            'Each futureIdeas item must contain: idea, context.',
            'Do not output markdown fences.'
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                'Analyze this screen recording and generate JSON.',
                `Page context: ${this.serializePageContext(pageContext)}.`,
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
            },
            {
              type: 'video_url',
              videoUrl: {
                url: videoDataUrl
              }
            }
          ]
        }
      ],
      response_format: {
        type: 'json_object'
      }
    };
  }

  buildRetryRequestBody({ videoDataUrl, mimeType, pageContext, durationMs }) {
    return {
      model: this.model,
      provider: {
        only: ['google-vertex'],
        allow_fallbacks: false
      },
      stream: false,
      messages: [
        {
          role: 'system',
          content: 'Return valid JSON only. Extract explicit software change requests from the video into actionablePrompts and ambiguous future-facing requests into futureIdeas.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                'Return a JSON object with keys actionablePrompts and futureIdeas.',
                'actionablePrompts items: title, prompt, userIntentSummary, pageLocationHint.',
                'futureIdeas items: idea, context.',
                `Context: ${this.serializePageContext(pageContext)}.`,
                `Mime type: ${mimeType || 'unknown'}.`,
                `Duration ms: ${Number.isFinite(durationMs) ? durationMs : 0}.`
              ].join('\n')
            },
            {
              type: 'video_url',
              videoUrl: {
                url: videoDataUrl
              }
            }
          ]
        }
      ]
    };
  }

  serializePageContext(pageContext) {
    const sourcePathname = `${pageContext?.sourcePathname || ''}`.trim();
    const sourceTitle = `${pageContext?.sourceTitle || ''}`.trim();
    const appId = `${pageContext?.appId || ''}`.trim();
    const sourceOrigin = `${pageContext?.sourceOrigin || ''}`.trim();

    return JSON.stringify({
      appId,
      sourceOrigin,
      sourcePathname,
      sourceTitle
    });
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
