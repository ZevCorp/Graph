function registerDiagnosticsRoutes(app, deps = {}) {
  const executionDiagnosticsAssistant = deps.executionDiagnosticsAssistant;

  if (!app || !executionDiagnosticsAssistant) {
    throw new Error('registerDiagnosticsRoutes requires app and executionDiagnosticsAssistant');
  }

  app.post('/api/diagnostics/analyze', async (req, res) => {
    try {
      const result = await executionDiagnosticsAssistant.analyze(req.body || {});
      res.json(result);
    } catch (err) {
      console.error(`[Diagnostics] Analyze Error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = registerDiagnosticsRoutes;
