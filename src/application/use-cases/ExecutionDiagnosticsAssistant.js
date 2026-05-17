class ExecutionDiagnosticsAssistant {
  constructor(llmProvider) {
    this.llmProvider = llmProvider;
  }

  buildRecorderKnowledge() {
    return {
      clickCapture: [
        'The recorder listens to document click events in capture phase.',
        'It captures closest(a, button, input, textarea, select, option).',
        'It skips select/option click capture and records select state through input/change/blur.',
        'For selectors it prefers: data-testid -> safe #id -> [id="..."] -> [name="..."] -> a[href="..."] -> button[type="..."] -> tagName.',
        'For labels it prefers HTML label text -> aria-label -> aria-labelledby -> placeholder/name/id.',
        'The learned click step is persisted through appendWorkflowStep with keepalive.',
        'Before persisting a click step it stores a pending click intent with selector/text/href/pageUrl.',
        'If the click intent survives a surface change without becoming a learned step, the recorder emits a warning instead of learning it silently.'
      ],
      knownWeaknesses: [
        'Fast SPA transitions can move to a new surface before the learned step POST is fully acknowledged.',
        'Anchor text is not used as the primary learned selector when href/name/id are available.',
        'Generic selectors like button[type="submit"] are weaker than href/id/name-based selectors.',
        'A click can be detected successfully while the learned workflow still misses the step if persistence is lost across route change.'
      ]
    };
  }

  extractExecutionErrors(logs = []) {
    return (Array.isArray(logs) ? logs : []).filter((entry) => {
      const scope = `${entry?.scope || ''}`.trim().toLowerCase();
      const level = `${entry?.level || ''}`.trim().toLowerCase();
      return scope === 'execution' && level === 'error';
    });
  }

  extractLearningAlerts(logs = []) {
    return (Array.isArray(logs) ? logs : []).filter((entry) => {
      const scope = `${entry?.scope || ''}`.trim().toLowerCase();
      const level = `${entry?.level || ''}`.trim().toLowerCase();
      return scope === 'recorder' && (level === 'warn' || level === 'error');
    });
  }

  normalize(value) {
    return `${value || ''}`.trim().toLowerCase();
  }

  sameSelector(left, right) {
    return this.normalize(left) && this.normalize(left) === this.normalize(right);
  }

  sameHref(left, right) {
    return this.normalize(left) && this.normalize(left) === this.normalize(right);
  }

  samePage(left, right) {
    if (!this.normalize(left) || !this.normalize(right)) {
      return false;
    }
    return this.normalize(left) === this.normalize(right);
  }

  matchSelectedElementToAlert(alert, selectedElement) {
    const details = alert?.details || {};
    if (!selectedElement || !details) {
      return false;
    }

    return this.sameSelector(details.selector, selectedElement.selector)
      || this.sameHref(details.href, selectedElement.href)
      || (
        this.samePage(details.pageUrl, selectedElement.pageUrl)
        && this.normalize(details.text)
        && this.normalize(details.text) === this.normalize(selectedElement.text)
      );
  }

  buildCaptureGapReply(selectedElement = null, logs = []) {
    if (!selectedElement) {
      return null;
    }

    const learningAlerts = this.extractLearningAlerts(logs);
    const matchingAlert = learningAlerts.find((entry) => this.matchSelectedElementToAlert(entry, selectedElement));
    const elementSelector = selectedElement.selector || selectedElement.href || selectedElement.text || 'elemento marcado';
    const elementText = selectedElement.text || '';
    const isAnchor = this.normalize(selectedElement.tagName) === 'a';
    const hasHref = Boolean(this.normalize(selectedElement.href));
    const selectorLooksStrong = this.normalize(selectedElement.selector).startsWith('a[')
      || this.normalize(selectedElement.selector).startsWith('#')
      || this.normalize(selectedElement.selector).startsWith('[name=')
      || this.normalize(selectedElement.selector).startsWith('[id=');

    if (matchingAlert) {
      return [
        `Observacion: el recorder si detecto el click sobre ${elementSelector}, pero ese click no alcanzo a consolidarse como step aprendido.`,
        `Captura actual: este boton ${isAnchor && hasHref ? 'ya entra por la ruta fuerte de captura de anchors con href' : 'si entra al listener de clicks'} y puede construir selector estable${elementText ? ` usando "${elementText}" solo como contexto visual` : ''}.`,
        'Lo que falta exactamente: una reconciliacion post-click para navegaciones SPA por anchor. Hoy guardamos el click intent y avisamos si se pierde, pero todavia no convertimos automaticamente ese intent perdido en una recomendacion estructurada de captura faltante para el workflow.',
        'Que hacer para capturarlo correctamente: cuando aparezca un warning de recorder que haga match con el elemento marcado, el sistema debe clasificarlo automaticamente como "click detectado pero no persistido", sugerir reintento/espera de confirmacion del POST y proponer endurecer la captura de ese step por href actual + pageUrl origen.'
      ].join('\n\n');
    }

    if (isAnchor && hasHref && selectorLooksStrong) {
      return [
        `Observacion: ${elementSelector} ya es capturable con las reglas actuales del recorder.`,
        'Causa probable: no falta detectar mejor el selector del boton; falta confirmar que el click aprendido se persista antes de que la SPA cambie de superficie.',
        'Lo que falta exactamente: deteccion de "click persistido" para anchors que navegan por hash route. Si el siguiente surface change ocurre y no existe step aprendido equivalente, debe abrirse automaticamente una alerta de captura faltante para ese boton.',
        'Que hacer para capturarlo correctamente: comparar el elemento marcado contra los warnings de click intent perdido y contra el workflow final. Si el selector fuerte del anchor no aparece en el workflow, reportarlo como missing learned step en vez de esperar al fallo de ejecucion.'
      ].join('\n\n');
    }

    return [
      `Observacion: ${elementSelector} no parece tener un gap de selector obvio, pero tampoco veo prueba concluyente de que haya quedado aprendido.`,
      'Lo que falta exactamente: una comparacion automatica entre el elemento marcado y los steps realmente persistidos del workflow para decidir si el problema es de deteccion, de persistencia o de selector debil.',
      'Que hacer para capturarlo correctamente: al marcar un elemento, cruzar selector/href/text/pageUrl contra los warnings del recorder y contra los steps capturados, y devolver un veredicto directo de "aprendido", "detectado pero perdido" o "no detectable con la estrategia actual".'
    ].join('\n\n');
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
    const analysisMode = `${payload.analysisMode || ''}`.trim().toLowerCase();
    const selectedElement = payload.selectedElement && typeof payload.selectedElement === 'object'
      ? payload.selectedElement
      : null;
    const captureGapReply = this.buildCaptureGapReply(selectedElement, logs);

    if (analysisMode === 'capture-gap' && captureGapReply) {
      if (!this.llmProvider || typeof this.llmProvider.hasApiKey !== 'function' || !this.llmProvider.hasApiKey()) {
        return { reply: captureGapReply };
      }
    }

    if (!this.llmProvider || typeof this.llmProvider.hasApiKey !== 'function' || !this.llmProvider.hasApiKey()) {
      return {
        reply: captureGapReply || this.buildFallbackReply(userMessage, logs)
      };
    }

    const recorderKnowledge = this.buildRecorderKnowledge();
    const messages = [
      {
        role: 'system',
        content: [
          'You are Graph Diagnostics Assistant.',
          'Your job is to diagnose failures in pre-learned workflow execution without changing the product direction.',
          'Graph should remain a fast workflow runner for pre-learned workflows.',
          'Use the logs and user notes to find the most likely root cause.',
          'You also know exactly how Graph recorder captures elements today.',
          'When a selectedElement is present, compare it against the current recorder capture strategy and identify the exact missing capture method or persistence gap.',
          'Prioritize stable fixes with low blast radius.',
          'Distinguish clearly between: Observation, Likely cause, Why it happens, Stable fix.',
          'If the selected element is already capturable by current selector rules, say that clearly and explain that the missing piece is persistence or post-click reconciliation rather than selector detection.',
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
          analysisMode,
          recorderKnowledge,
          logs,
          selectedElement,
          captureGapReply
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
