const fs = require('fs');
const path = require('path');

class ConversationInsights {
  constructor(llmProvider, outputRoot) {
    this.llmProvider = llmProvider;
    this.outputRoot = outputRoot;
  }

  slugify(value, fallback = 'page') {
    const normalized = `${value || ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized || fallback;
  }

  buildOutputDirectory(context = {}) {
    const appSlug = this.slugify(context.appId || 'shared-app', 'shared-app');
    const pathSlug = this.slugify((context.sourcePathname || '').replace(/\//g, '-'), 'page');
    return path.join(this.outputRoot, appSlug, pathSlug);
  }

  complaintsPath(context = {}) {
    return path.join(this.buildOutputDirectory(context), 'voice-complaints.json');
  }

  suggestionsPath(context = {}) {
    return path.join(this.buildOutputDirectory(context), 'voice-improvement-suggestions.json');
  }

  readJson(filePath, fallback) {
    try {
      if (!fs.existsSync(filePath)) {
        return fallback;
      }
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      return fallback;
    }
  }

  writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  fallbackExtract(userText = '') {
    const text = `${userText || ''}`.trim();
    if (!text) {
      return { importantFacts: [], complaints: [] };
    }

    const complaintWords = [
      'molesta',
      'problema',
      'queja',
      'dificil',
      'difícil',
      'confuso',
      'lento',
      'no entiendo',
      'no funciona',
      'no puedo',
      'demora',
      'friccion',
      'fricción',
      'complicado',
      'malo',
      'error'
    ];
    const lower = text.toLowerCase();
    const isComplaint = complaintWords.some((word) => lower.includes(word));

    return {
      importantFacts: [text].filter(Boolean),
      complaints: isComplaint
        ? [{
            title: 'Queja expresada durante la conversacion',
            summary: text,
            severity: lower.includes('no funciona') || lower.includes('error') ? 'high' : 'medium',
            evidence: text
          }]
        : []
    };
  }

  async extractTurnInsights({ userText, assistantReply, context = {} }) {
    const text = `${userText || ''}`.trim();
    if (!text) {
      return { importantFacts: [], complaints: [] };
    }

    if (!this.llmProvider?.hasApiKey()) {
      return this.fallbackExtract(text);
    }

    const messages = [
      {
        role: 'system',
        content: [
          'Extract business-relevant memory from one voice-assistant turn.',
          'Return JSON only with keys importantFacts and complaints.',
          'importantFacts is an array of short useful facts the user revealed.',
          'complaints is an array of objects with title, summary, severity, evidence.',
          'Only include real complaints, confusion, objections, friction, distrust, unmet expectations, or blockers.',
          'severity must be low, medium, or high.',
          'Keep all text in Spanish when the source is Spanish.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify({
          context,
          userText: text,
          assistantReply: assistantReply || ''
        })
      }
    ];

    try {
      const content = await this.llmProvider.chatExpectingJson(messages, { type: 'json_object' });
      const parsed = this.llmProvider.parseJsonObject(content);
      return {
        importantFacts: Array.isArray(parsed.importantFacts) ? parsed.importantFacts : [],
        complaints: Array.isArray(parsed.complaints) ? parsed.complaints : []
      };
    } catch (error) {
      console.warn(`[ConversationInsights] Falling back after extraction error: ${error.message}`);
      return this.fallbackExtract(text);
    }
  }

  async captureTurn({ userText, assistantReply, context = {} }) {
    const extracted = await this.extractTurnInsights({ userText, assistantReply, context });
    const complaints = extracted.complaints || [];
    const importantFacts = extracted.importantFacts || [];

    if (complaints.length === 0 && importantFacts.length === 0) {
      return { stored: false, complaintCount: 0, factCount: 0 };
    }

    const filePath = this.complaintsPath(context);
    const current = this.readJson(filePath, {
      appId: context.appId || '',
      sourcePathname: context.sourcePathname || '',
      updatedAt: null,
      turns: []
    });

    current.appId = context.appId || current.appId || '';
    current.sourcePathname = context.sourcePathname || current.sourcePathname || '';
    current.sourceTitle = context.sourceTitle || current.sourceTitle || '';
    current.updatedAt = new Date().toISOString();
    current.turns.push({
      id: `turn_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      createdAt: current.updatedAt,
      userText,
      assistantReply,
      importantFacts,
      complaints,
      url: context.sourceUrl || '',
      pathname: context.sourcePathname || ''
    });

    this.writeJson(filePath, current);

    return {
      stored: true,
      complaintCount: complaints.length,
      factCount: importantFacts.length,
      filePath
    };
  }

  flattenComplaints(context = {}) {
    const current = this.readJson(this.complaintsPath(context), { turns: [] });
    return (current.turns || []).flatMap((turn) =>
      (turn.complaints || []).map((complaint) => ({
        ...complaint,
        turnId: turn.id,
        createdAt: turn.createdAt,
        userText: turn.userText,
        url: turn.url,
        pathname: turn.pathname
      }))
    );
  }

  buildFallbackSuggestions(context = {}, complaints = []) {
    return complaints.slice(-6).map((complaint, index) => ({
      id: `voice-complaint-${index + 1}`,
      priority: complaint.severity || 'medium',
      title: complaint.title || 'Resolver friccion expresada por usuarios',
      summary: complaint.summary || complaint.userText || 'El usuario expreso una dificultad durante la conversacion.',
      evidence: complaint.evidence || complaint.userText || 'Evidencia capturada por voz.',
      opportunity: 'Ajustar copy, orden de campos o ayudas contextuales para reducir esta friccion antes de que bloquee la conversion.',
      source: 'Conversaciones de voz del asistente'
    }));
  }

  async processComplaints(context = {}, workflows = []) {
    const complaints = this.flattenComplaints(context);
    if (complaints.length === 0) {
      return {
        complaintCount: 0,
        suggestions: [],
        source: 'voice-conversations',
        outputPath: this.suggestionsPath(context)
      };
    }

    let suggestions = this.buildFallbackSuggestions(context, complaints);

    if (this.llmProvider?.hasApiKey()) {
      const messages = [
        {
          role: 'system',
          content: [
            'You turn real user voice complaints into concrete web page improvement suggestions.',
            'Return JSON only with key suggestions.',
            'Each suggestion must include id, priority, title, summary, evidence, opportunity, and source.',
            'Ground every suggestion in the complaints. Avoid generic advice.',
            'Write in Spanish.'
          ].join(' ')
        },
        {
          role: 'user',
          content: JSON.stringify({
            context,
            complaints: complaints.slice(-30),
            workflows: (workflows || []).slice(0, 8).map((workflow) => ({
              id: workflow.id,
              description: workflow.description,
              summary: workflow.summary,
              stepCount: (workflow.steps || []).length
            }))
          })
        }
      ];

      try {
        const content = await this.llmProvider.chatExpectingJson(messages, { type: 'json_object' });
        const parsed = this.llmProvider.parseJsonObject(content);
        if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
          suggestions = parsed.suggestions.slice(0, 8);
        }
      } catch (error) {
        console.warn(`[ConversationInsights] Falling back after suggestion error: ${error.message}`);
      }
    }

    const result = {
      complaintCount: complaints.length,
      suggestions,
      source: 'voice-conversations',
      generatedAt: new Date().toISOString()
    };
    this.writeJson(this.suggestionsPath(context), result);
    return {
      ...result,
      outputPath: this.suggestionsPath(context)
    };
  }
}

module.exports = ConversationInsights;
