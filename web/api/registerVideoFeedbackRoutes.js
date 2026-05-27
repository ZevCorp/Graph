const path = require('path');

function registerVideoFeedbackRoutes(app, deps = {}) {
  const generateVideoFeedbackPrompts = deps.generateVideoFeedbackPrompts;

  if (!app || !generateVideoFeedbackPrompts) {
    throw new Error('registerVideoFeedbackRoutes requires app and generateVideoFeedbackPrompts');
  }

  app.post('/api/video-feedback/analyze', async (req, res) => {
    try {
      const videoDataUrl = `${req.body?.videoDataUrl || ''}`.trim();
      const mimeType = `${req.body?.mimeType || ''}`.trim();
      const durationMs = Number.isFinite(req.body?.durationMs) ? req.body.durationMs : 0;
      const pageContext = req.body?.pageContext && typeof req.body.pageContext === 'object'
        ? req.body.pageContext
        : {};

      if (!videoDataUrl) {
        return res.status(400).json({ error: 'videoDataUrl is required.' });
      }

      console.log('[VideoFeedback] Starting video analysis request');
      const result = await generateVideoFeedbackPrompts.execute({
        videoDataUrl,
        mimeType,
        durationMs,
        pageContext
      });
      console.log(`[VideoFeedback] Analysis completed with ${result.actionablePrompts.length} actionable prompt(s)`);
      res.json(result);
    } catch (error) {
      console.error(`[VideoFeedback] Analyze error: ${error.message}`);
      res.status(500).json({ error: error.message || 'Video feedback analysis failed.' });
    }
  });

  app.get('/api/video-feedback/:id', (req, res) => {
    const payload = generateVideoFeedbackPrompts.getResult(req.params.id);
    if (!payload) {
      return res.status(404).json({ error: 'Video feedback result not found.' });
    }

    return res.json(payload);
  });

  app.get('/feedback-prompts/:id', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'web', 'public', 'video-feedback-prompts.html'));
  });
}

module.exports = registerVideoFeedbackRoutes;
