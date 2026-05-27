class GenerateVideoFeedbackPrompts {
  constructor(analyzer, store) {
    this.analyzer = analyzer;
    this.store = store;
  }

  async execute(input = {}) {
    const videoDataUrl = `${input.videoDataUrl || ''}`.trim();
    const mimeType = `${input.mimeType || ''}`.trim();
    const pageContext = input.pageContext && typeof input.pageContext === 'object'
      ? input.pageContext
      : {};
    const durationMs = Number.isFinite(input.durationMs) ? input.durationMs : 0;

    if (!videoDataUrl) {
      throw new Error('videoDataUrl is required.');
    }

    const analysis = await this.analyzer.analyzeVideo({
      videoDataUrl,
      mimeType,
      pageContext,
      durationMs
    });

    const actionablePrompts = (analysis.actionablePrompts || []).map((item, index) => ({
      id: `prompt-${index + 1}`,
      title: `${item.title || `Cambio ${index + 1}`}`.trim(),
      prompt: `${item.prompt || ''}`.trim(),
      userIntentSummary: `${item.userIntentSummary || ''}`.trim(),
      pageLocationHint: `${item.pageLocationHint || ''}`.trim()
    })).filter((item) => item.prompt);

    const futureIdeas = (analysis.futureIdeas || []).map((item, index) => ({
      id: `future-${index + 1}`,
      idea: `${item.idea || ''}`.trim(),
      context: `${item.context || ''}`.trim()
    })).filter((item) => item.idea);

    const resultId = this.store.create({
      actionablePrompts,
      futureIdeas,
      pageContext
    });

    return {
      resultId,
      actionablePrompts,
      futureIdeas
    };
  }

  getResult(resultId) {
    return this.store.get(resultId);
  }
}

module.exports = GenerateVideoFeedbackPrompts;
