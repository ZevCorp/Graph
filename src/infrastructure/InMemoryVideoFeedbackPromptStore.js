const crypto = require('crypto');

class InMemoryVideoFeedbackPromptStore {
  constructor(options = {}) {
    this.entries = new Map();
    this.ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : 1000 * 60 * 60 * 24;
  }

  create(payload) {
    this.pruneExpired();
    const id = crypto.randomUUID();
    this.entries.set(id, {
      id,
      payload,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + this.ttlMs
    });
    return id;
  }

  get(id) {
    this.pruneExpired();
    const entry = this.entries.get(`${id || ''}`.trim());
    if (!entry) {
      return null;
    }

    return {
      id: entry.id,
      createdAt: entry.createdAt,
      ...entry.payload
    };
  }

  pruneExpired() {
    const now = Date.now();
    for (const [id, entry] of this.entries.entries()) {
      if (!entry || entry.expiresAt <= now) {
        this.entries.delete(id);
      }
    }
  }
}

module.exports = InMemoryVideoFeedbackPromptStore;
