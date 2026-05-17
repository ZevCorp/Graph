class ExecutionDiagnosticsAssistant {
  constructor(llmProvider) {
    this.llmProvider = llmProvider;
  }

  extractExecutionErrors(logs = []) {
    return (Array.isArray(logs) ? logs : []).filter((entry) => {
      const scope = `${entry?.scope || ''}`.trim().toLowerCase();
      const level = `${entry?.level || ''}`.trim().toLowerCase();
      return scope === 'execution' && level === 'error';
    });
  }

  buildFallbackReply(userMessage = '', logs = []) {
    const errors = this.extractExecutionErrors(logs);
    if (errors.length === 0) {
      return [
        'No veo errores de ejecucion claros en los logs enviados.',
        'Observacion: el problema puede estar en pasos previos, en un estado persistido de la pagina o en un selector demasiado generico que todavia no fallo en esta corrida.',
        'Siguiente paso recomendado: comparte el error visible, el step donde se traba y si al recargar o hacer scroll aparece el control esperado.'
      ].join('\n\n');
    }

    const latest = errors[errors.length - 1];
    const details = latest.details || {};
    const failureKind = `${details.failureKind || ''}`.trim();

    if (failureKind === 'invalid_selector') {
      return [
        `Causa probable: el workflow guardo un selector invalido (${details.selector || 'sin selector'}).`,
        'Impacto estable: no conviene arreglarlo con mas espera; hay que corregir la captura del selector o reentrenar ese paso.',
        'Fix recomendado: usar un selector mas robusto por id/name/data-testid y mantener compatibilidad con IDs especiales solo como fallback.'
      ].join('\n\n');
    }

    if (failureKind === 'select_option_not_found' || failureKind === 'recorded_placeholder_value') {
      return [
        `Causa probable: el workflow aprendio un valor no util para un select (${(details.candidates || []).join(', ') || 'sin candidatos'}).`,
        'Impacto estable: el problema esta en la calidad del dato aprendido, no en la navegacion.',
        'Fix recomendado: evitar guardar placeholders durante el aprendizaje y reentrenar el step afectado.'
      ].join('\n\n');
    }

    if (failureKind === 'element_not_found' || failureKind === 'execution_error') {
      return [
        `Causa probable: el target no estaba disponible en la superficie activa cuando se ejecuto el step (${details.selector || details.label || 'sin target'}).`,
        'Hipotesis a validar: cambio SPA incompleto, target fuera del viewport, selector demasiado generico o surface state sucio.',
        'Fix recomendado: validar visibilidad/accionabilidad, esperar progreso real entre steps y endurecer el selector aprendido del control inestable.'
      ].join('\n\n');
    }

    return [
      `Ultimo error detectado: ${latest.message || 'sin mensaje'}.`,
      `Contexto adicional: ${userMessage || 'sin comentario del usuario'}.`,
      'Fix recomendado: revisar el step exacto, su selector, el surface snapshot y si el estado de la SPA estaba realmente listo para el siguiente control.'
    ].join('\n\n');
  }

  async analyze(payload = {}) {
    const userMessage = `${payload.userMessage || ''}`.trim();
    const logs = Array.isArray(payload.logs) ? payload.logs : [];
    const history = Array.isArray(payload.history) ? payload.history : [];
    const selectedElement = payload.selectedElement && typeof payload.selectedElement === 'object'
      ? payload.selectedElement
      : null;

    if (!this.llmProvider || typeof this.llmProvider.hasApiKey !== 'function' || !this.llmProvider.hasApiKey()) {
      return {
        reply: this.buildFallbackReply(userMessage, logs)
      };
    }

    const messages = [
      {
        role: 'system',
        content: [
          'You are Graph Diagnostics Assistant.',
          'Your job is to diagnose failures in pre-learned workflow execution without changing the product direction.',
          'Graph should remain a fast workflow runner for pre-learned workflows.',
          'Use the logs and user notes to find the most likely root cause.',
          'Prioritize stable fixes with low blast radius.',
          'Distinguish clearly between: Observation, Likely cause, Why it happens, Stable fix.',
          'Do not recommend broad rewrites unless strictly necessary.',
          'Be concise and concrete.'
        ].join(' ')
      },
      ...history.map((item) => ({
        role: item?.role === 'assistant' ? 'assistant' : 'user',
        content: `${item?.content || ''}`
      })),
      {
        role: 'user',
        content: JSON.stringify({
          userMessage,
          logs,
          selectedElement
        })
      }
    ];

    const reply = await this.llmProvider.chat(messages);
    return {
      reply: reply || this.buildFallbackReply(userMessage, logs)
    };
  }
}

module.exports = ExecutionDiagnosticsAssistant;
