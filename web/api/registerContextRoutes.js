function buildSurfaceContext(body = {}) {
  return {
    appId: body?.appId || body?.context?.appId || '',
    sourceUrl: body?.sourceUrl || body?.context?.sourceUrl || '',
    sourceOrigin: body?.sourceOrigin || body?.context?.sourceOrigin || '',
    sourcePathname: body?.sourcePathname || body?.context?.sourcePathname || '',
    sourceTitle: body?.sourceTitle || body?.context?.sourceTitle || '',
    workflowDescription: body?.workflowDescription || '',
    assistantProfile: body?.assistantProfile || null,
    scope: body?.context?.scope || 'global',
    ownerId: body?.context?.ownerId || '',
    browserLocale: body?.context?.browserLocale || '',
    languageCode: body?.context?.languageCode || ''
  };
}

function registerContextRoutes(app, deps = {}) {
  const generatePitchArtifacts = deps.generatePitchArtifacts;
  const conversationInsights = deps.conversationInsights;
  const catalogService = deps.catalogService;
  const surfaceProfileService = deps.surfaceProfileService;

  if (!app || !generatePitchArtifacts || !conversationInsights || !catalogService || !surfaceProfileService) {
    throw new Error('registerContextRoutes requires app, generatePitchArtifacts, conversationInsights, catalogService, and surfaceProfileService');
  }

  app.post('/api/pitch/generate', async (req, res) => {
    try {
      const context = buildSurfaceContext(req.body || {});
      const result = await generatePitchArtifacts.execute(context);
      res.status(201).json(result);
    } catch (err) {
      console.error(`[Pitch] Generate Error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/pitch/improvements', async (req, res) => {
    try {
      const context = buildSurfaceContext(req.body || {});
      const result = await generatePitchArtifacts.previewImprovements(context);
      res.json(result);
    } catch (err) {
      console.error(`[Pitch] Improvement Preview Error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/voice/complaints/process', async (req, res) => {
    try {
      const context = buildSurfaceContext(req.body || {});
      const workflows = generatePitchArtifacts.filterWorkflowsForContext(
        await catalogService.getCatalog(),
        context
      );
      const result = await conversationInsights.processComplaints(context, workflows);
      res.json(result);
    } catch (err) {
      console.error(`[Voice Complaints] Process Error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/surface-profile/ensure', async (req, res) => {
    try {
      const context = buildSurfaceContext(req.body || {});
      const result = await surfaceProfileService.ensureGlobalProfile(
        {
          appId: context.appId,
          sourceUrl: context.sourceUrl,
          sourceOrigin: context.sourceOrigin,
          sourcePathname: context.sourcePathname,
          sourceTitle: context.sourceTitle,
          scope: context.scope,
          ownerId: context.ownerId,
          browserLocale: context.browserLocale,
          languageCode: context.languageCode
        },
        req.body?.pageSnapshot || {}
      );
      res.json(result);
    } catch (err) {
      console.error(`[Surface Profile] Ensure Error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = registerContextRoutes;
