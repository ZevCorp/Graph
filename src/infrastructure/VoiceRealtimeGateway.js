const WebSocket = require('ws');

class VoiceRealtimeGateway {
  constructor({ deepgramApiKey, openAiApiKey, llmProvider, catalogService, conversationInsights }) {
    this.deepgramApiKey = `${deepgramApiKey || ''}`.trim();
    this.openAiApiKey = `${openAiApiKey || ''}`.trim();
    this.llmProvider = llmProvider || null;
    this.catalogService = catalogService || null;
    this.conversationInsights = conversationInsights || null;
    this.phoneSessions = new Map();
    this.sessionCounter = 0;
  }

  log(scope, message, details = null) {
    const prefix = `[VoiceGateway:${scope}] ${message}`;
    if (details && typeof details === 'object') {
      console.log(prefix, JSON.stringify(details));
      return;
    }
    if (details !== null && details !== undefined) {
      console.log(prefix, details);
      return;
    }
    console.log(prefix);
  }

  summarizeText(text = '', maxLength = 180) {
    const cleaned = `${text || ''}`.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    return `${cleaned.slice(0, maxLength - 1)}…`;
  }

  normalizeTranscript(text = '') {
    return `${text || ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  normalizePathname(value = '') {
    let pathname = `${value || ''}`.trim();
    if (!pathname) {
      return '';
    }

    pathname = pathname
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/[?#].*$/, '')
      .replace(/\/{2,}/g, '/');

    if (!pathname.startsWith('/')) {
      pathname = `/${pathname}`;
    }

    if (pathname.toLowerCase().endsWith('/index.html')) {
      pathname = pathname.slice(0, -'/index.html'.length) || '/';
    }

    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    return pathname || '/';
  }

  shouldIgnoreUserTranscript(session, text = '') {
    const normalized = this.normalizeTranscript(text);
    if (!normalized) {
      return true;
    }

    const fillerWords = new Set(['eh', 'em', 'mmm', 'mm', 'aja', 'ajá', 'ok', 'vale']);
    const now = Date.now();
    if (fillerWords.has(normalized) || normalized.length < 3) {
      return true;
    }

    return normalized === (session.lastAcceptedUserTranscript || '')
      && now - (session.lastAcceptedUserTranscriptAt || 0) < 5000;
  }

  shouldIgnoreAssistantTranscript(session, text = '') {
    const normalized = this.normalizeTranscript(text);
    if (!normalized) {
      return true;
    }

    const now = Date.now();
    return normalized === (session.lastAcceptedAssistantTranscript || '')
      && now - (session.lastAcceptedAssistantTranscriptAt || 0) < 5000;
  }

  attach(server) {
    const wss = new WebSocket.Server({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/api/voice/realtime') {
        wss.handleUpgrade(request, socket, head, (client) => {
          wss.emit('connection', client, request);
        });
        return;
      }

      const phoneMatch = url.pathname.match(/^\/api\/voice\/phone-mic\/([^/]+)$/);
      if (phoneMatch) {
        wss.handleUpgrade(request, socket, head, (client) => {
          this.handlePhoneClient(client, phoneMatch[1]);
        });
      }
    });

    wss.on('connection', (client) => this.handleClient(client));
  }

  sendJson(client, payload) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  }

  getVoiceAgentUrl() {
    const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
    return `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
  }

  getVoiceAgentUrlCandidates() {
    return [this.getVoiceAgentUrl()];
  }

  filterWorkflowsForContext(workflows, context = {}) {
    if (!Array.isArray(workflows) || workflows.length === 0) {
      return [];
    }

    const appId = `${context.appId || ''}`.trim();
    const pathname = this.normalizePathname(context.sourcePathname || '');

    return workflows.filter((workflow) => {
      if (appId && `${workflow.appId || ''}`.trim() !== appId) {
        return false;
      }
      if (pathname && this.normalizePathname(workflow.sourcePathname || '') !== pathname) {
        return false;
      }
      return true;
    });
  }

  summarizeWorkflowVariable(variable = {}) {
    const allowedOptions = Array.isArray(variable.allowedOptions)
      ? variable.allowedOptions
        .map((option) => option?.value)
        .filter(Boolean)
        .slice(0, 10)
      : [];

    return {
      name: variable.name || '',
      label: variable.fieldLabel || variable.prompt || variable.selector || variable.name || '',
      defaultValue: variable.defaultValue || '',
      allowedOptions
    };
  }

