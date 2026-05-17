function registerLearningRoutes(app, deps = {}) {
  const learningSessionService = deps.learningSessionService;

  if (!app || !learningSessionService) {
    throw new Error('registerLearningRoutes requires app and learningSessionService');
  }

  app.get('/api/status', (req, res) => {
    res.json(learningSessionService.getStatus());
  });

  app.post('/api/workflow/start', async (req, res) => {
    try {
      const description = (req.body?.description || '').trim() || 'Untitled workflow';
      const workflowId = await learningSessionService.startSession(
        description,
        req.body?.context || {}
      );
      console.log(`[Server] Starting workflow: ${workflowId}`);
      res.json({ id: workflowId });
    } catch (err) {
      console.error(`[Server] Start Error: ${err.message}`);
      learningSessionService.reset();
      res.status(500).send(err.message);
    }
  });

  app.post('/api/step', async (req, res) => {
    try {
      const workflowId = learningSessionService.resolveSessionId(req.body?.sessionId);
      const stepOrder = await learningSessionService.recordStep(req.body, {
        sessionId: workflowId
      });
      console.log(`[Server] Logging step ${stepOrder} for ${workflowId}`);
      res.sendStatus(200);
    } catch (err) {
      console.error(`[Server] Step Error: ${err.message}`);
      res.status(500).send(err.message);
    }
  });

  app.post('/api/workflow/context-note', async (req, res) => {
    try {
      await learningSessionService.addContextNote(req.body?.note || {}, {
        sessionId: req.body?.sessionId || ''
      });
      res.sendStatus(200);
    } catch (err) {
      console.error(`[Server] Context Note Error: ${err.message}`);
      res.status(500).send(err.message);
    }
  });

  app.post('/api/workflow/stop', async (req, res) => {
    try {
      const workflowId = learningSessionService.resolveSessionId(req.body?.sessionId);
      console.log(`[Server] Stopping workflow: ${workflowId}`);
      const { summary } = await learningSessionService.finishSession({
        sessionId: workflowId
      });
      console.log(`[Server] Final Summary: ${summary}`);
      res.sendStatus(200);
    } catch (err) {
      console.error(`[Server] Stop Error: ${err.message}`);
      res.status(500).send(err.message);
    }
  });

  app.post('/api/reset', (req, res) => {
    console.log('[Server] Manual status reset');
    learningSessionService.reset();
    res.sendStatus(200);
  });
}

module.exports = registerLearningRoutes;
