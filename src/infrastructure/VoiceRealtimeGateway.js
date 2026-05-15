const WebSocket = require('ws');

class VoiceRealtimeGateway {
  constructor({ deepgramApiKey, llmProvider, catalogService, conversationInsights }) {
    this.deepgramApiKey = `${deepgramApiKey || ''}`.trim();
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
    return process.env.DEEPGRAM_VOICE_AGENT_URL || 'wss://agent.deepgram.com/v1/agent/converse';
  }

  getVoiceAgentUrlCandidates() {
    const configured = `${process.env.DEEPGRAM_VOICE_AGENT_URL || ''}`.trim();
    if (configured) {
      return [configured];
    }

    return [
      'wss://agent.deepgram.com/v1/agent/converse',
      'wss://api.deepgram.com/v1/agent/converse'
    ];
  }

  filterWorkflowsForContext(workflows, context = {}) {
    if (!Array.isArray(workflows) || workflows.length === 0) {
      return [];
    }

    const appId = `${context.appId || ''}`.trim();
    const pathname = `${context.sourcePathname || ''}`.trim();

    return workflows.filter((workflow) => {
      if (appId && `${workflow.appId || ''}`.trim() !== appId) {
        return false;
      }
      if (pathname && `${workflow.sourcePathname || ''}`.trim() !== pathname) {
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
    const workflowSummaries = workflows.map((workflow) => this.summarizeWorkflow(workflow));

    return [
      'You are a live car-rental reservation voice concierge working inside the user’s current webpage.',
      assistantProfile
        ? `Adopt this page-specific profile in tone and style: ${assistantProfile}.`
        : 'Use warm, direct, human Spanish for Latin America.',
      'Never mention workflows, function calls, technical modes, ids, JSON, or internal tooling.',
      'You are here to help the user reserve or request a car on the current page.',
      'Keep the interaction conversational, fast, and service-oriented.',
      this.isDemoAutopilotContext(context)
        ? 'This page is in demo autopilot mode. When the user asks to reserve, continue, quote, or do the booking, do not ask for confirmations, do not ask for extra data, acknowledge naturally, and call the function immediately using the recorded workflow defaults plus invented values if needed.'
        : 'If the user says this is a test, asks you to invent missing values, use fake data, or stop asking questions, do exactly that.',
      'When inventing values, keep them plausible and use dates that are today or later. Return dates must be the same day or later than pickup.',
      'If enough information is available to act, do not narrate what you are about to do. Call the function immediately.',
      'After a successful function call, briefly confirm the service outcome in natural language.',
      this.isDemoAutopilotContext(context)
        ? 'Treat user-provided details as acknowledged context, but execute with the recorded workflow values so the demo never fails.'
        : 'If information is missing and the user has not asked you to invent it, ask only for the truly missing pieces.',
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
        name: 'execute_reservation_on_page',
        description: [
          'Execute one of the available reservation flows directly in the user’s current browser page.',
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
      type: 'Settings',
      audio: {
        input: {
          encoding: 'linear16',
          sample_rate: 16000
        },
        output: {
          encoding: 'linear16',
          sample_rate: Number(process.env.DEEPGRAM_TTS_SAMPLE_RATE || 24000),
          container: 'none'
        }
      },
      agent: {
        listen: {
          provider: {
            type: 'deepgram',
            model: process.env.DEEPGRAM_VOICE_STT_MODEL || process.env.DEEPGRAM_STT_MODEL || 'nova-3',
            language: process.env.DEEPGRAM_VOICE_STT_LANGUAGE || process.env.DEEPGRAM_STT_LANGUAGE || 'es'
          }
        },
        think: this.buildThinkSettings(session.context || {}, workflows),
        speak: {
          provider: {
            type: 'deepgram',
            model: process.env.DEEPGRAM_TTS_MODEL || 'aura-2-javier-es',
            speed: process.env.DEEPGRAM_TTS_SPEED || '1.12'
          }
        },
        greeting: 'Hola, puedo ayudarte a reservar un vehiculo. Dime que necesitas y yo me encargo.',
        context: {
          messages: this.buildHistoryContext(session.history)
        }
      }
    };
  }

  startKeepAlive(session) {
    this.stopKeepAlive(session);
    session.keepAliveTimer = setInterval(() => {
      if (!session.agentSocket || session.agentSocket.readyState !== WebSocket.OPEN || !session.settingsApplied) {
        return;
      }
      const idleMs = Date.now() - (session.lastAudioAt || 0);
      if (idleMs >= 8000) {
        session.agentSocket.send(JSON.stringify({ type: 'KeepAlive' }));
        this.log(session.id, 'KeepAlive sent to Deepgram Voice Agent');
      }
    }, 4000);
  }

  stopKeepAlive(session) {
    if (session.keepAliveTimer) {
      clearInterval(session.keepAliveTimer);
      session.keepAliveTimer = null;
    }
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
      llmModel: settings.agent?.think?.provider?.model || '',
      ttsModel: settings.agent?.speak?.provider?.model || ''
    });
    agentSocket.send(JSON.stringify(settings));
  }

  async openVoiceAgentSession(client, session, attemptIndex = 0) {
    this.closeAgentSocket(session);
    const candidates = this.getVoiceAgentUrlCandidates();
    const targetUrl = candidates[Math.min(attemptIndex, candidates.length - 1)];

    const agentSocket = new WebSocket(targetUrl, {
      headers: {
        Authorization: `Token ${this.deepgramApiKey}`
      }
    });

    session.agentSocket = agentSocket;
    session.lastAudioAt = Date.now();

    agentSocket.on('open', () => {
      this.log(session.id, 'Deepgram Voice Agent socket opened', targetUrl);
      this.startKeepAlive(session);
      session.settingsSendTimer = setTimeout(() => {
        this.log(session.id, 'Welcome timeout reached, sending settings proactively');
        this.sendVoiceAgentSettings(agentSocket, session).catch((error) => {
          this.log(session.id, 'Failed to send settings after timeout', error.message);
        });
      }, 350);
      if (session.phoneSessionId) {
        this.sendJson(client, { type: 'phone_waiting', sessionId: session.phoneSessionId });
      }
    });

    agentSocket.on('message', async (data, isBinary) => {
      if (isBinary || Buffer.isBuffer(data)) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data, { binary: true });
        }
        return;
      }

      let payload;
      try {
        payload = JSON.parse(data.toString());
      } catch (error) {
        return;
      }

      const type = `${payload.type || ''}`.trim();

      if (type === 'Welcome') {
        this.log(session.id, 'Deepgram Voice Agent welcome received');
        if (session.settingsSendTimer) {
          clearTimeout(session.settingsSendTimer);
          session.settingsSendTimer = null;
        }
        await this.sendVoiceAgentSettings(agentSocket, session);
        return;
      }

      if (type === 'SettingsApplied') {
        if (session.settingsSendTimer) {
          clearTimeout(session.settingsSendTimer);
          session.settingsSendTimer = null;
        }
        session.settingsApplied = true;
        this.log(session.id, 'Voice Agent settings applied');
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

      if (type === 'ConversationText') {
        const role = payload.role === 'assistant' ? 'assistant' : 'user';
        const content = `${payload.content || ''}`.trim();
        if (!content) {
          return;
        }
        this.log(session.id, `ConversationText:${role}`, this.summarizeText(content));
        this.sendJson(client, {
          type: role === 'assistant' ? 'assistant_turn' : 'user_turn',
          text: content
        });

        if (role === 'user') {
          session.pendingUserText = content;
        } else if (session.pendingUserText) {
          await this.conversationInsights?.captureTurn({
            userText: session.pendingUserText,
            assistantReply: content,
            context: session.context || {}
          });
          session.pendingUserText = '';
        }
        return;
      }

      if (type === 'UserStartedSpeaking') {
        this.log(session.id, 'UserStartedSpeaking received');
        this.sendJson(client, { type: 'user_started_speaking' });
        return;
      }

      if (type === 'AgentThinking') {
        this.log(session.id, 'AgentThinking received');
        this.sendJson(client, { type: 'thinking' });
        return;
      }

      if (type === 'AgentStartedSpeaking') {
        this.log(session.id, 'AgentStartedSpeaking received');
        this.sendJson(client, { type: 'assistant_audio_start' });
        return;
      }

      if (type === 'AgentAudioDone') {
        this.log(session.id, 'AgentAudioDone received');
        this.sendJson(client, { type: 'audio_end' });
        return;
      }

      if (type === 'FunctionCallRequest') {
        this.log(session.id, 'FunctionCallRequest received', payload.functions || []);
        this.sendJson(client, {
          type: 'function_call_request',
          functions: Array.isArray(payload.functions) ? payload.functions : []
        });
        return;
      }

      if (type === 'FunctionCallResponse') {
        this.log(session.id, 'FunctionCallResponse received', payload.name || '');
        return;
      }

      if (type === 'Warning') {
        this.log(session.id, 'Voice Agent warning', payload.description || payload.message || '');
        this.sendJson(client, { type: 'warning', warning: payload.description || payload.message || 'Voice warning.' });
        return;
      }

      if (type === 'Error') {
        this.log(session.id, 'Voice Agent error', payload.description || payload.message || '');
        this.sendJson(client, { type: 'error', error: payload.description || payload.message || 'Voice error.' });
        return;
      }

      this.log(session.id, 'Unhandled Voice Agent message', payload);
    });

    agentSocket.on('error', async (error) => {
      const message = error.message || 'Unknown Voice Agent socket error';
      this.log(session.id, 'Deepgram Voice Agent socket error', {
        url: targetUrl,
        message
      });

      const shouldRetry =
        message.includes('404')
        && attemptIndex + 1 < candidates.length
        && !session.settingsApplied;

      if (shouldRetry) {
        this.log(session.id, 'Retrying Voice Agent endpoint after 404', {
          from: targetUrl,
          to: candidates[attemptIndex + 1]
        });
        try {
          agentSocket.close();
        } catch (closeError) {
          // Ignore close races before retry.
        }
        await this.openVoiceAgentSession(client, session, attemptIndex + 1);
        return;
      }

      this.sendJson(client, { type: 'error', error: `Deepgram Voice Agent error: ${message}` });
    });

    agentSocket.on('close', (code, reasonBuffer) => {
      const reason = Buffer.isBuffer(reasonBuffer) ? reasonBuffer.toString('utf8') : `${reasonBuffer || ''}`;
      this.log(session.id, 'Deepgram Voice Agent socket closed', {
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
    session.agentSocket.send(data, { binary: true });
  }

  handleClient(client) {
    if (!this.deepgramApiKey) {
      this.sendJson(client, { type: 'error', error: 'DEEPGRAM_API_KEY is not configured.' });
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
        const previewText = `${payload.text || ''}`.trim();
        this.log(session.id, 'Preview TTS requested', this.summarizeText(previewText));
        this.previewSpeak(client, previewText).finally(() => {
          try {
            client.close();
          } catch (error) {
            // Ignore close races after preview playback.
          }
        });
        return;
      }

      if (payload.type === 'function_call_response') {
        if (session.agentSocket?.readyState === WebSocket.OPEN) {
          const response = {
            type: 'FunctionCallResponse',
            id: payload.id || undefined,
            name: payload.name || '',
            content: typeof payload.content === 'string' ? payload.content : JSON.stringify(payload.content || {}),
            thought_signature: payload.thought_signature || undefined
          };
          this.log(session.id, 'Forwarding FunctionCallResponse', {
            id: response.id || '',
            name: response.name
          });
          session.agentSocket.send(JSON.stringify(response));
        }
        return;
      }

      if (payload.type === 'stop') {
        session.stoppedByUser = true;
        this.log(session.id, 'Stop requested by client');
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

  previewSpeak(client, text) {
    return new Promise((resolve) => {
      const cleanText = `${text || ''}`.trim().slice(0, 1900);
      if (!cleanText) {
        resolve();
        return;
      }

      this.log('tts', 'Starting preview TTS', this.summarizeText(cleanText));
      const params = new URLSearchParams({
        model: process.env.DEEPGRAM_TTS_MODEL || 'aura-2-javier-es',
        encoding: 'linear16',
        sample_rate: process.env.DEEPGRAM_TTS_SAMPLE_RATE || '24000',
        speed: process.env.DEEPGRAM_TTS_SPEED || '1.12'
      });

      const dgSpeak = new WebSocket(`wss://api.deepgram.com/v1/speak?${params.toString()}`, {
        headers: {
          Authorization: `Token ${this.deepgramApiKey}`
        }
      });

      let resolved = false;
      const finish = () => {
        if (resolved) {
          return;
        }
        resolved = true;
        this.sendJson(client, { type: 'audio_end' });
        try {
          dgSpeak.close();
        } catch (error) {
          // Ignore close races.
        }
        resolve();
      };

      dgSpeak.on('open', () => {
        this.log('tts', 'Preview TTS socket open', {
          model: process.env.DEEPGRAM_TTS_MODEL || 'aura-2-javier-es',
          speed: process.env.DEEPGRAM_TTS_SPEED || '1.12'
        });
        this.sendJson(client, {
          type: 'audio_start',
          encoding: 'linear16',
          sampleRate: Number(process.env.DEEPGRAM_TTS_SAMPLE_RATE || 24000)
        });
        dgSpeak.send(JSON.stringify({ type: 'Speak', text: cleanText }));
        dgSpeak.send(JSON.stringify({ type: 'Flush' }));
      });

      dgSpeak.on('message', (data, isBinary) => {
        if (isBinary || Buffer.isBuffer(data)) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(data, { binary: true });
          }
          return;
        }

        let event;
        try {
          event = JSON.parse(data.toString());
        } catch (error) {
          return;
        }

        if (event.type === 'Flushed') {
          this.log('tts', 'Preview TTS flushed');
          finish();
        }
      });

      dgSpeak.on('error', (error) => {
        this.log('tts', 'Preview TTS error', error.message);
        this.sendJson(client, { type: 'error', error: `Deepgram TTS error: ${error.message}` });
        finish();
      });

      dgSpeak.on('close', () => {
        this.log('tts', 'Preview TTS socket closed');
        finish();
      });
    });
  }
}

module.exports = VoiceRealtimeGateway;
