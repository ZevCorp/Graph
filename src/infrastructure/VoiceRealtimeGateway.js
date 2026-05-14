const WebSocket = require('ws');

class VoiceRealtimeGateway {
  constructor({ deepgramApiKey, agentChat, conversationInsights }) {
    this.deepgramApiKey = `${deepgramApiKey || ''}`.trim();
    this.agentChat = agentChat;
    this.conversationInsights = conversationInsights;
    this.phoneSessions = new Map();
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

  handleClient(client) {
    if (!this.deepgramApiKey) {
      this.sendJson(client, { type: 'error', error: 'DEEPGRAM_API_KEY is not configured.' });
      client.close();
      return;
    }

    const session = {
      context: {},
      history: [],
      dgListen: null,
      currentFinalText: '',
      processing: false,
      phoneSessionId: null,
      stoppedByUser: false
    };

    const connectToDeepgram = () => {
      if (session.dgListen && session.dgListen.readyState === WebSocket.OPEN) {
        return;
      }

      const params = new URLSearchParams({
        model: process.env.DEEPGRAM_STT_MODEL || 'nova-3',
        language: process.env.DEEPGRAM_STT_LANGUAGE || 'es',
        encoding: 'linear16',
        sample_rate: '16000',
        channels: '1',
        interim_results: 'true',
        smart_format: 'true',
        endpointing: process.env.DEEPGRAM_ENDPOINTING_MS || '350'
      });

      session.dgListen = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, {
        headers: {
          Authorization: `Token ${this.deepgramApiKey}`
        }
      });

      session.dgListen.on('open', () => {
        this.sendJson(client, { type: 'ready' });
      });

      session.dgListen.on('message', (data) => {
        this.handleTranscriptMessage(client, session, data).catch((error) => {
          this.sendJson(client, { type: 'error', error: error.message });
        });
      });

      session.dgListen.on('error', (error) => {
        this.sendJson(client, { type: 'error', error: `Deepgram STT error: ${error.message}` });
      });

      session.dgListen.on('close', () => {
        this.sendJson(client, { type: 'stt_closed' });
      });
    };

    client.on('message', (data, isBinary) => {
      if (isBinary) {
        if (session.dgListen?.readyState === WebSocket.OPEN) {
          session.dgListen.send(data);
        }
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
        if (session.phoneSessionId) {
          this.bindDesktopToPhoneSession(session.phoneSessionId, session, client);
          this.sendJson(client, {
            type: 'phone_waiting',
            sessionId: session.phoneSessionId
          });
          return;
        }

        connectToDeepgram();
        return;
      }

      if (payload.type === 'stop') {
        session.stoppedByUser = true;
        session.dgListen?.close();
        client.close();
      }
    });

    client.on('close', () => {
      try {
        session.dgListen?.close();
      } catch (error) {
        // Nothing else to do when both sockets are already closing.
      }
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
        if (desktopSession.dgListen?.readyState !== WebSocket.OPEN && desktopSession.dgListen?.readyState !== WebSocket.CONNECTING) {
          this.connectSessionToDeepgram(desktopSession, phoneSession.desktopClient);
        }
        if (phoneSession.desktopClient?.readyState === WebSocket.OPEN) {
          this.sendJson(phoneSession.desktopClient, { type: 'phone_audio_started', sessionId });
        }
      }

      if (desktopSession?.dgListen?.readyState === WebSocket.OPEN) {
        desktopSession.dgListen.send(data);
      }
    });

    phoneClient.on('close', () => {
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

  connectSessionToDeepgram(session, client) {
    if (session.dgListen && [WebSocket.OPEN, WebSocket.CONNECTING].includes(session.dgListen.readyState)) {
      return;
    }

    const params = new URLSearchParams({
      model: process.env.DEEPGRAM_STT_MODEL || 'nova-3',
      language: process.env.DEEPGRAM_STT_LANGUAGE || 'es',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      interim_results: 'true',
      smart_format: 'true',
      endpointing: process.env.DEEPGRAM_ENDPOINTING_MS || '350'
    });

    session.dgListen = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, {
      headers: {
        Authorization: `Token ${this.deepgramApiKey}`
      }
    });

    session.dgListen.on('open', () => {
      this.sendJson(client, { type: 'ready' });
    });

    session.dgListen.on('message', (data) => {
      this.handleTranscriptMessage(client, session, data).catch((error) => {
        this.sendJson(client, { type: 'error', error: error.message });
      });
    });

    session.dgListen.on('error', (error) => {
      this.sendJson(client, { type: 'error', error: `Deepgram STT error: ${error.message}` });
    });

    session.dgListen.on('close', () => {
      this.sendJson(client, { type: 'stt_closed' });
    });
  }

  async handleTranscriptMessage(client, session, data) {
    let payload;
    try {
      payload = JSON.parse(data.toString());
    } catch (error) {
      return;
    }

    const alternative = payload.channel?.alternatives?.[0];
    const transcript = `${alternative?.transcript || ''}`.trim();
    if (!transcript) {
      return;
    }

    this.sendJson(client, {
      type: payload.is_final ? 'transcript_final' : 'transcript_interim',
      text: transcript
    });

    if (payload.is_final) {
      session.currentFinalText = `${session.currentFinalText} ${transcript}`.trim();
    }

    if (!payload.speech_final || !session.currentFinalText || session.processing) {
      return;
    }

    const userText = session.currentFinalText;
    session.currentFinalText = '';
    session.processing = true;

    try {
      await this.handleUserTurn(client, session, userText);
    } finally {
      session.processing = false;
    }
  }

  async handleUserTurn(client, session, userText) {
    this.sendJson(client, { type: 'user_turn', text: userText });
    session.history.push({ role: 'user', content: userText });

    const response = await this.agentChat.handleMessage(
      userText,
      session.history.slice(-10),
      session.context || {}
    );

    const reply = response.reply || 'Listo.';
    session.history.push({ role: 'assistant', content: reply });

    await this.conversationInsights?.captureTurn({
      userText,
      assistantReply: reply,
      context: session.context || {}
    });

    this.sendJson(client, {
      type: 'assistant_turn',
      text: reply,
      workflowId: response.workflowId || null,
      executed: Boolean(response.executed),
      executionPlan: response.executionPlan || null
    });

    await this.speak(client, reply);
  }

  speak(client, text) {
    return new Promise((resolve) => {
      const cleanText = `${text || ''}`.trim().slice(0, 1900);
      if (!cleanText) {
        resolve();
        return;
      }

      const params = new URLSearchParams({
        model: process.env.DEEPGRAM_TTS_MODEL || 'aura-2-celeste-es',
        encoding: 'linear16',
        sample_rate: process.env.DEEPGRAM_TTS_SAMPLE_RATE || '24000'
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
          // The socket may already be closed after a Flushed event.
        }
        resolve();
      };

      dgSpeak.on('open', () => {
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
          finish();
        }
      });

      dgSpeak.on('error', (error) => {
        this.sendJson(client, { type: 'error', error: `Deepgram TTS error: ${error.message}` });
        finish();
      });

      dgSpeak.on('close', finish);
    });
  }
}

module.exports = VoiceRealtimeGateway;
