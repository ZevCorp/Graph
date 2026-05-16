class SurfaceProfileService {
  constructor(repository, llmProvider) {
    this.repository = repository;
    this.llmProvider = llmProvider;
  }

  normalizePathname(value = '') {
    let pathname = `${value || ''}`.trim();
    if (!pathname) {
      return '/';
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

  buildNormalizedContext(context = {}) {
    return {
      appId: `${context.appId || ''}`.trim(),
      sourceUrl: `${context.sourceUrl || ''}`.trim(),
      sourceOrigin: `${context.sourceOrigin || ''}`.trim(),
      sourcePathname: this.normalizePathname(context.sourcePathname || ''),
      sourceTitle: `${context.sourceTitle || ''}`.trim(),
      scope: `${context.scope || 'global'}`.trim() || 'global',
      ownerId: `${context.ownerId || ''}`.trim()
    };
  }

  buildFallbackProfile(context = {}, pageSnapshot = {}) {
    const pageLabel = context.sourceTitle || pageSnapshot.pageTitle || context.appId || 'esta pagina';
    const normalizedPath = `${context.sourcePathname || '/'}`.trim() || '/';
    const descriptionBase = normalizedPath === '/'
      ? `Main workflow for ${pageLabel}`
      : `Workflow for ${pageLabel} ${normalizedPath}`;

    return {
      appId: context.appId || '',
      sourceOrigin: context.sourceOrigin || '',
      sourcePathname: context.sourcePathname || '/',
      sourceTitle: context.sourceTitle || pageSnapshot.pageTitle || '',
      scope: context.scope || 'global',
      ownerId: context.ownerId || '',
      workflowDescription: descriptionBase,
      assistantProfile: {
        tone: 'direct, concise, action-oriented',
        style: 'fast execution web assistant',
        goals: [
          'Prioritize immediate execution once the request is clear.',
          'Ask only for the minimum missing information required to run a workflow.',
          'Avoid long questionnaires or exploratory conversation.',
          `Stay grounded in the current page context: ${pageLabel}.`
        ]
      },
      assistantRuntime: {
        name: 'Graph',
        accentColor: '#0f5f8c',
        idleMessage: 'Puedo ayudarte en esta pagina. Dime que necesitas y lo hago.'
      },
      welcomeMessage: 'Puedo ayudarte en esta pagina. Dime que necesitas y lo hago.',
      systemPromptAddendum: [
        'Always prioritize fast execution over extended conversation.',
        'If a workflow can be run safely with the information available, run it.',
        'Ask follow-up questions only when a missing value truly blocks execution.'
      ].join(' '),
      pageSummary: `${pageLabel}. Path: ${context.sourcePathname || '/'}.`
    };
  }

  sanitizeGeneratedProfile(context = {}, generated = {}, fallback = {}) {
    const fallbackProfile = fallback || this.buildFallbackProfile(context, {});
    const assistantProfile = generated?.assistantProfile && typeof generated.assistantProfile === 'object'
      ? generated.assistantProfile
      : fallbackProfile.assistantProfile;
    const goals = Array.isArray(assistantProfile.goals)
      ? assistantProfile.goals.filter(Boolean)
      : [];

    return {
      ...fallbackProfile,
      workflowDescription: `${generated?.workflowDescription || fallbackProfile.workflowDescription}`.trim() || fallbackProfile.workflowDescription,
      assistantProfile: {
        tone: `${assistantProfile.tone || fallbackProfile.assistantProfile.tone}`.trim() || fallbackProfile.assistantProfile.tone,
        style: `${assistantProfile.style || fallbackProfile.assistantProfile.style}`.trim() || fallbackProfile.assistantProfile.style,
        goals: [
          ...goals,
          'Prioritize immediate execution once the request is clear.',
          'Ask only for the minimum missing information required to run a workflow.'
        ].filter((goal, index, items) => goal && items.indexOf(goal) === index)
      },
      assistantRuntime: {
        ...fallbackProfile.assistantRuntime,
        ...(generated?.assistantRuntime && typeof generated.assistantRuntime === 'object'
          ? generated.assistantRuntime
          : {})
      },
      welcomeMessage: `${generated?.welcomeMessage || generated?.assistantRuntime?.idleMessage || fallbackProfile.welcomeMessage}`.trim() || fallbackProfile.welcomeMessage,
      systemPromptAddendum: `${generated?.systemPromptAddendum || fallbackProfile.systemPromptAddendum}`.trim() || fallbackProfile.systemPromptAddendum,
      pageSummary: `${generated?.pageSummary || fallbackProfile.pageSummary}`.trim() || fallbackProfile.pageSummary
    };
  }

  async generateProfile(context = {}, pageSnapshot = {}) {
    const fallback = this.buildFallbackProfile(context, pageSnapshot);
    if (!this.llmProvider?.hasApiKey?.()) {
      return fallback;
    }

    const messages = [
      {
        role: 'system',
        content: [
          'You generate global page-assistant profiles for browser workflow automation.',
          'Return JSON only.',
          'Required top-level keys: workflowDescription, assistantProfile, assistantRuntime, welcomeMessage, systemPromptAddendum, pageSummary.',
          'assistantProfile must be an object with keys tone, style, goals.',
          'assistantRuntime must be an object with keys name, accentColor, idleMessage.',
          'The assistant must always prioritize rapid execution over long conversations.',
          'Never produce a profile that encourages excessive questioning.',
          'Assume the profile will be shared globally by all users visiting the same page.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify({
          context,
          pageSnapshot,
          constraints: {
            executionPriority: 'high',
            minimumQuestioning: true,
            sharedForAllUsersOnThisPage: true
          }
        })
      }
    ];

    try {
      const content = await this.llmProvider.chatExpectingJson(messages, { type: 'json_object' });
      const parsed = this.llmProvider.parseJsonObject(content);
      return this.sanitizeGeneratedProfile(context, parsed, fallback);
    } catch (error) {
      console.warn(`[SurfaceProfileService] LLM fallback: ${error.message}`);
      return fallback;
    }
  }

  async ensureGlobalProfile(rawContext = {}, pageSnapshot = {}) {
    const context = this.buildNormalizedContext(rawContext);
    const existing = await this.repository.getSurfaceProfile(
      context.appId,
      context.sourcePathname,
      context.scope,
      context.ownerId
    );

    if (existing) {
      await this.repository.touchSurfaceProfile(existing.id);
      return {
        surfaceProfile: existing,
        generated: false
      };
    }

    const generatedProfile = await this.generateProfile(context, pageSnapshot);
    const saved = await this.repository.upsertSurfaceProfile(generatedProfile);
    return {
      surfaceProfile: saved,
      generated: true
    };
  }
}

module.exports = SurfaceProfileService;