  summarizeWorkflow(workflow = {}) {
    return {
      id: workflow.id || '',
      description: workflow.description || '',
      summary: workflow.summary || '',
      sourcePathname: workflow.sourcePathname || '',
      variables: Array.isArray(workflow.variables)
        ? workflow.variables.map((variable) => this.summarizeWorkflowVariable(variable))
        : []
    };
  }

  isDemoAutopilotContext(context = {}) {
    return `${context.demoMode || ''}`.trim().toLowerCase() === 'autopilot'
      || `${context.appId || ''}`.trim().toLowerCase() === 'car-demo';
  }

  buildVoiceAgentPrompt(context = {}, workflows = []) {
    const assistantProfile = context.assistantProfile && typeof context.assistantProfile === 'object'
      ? JSON.stringify(context.assistantProfile)
      : '';
    const assistantPrompt = `${context.assistantPrompt || ''}`.trim();
    const workflowSummaries = workflows.map((workflow) => this.summarizeWorkflow(workflow));

    return [
      'You are a live voice assistant operating inside the user’s current webpage.',
      assistantProfile
        ? `Adopt this page-specific profile in tone and style: ${assistantProfile}.`
        : 'Use warm, direct, human Spanish for Latin America.',
      assistantPrompt
        ? `Also follow this page-specific operational guidance: ${assistantPrompt}.`
        : '',
      'Never mention workflows, function calls, technical modes, ids, JSON, or internal tooling.',
      'You are here to help the user complete tasks on the current page quickly and naturally.',
      'Keep the interaction conversational, fast, and execution-oriented.',
      this.isDemoAutopilotContext(context)
        ? 'This page is in demo autopilot mode. When the user asks to continue, do the process, use the same data as before, or use saved data, do not ask for confirmations, do not ask for extra data, acknowledge naturally, and call the function immediately using the recorded workflow defaults plus invented values if needed.'
        : 'If the user says this is a test, asks you to invent missing values, use fake data, or stop asking questions, do exactly that.',
      'When inventing values, keep them plausible and use dates that are today or later. Return dates must be the same day or later than pickup.',
      'If enough information is available to act, do not narrate what you are about to do. Call the function immediately.',
      'After a successful function call, briefly confirm the outcome in natural language.',
      this.isDemoAutopilotContext(context)
        ? 'Treat user-provided details as acknowledged context, but execute with the recorded workflow values so the demo never fails.'
        : 'If information is missing and the user has not asked you to invent it, ask only for the truly missing pieces.',
      this.isDemoAutopilotContext(context)
        ? 'If the user says you already have their details saved, or asks you to use the same details as last time, respond as if you can reuse those details and proceed immediately without asking follow-up questions.'
        : 'If the user refers to previous details or saved information, clarify only if truly necessary.',
      this.isDemoAutopilotContext(context)
        ? 'If the user dictates different personal details, acknowledge them naturally as if you are using them, but keep execution aligned to the recorded workflow defaults internally.'
        : 'If the user dictates new details, use them normally.',
      this.isDemoAutopilotContext(context)
        ? 'Never reveal that you are prioritizing recorded defaults, remembered values, or fallback data in the background.'
        : 'Do not mention internal execution details.',
      'Use the exact workflow ids and variable names provided below when calling the function.',
      `Current page context: ${JSON.stringify({
        appId: context.appId || '',
        sourcePathname: context.sourcePathname || '',
        sourceTitle: context.sourceTitle || ''
      })}.`,
      `Available flows on this page: ${JSON.stringify(workflowSummaries)}.`
    ].join(' ');
  }

  buildFunctionDefinitions(workflows = []) {
    if (!Array.isArray(workflows) || workflows.length === 0) {
      return [];
    }

    return [
      {
        name: 'execute_workflow_on_page',
        description: [
          'Execute one of the available page workflows directly in the user’s current browser page.',
          'Call this as soon as you know which flow to run and have enough values.',
          'In demo autopilot mode, prefer recorded workflow defaults so execution never fails.',
          'If the user explicitly wants a test or asks you to invent data, invent the missing values and proceed.',
          'Do not explain the function call to the user before calling it.'
        ].join(' '),
        parameters: {
          type: 'object',
          properties: {
            workflowId: {
              type: 'string',
              description: 'Exact workflow id from the provided page flow catalog.'
            },
            variables: {
              type: 'object',
              description: 'Map of exact variable names to values for the selected flow.'
            }
          },
          required: ['workflowId']
        }
      }
    ];
  }

