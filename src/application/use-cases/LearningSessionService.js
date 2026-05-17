class LearningSessionService {
  constructor(workflowLearner) {
    this.workflowLearner = workflowLearner;
    this.activeSession = null;
  }

  getStatus() {
    return {
      recording: Boolean(this.activeSession?.id),
      id: this.activeSession?.id || null
    };
  }

  resolveSessionId(candidateId = '') {
    const normalizedCandidate = `${candidateId || ''}`.trim();
    if (normalizedCandidate) {
      return normalizedCandidate;
    }

    return `${this.activeSession?.id || ''}`.trim();
  }

  async startSession(description, context = {}, options = {}) {
    const workflowId = await this.workflowLearner.startSession(description, context, options);
    this.activeSession = {
      id: workflowId,
      description: `${description || ''}`.trim(),
      context: context && typeof context === 'object' ? { ...context } : {},
      startedAt: Date.now()
    };
    return workflowId;
  }

  async recordStep(stepData, options = {}) {
    const workflowId = this.resolveSessionId(options.sessionId);
    if (!workflowId) {
      throw new Error('No active learning session');
    }

    return this.workflowLearner.recordStep(workflowId, stepData);
  }

  async addContextNote(note, options = {}) {
    const workflowId = this.resolveSessionId(options.sessionId);
    if (!workflowId) {
      throw new Error('No active learning session');
    }

    return this.workflowLearner.addContextNote(workflowId, note);
  }

  async finishSession(options = {}) {
    const workflowId = this.resolveSessionId(options.sessionId);
    if (!workflowId) {
      throw new Error('No active learning session');
    }

    const summary = await this.workflowLearner.finishSession(workflowId);
    if (!options.preserveActive && workflowId === this.activeSession?.id) {
      this.activeSession = null;
    }
    return {
      workflowId,
      summary
    };
  }

  reset() {
    this.activeSession = null;
  }
}

module.exports = LearningSessionService;