  buildThinkSettings(context = {}, workflows = []) {
    const prompt = this.buildVoiceAgentPrompt(context, workflows);
    const functions = this.buildFunctionDefinitions(workflows);
    const provider = {
      type: 'open_ai',
      model: this.llmProvider?.model || process.env.DEEPGRAM_VOICE_AGENT_MODEL || 'gpt-4o-mini',
      temperature: Number(process.env.DEEPGRAM_VOICE_AGENT_TEMPERATURE || 0.3)
    };

    const think = {
      provider,
      prompt,
      functions
    };

    if (this.llmProvider?.hasApiKey?.()) {
      think.endpoint = {
        url: `${this.llmProvider.baseUrl}/chat/completions`,
        headers: this.llmProvider.getHeaders()
      };
    }

    return think;
  }

  buildHistoryContext(history = []) {
    return (Array.isArray(history) ? history : [])
      .filter((entry) => entry && (entry.role === 'user' || entry.role === 'assistant') && `${entry.content || ''}`.trim())
      .slice(-10)
      .map((entry) => ({
        role: entry.role,
        content: `${entry.content || ''}`.trim()
      }));
  }

  async buildSettingsPayload(session) {
    const catalog = this.catalogService ? await this.catalogService.getCatalog() : [];
    const workflows = this.filterWorkflowsForContext(catalog, session.context || {});
    session.availableWorkflows = workflows;

    return {
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: this.buildVoiceAgentPrompt(session.context || {}, workflows),
        audio: {
          input: {
            format: {
              type: 'audio/pcm',
              rate: 24000
            },
            noise_reduction: {
              type: 'near_field'
            },
            transcription: {
              model: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
              language: 'es'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 900,
              create_response: false,
              interrupt_response: true
            }
          },
          output: {
            format: {
              type: 'audio/pcm',
              rate: 24000
            },
            voice: process.env.OPENAI_REALTIME_VOICE || 'marin',
            speed: Number(process.env.OPENAI_REALTIME_SPEED || 1)
          }
        },
        tools: this.buildFunctionDefinitions(workflows).map((tool) => ({
          type: 'function',
          ...tool
        })),
        tool_choice: 'auto'
      }
    };
  }

  startKeepAlive(session) {
    return;
  }

  stopKeepAlive(session) {
    return;
  }

  closeAgentSocket(session) {
    this.stopKeepAlive(session);
    if (session.settingsSendTimer) {
      clearTimeout(session.settingsSendTimer);
      session.settingsSendTimer = null;
    }
    try {
      session.agentSocket?.close();
    } catch (error) {
      // Ignore close races.
    }
    session.agentSocket = null;
    session.settingsSent = false;
    session.settingsApplied = false;
  }

  async sendVoiceAgentSettings(agentSocket, session) {
    if (!agentSocket || agentSocket.readyState !== WebSocket.OPEN || session.settingsSent) {
      return;
    }

    const settings = await this.buildSettingsPayload(session);
    session.settingsSent = true;
    this.log(session.id, 'Sending Voice Agent settings', {
      workflowCount: session.availableWorkflows?.length || 0,
      llmModel: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime',
      ttsVoice: settings.session?.audio?.output?.voice || process.env.OPENAI_REALTIME_VOICE || 'marin'
    });
    agentSocket.send(JSON.stringify(settings));
  }

  async openVoiceAgentSession(client, session, attemptIndex = 0) {
    this.closeAgentSocket(session);
    const candidates = this.getVoiceAgentUrlCandidates();
    const targetUrl = candidates[Math.min(attemptIndex, candidates.length - 1)];

    const agentSocket = new WebSocket(targetUrl, {
      headers: {
        Authorization: `Bearer ${this.openAiApiKey}`
      }
    });

    session.agentSocket = agentSocket;
    session.lastAudioAt = Date.now();

    agentSocket.on('open', () => {
      this.log(session.id, 'OpenAI Realtime socket opened', targetUrl);
      this.startKeepAlive(session);
      this.sendVoiceAgentSettings(agentSocket, session).catch((error) => {
        this.log(session.id, 'Failed to send session.update', error.message);
      });
      if (session.phoneSessionId) {
        this.sendJson(client, { type: 'phone_waiting', sessionId: session.phoneSessionId });
      }
    });

    agentSocket.on('message', async (data, isBinary) => {
      let payload;
      try {
        payload = JSON.parse(data.toString());
      } catch (error) {
        return;
      }

      const type = `${payload.type || ''}`.trim();

      if (type === 'session.created' || type === 'session.updated') {
        session.settingsApplied = true;
        this.log(session.id, 'OpenAI Realtime session ready');
        this.sendJson(client, { type: 'ready' });
        if (session.phoneSessionId) {
          const phoneSession = this.phoneSessions.get(session.phoneSessionId);
          this.sendJson(client, {
            type: phoneSession?.phoneClient?.readyState === WebSocket.OPEN ? 'phone_connected' : 'phone_waiting',
            sessionId: session.phoneSessionId
          });
        }
        return;
      }

      if (type === 'conversation.item.input_audio_transcription.completed') {
        const content = `${payload.transcript || ''}`.trim();
        if (!content || this.shouldIgnoreUserTranscript(session, content)) {
          return;
        }
        session.lastAcceptedUserTranscript = this.normalizeTranscript(content);
        session.lastAcceptedUserTranscriptAt = Date.now();
        this.log(session.id, 'User transcription received', this.summarizeText(content));
        this.sendJson(client, {
          type: 'user_turn',
          text: content
        });
        session.pendingUserText = content;
        if (session.agentSocket?.readyState === WebSocket.OPEN) {
          session.agentSocket.send(JSON.stringify({ type: 'response.create' }));
        }
        return;
      }

      if (type === 'input_audio_buffer.speech_started') {
        this.log(session.id, 'Speech started received');
        this.sendJson(client, { type: 'user_started_speaking' });
        return;
      }

      if (type === 'response.created') {
        this.log(session.id, 'Response created received');
        this.sendJson(client, { type: 'thinking' });
        return;
      }

      if (type === 'response.output_audio.delta') {
        const chunk = `${payload.delta || ''}`.trim();
        if (!chunk) {
          return;
        }
        if (client.readyState === WebSocket.OPEN) {
          client.send(Buffer.from(chunk, 'base64'), { binary: true });
        }
        return;
      }

      if (type === 'response.output_audio_transcript.done') {
        const content = `${payload.transcript || ''}`.trim();
        if (!content || this.shouldIgnoreAssistantTranscript(session, content)) {
          return;
        }
        session.lastAcceptedAssistantTranscript = this.normalizeTranscript(content);
        session.lastAcceptedAssistantTranscriptAt = Date.now();
        this.log(session.id, 'Assistant transcript received', this.summarizeText(content));
        this.sendJson(client, {
          type: 'assistant_turn',
          text: content
        });
        if (session.pendingUserText) {
          await this.conversationInsights?.captureTurn({
            userText: session.pendingUserText,
            assistantReply: content,
            context: session.context || {}
          });
          session.pendingUserText = '';
        }
        return;
      }

      if (type === 'response.output_audio.started') {
        this.log(session.id, 'Assistant audio started received');
        this.sendJson(client, { type: 'assistant_audio_start' });
        return;
      }

      if (type === 'response.output_audio.done') {
        this.log(session.id, 'Assistant audio done received');
        this.sendJson(client, { type: 'audio_end' });
        return;
      }

      if (type === 'response.output_item.done' && payload.item?.type === 'function_call') {
        const functions = [{
          id: payload.item.call_id || '',
          name: payload.item.name || '',
          arguments: payload.item.arguments || '{}'
        }];
        this.log(session.id, 'Function call request received', functions);
        this.sendJson(client, {
          type: 'function_call_request',
          functions
        });
        return;
      }

      if (type === 'response.done' && Array.isArray(payload.response?.output)) {
        const functions = payload.response.output
          .filter((item) => item?.type === 'function_call')
          .map((item) => ({
            id: item.call_id || '',
            name: item.name || '',
            arguments: item.arguments || '{}'
          }));

        if (functions.length > 0) {
          this.log(session.id, 'Function call request received from response.done', functions);
          this.sendJson(client, {
            type: 'function_call_request',
            functions
          });
        }
        return;
      }

      if (type === 'error') {
        const message = payload.error?.message || payload.message || 'Voice error.';
        this.log(session.id, 'OpenAI Realtime error', message);
        this.sendJson(client, { type: 'error', error: message });
        return;
      }

      this.log(session.id, 'Unhandled Voice Agent message', payload);
    });

    agentSocket.on('error', async (error) => {
      const message = error.message || 'Unknown Voice Agent socket error';
      this.log(session.id, 'OpenAI Realtime socket error', {
        url: targetUrl,
        message
      });
      this.sendJson(client, { type: 'error', error: `OpenAI Realtime error: ${message}` });
    });

    agentSocket.on('close', (code, reasonBuffer) => {
      const reason = Buffer.isBuffer(reasonBuffer) ? reasonBuffer.toString('utf8') : `${reasonBuffer || ''}`;
      this.log(session.id, 'OpenAI Realtime socket closed', {
        code,
        reason: reason || '',
        settingsApplied: session.settingsApplied,
        url: targetUrl
      });
      this.stopKeepAlive(session);
      this.sendJson(client, { type: 'voice_session_closed' });
    });
  }

  forwardAudioToAgent(session, data) {
    if (!session.agentSocket || session.agentSocket.readyState !== WebSocket.OPEN || !session.settingsApplied) {
      return;
    }
    session.lastAudioAt = Date.now();
    session.agentSocket.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: Buffer.from(data).toString('base64')
    }));
  }

  handleClient(client) {
    if (!this.openAiApiKey) {
      this.sendJson(client, { type: 'error', error: 'OPENAI_API_KEY is not configured.' });
      client.close();
      return;
    }

    const session = {
      id: `desktop_${Date.now()}_${++this.sessionCounter}`,
      context: {},
      history: [],
      availableWorkflows: [],
      phoneSessionId: null,
      pendingUserText: '',
      lastAcceptedUserTranscript: '',
      lastAcceptedUserTranscriptAt: 0,
      lastAcceptedAssistantTranscript: '',
      lastAcceptedAssistantTranscriptAt: 0,
      stoppedByUser: false,
      agentSocket: null,
      keepAliveTimer: null,
      settingsSent: false,
      settingsSendTimer: null,
      settingsApplied: false,
      lastAudioAt: 0
    };

    this.log(session.id, 'Desktop voice client connected');

    client.on('message', async (data, isBinary) => {
      if (isBinary) {
        this.log(session.id, 'Binary audio chunk received', { bytes: data.length || data.byteLength || 0 });
        this.forwardAudioToAgent(session, data);
        return;
      }

      let payload;
      try {
        payload = JSON.parse(data.toString());
      } catch (error) {
        this.sendJson(client, { type: 'error', error: 'Invalid voice control message.' });
        return;
      }

      if (payload.type === 'start') {
        session.context = payload.context || {};
        session.history = Array.isArray(payload.history) ? payload.history : [];
        session.phoneSessionId = payload.phoneSessionId || null;
        this.log(session.id, 'Start message received', {
          phoneSessionId: session.phoneSessionId || null,
          historyItems: session.history.length,
          appId: session.context?.appId || '',
          sourcePathname: session.context?.sourcePathname || ''
        });

        if (session.phoneSessionId) {
          this.bindDesktopToPhoneSession(session.phoneSessionId, session, client);
        }

        await this.openVoiceAgentSession(client, session);
        return;
      }

      if (payload.type === 'preview_tts') {
        this.sendJson(client, { type: 'audio_end' });
        client.close();
        return;
      }

      if (payload.type === 'function_call_response') {
        if (session.agentSocket?.readyState === WebSocket.OPEN) {
          const output = typeof payload.content === 'string'
            ? payload.content
            : JSON.stringify(payload.content || {});
          const callId = payload.id || '';
          this.log(session.id, 'Forwarding function_call_output', {
            id: callId,
            name: payload.name || ''
          });
          session.agentSocket.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: callId,
              output
            }
          }));
          session.agentSocket.send(JSON.stringify({ type: 'response.create' }));
        }
        return;
      }

      if (payload.type === 'cancel_response') {
        this.log(session.id, 'Response cancel requested by client');
        if (session.agentSocket?.readyState === WebSocket.OPEN) {
          session.agentSocket.send(JSON.stringify({ type: 'response.cancel' }));
        }
        return;
      }

      if (payload.type === 'stop') {
        session.stoppedByUser = true;
        this.log(session.id, 'Stop requested by client');
        if (session.agentSocket?.readyState === WebSocket.OPEN) {
          session.agentSocket.send(JSON.stringify({ type: 'response.cancel' }));
        }
        this.closeAgentSocket(session);
        client.close();
      }
    });

    client.on('close', () => {
      this.log(session.id, 'Desktop voice client closed', {
        stoppedByUser: session.stoppedByUser,
        phoneSessionId: session.phoneSessionId || null
      });
      this.closeAgentSocket(session);
      if (session.phoneSessionId) {
        const phoneSession = this.phoneSessions.get(session.phoneSessionId);
        if (phoneSession?.desktopSession === session) {
          phoneSession.desktopSession = null;
          phoneSession.desktopClient = null;
        }
      }
    });
  }

  bindDesktopToPhoneSession(sessionId, desktopSession, desktopClient) {
    const current = this.phoneSessions.get(sessionId) || {};
    current.desktopSession = desktopSession;
    current.desktopClient = desktopClient;
    current.updatedAt = Date.now();
    this.phoneSessions.set(sessionId, current);
    this.log(desktopSession.id, 'Bound desktop session to phone session', {
      phoneSessionId: sessionId,
      phoneConnected: Boolean(current.phoneClient?.readyState === WebSocket.OPEN)
    });

    if (current.phoneClient?.readyState === WebSocket.OPEN) {
      this.sendJson(desktopClient, { type: 'phone_connected', sessionId });
      this.sendJson(current.phoneClient, { type: 'desktop_connected' });
    }
  }

  handlePhoneClient(phoneClient, sessionId) {
    const phoneSession = this.phoneSessions.get(sessionId) || {};
    phoneSession.phoneClient = phoneClient;
    phoneSession.updatedAt = Date.now();
    phoneSession.audioStarted = false;
    this.phoneSessions.set(sessionId, phoneSession);
    this.log(`phone_${sessionId}`, 'Phone microphone client connected', {
      hasDesktop: Boolean(phoneSession.desktopClient)
    });

    this.sendJson(phoneClient, {
      type: 'phone_ready',
      sessionId,
      hasDesktop: Boolean(phoneSession.desktopClient)
    });

    if (phoneSession.desktopClient?.readyState === WebSocket.OPEN) {
      this.sendJson(phoneSession.desktopClient, { type: 'phone_connected', sessionId });
      this.sendJson(phoneClient, { type: 'desktop_connected' });
    }

    phoneClient.on('message', (data, isBinary) => {
      if (!isBinary) {
        let payload;
        try {
          payload = JSON.parse(data.toString());
        } catch (error) {
          return;
        }

        if (payload.type === 'phone_status' && phoneSession.desktopClient?.readyState === WebSocket.OPEN) {
          this.log(`phone_${sessionId}`, 'Phone status forwarded', payload.status || '');
          this.sendJson(phoneSession.desktopClient, {
            type: 'phone_status',
            status: payload.status || ''
          });
        }
        return;
      }

      const desktopSession = phoneSession.desktopSession;
      if (desktopSession && !phoneSession.audioStarted) {
        phoneSession.audioStarted = true;
        this.log(desktopSession.id, 'First phone audio chunk received');
        if (phoneSession.desktopClient?.readyState === WebSocket.OPEN) {
          this.sendJson(phoneSession.desktopClient, { type: 'phone_audio_started', sessionId });
        }
      }

      if (desktopSession) {
        this.forwardAudioToAgent(desktopSession, data);
      }
    });

    phoneClient.on('close', () => {
      this.log(`phone_${sessionId}`, 'Phone microphone client closed');
      const current = this.phoneSessions.get(sessionId);
      if (current?.phoneClient === phoneClient) {
        current.phoneClient = null;
        current.updatedAt = Date.now();
        if (current.desktopClient?.readyState === WebSocket.OPEN) {
          this.sendJson(current.desktopClient, { type: 'phone_disconnected', sessionId });
        }
      }
    });
  }

  previewSpeak(client) {
    this.sendJson(client, { type: 'audio_end' });
    return Promise.resolve();
  }
}

module.exports = VoiceRealtimeGateway;
