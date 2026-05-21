class TransversalWorkflowComposer {
  normalizeText(value = '') {
    return `${value || ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  getTargetVariableName(step = {}) {
    return `target_${step.stepOrder}`;
  }

  getBaselineTarget(step = {}) {
    return `${step.semanticTarget || step.label || ''}`.trim();
  }

  getRequestedTarget(step = {}, variables = {}) {
    const key = this.getTargetVariableName(step);
    return `${variables?.[key] || ''}`.trim();
  }

  hasTargetOverride(step = {}, variables = {}) {
    if (`${step.actionType || ''}`.trim().toLowerCase() !== 'click') {
      return false;
    }

    const requested = this.getRequestedTarget(step, variables);
    if (!requested) {
      return false;
    }

    const baseline = this.getBaselineTarget(step);
    if (!baseline) {
      return false;
    }

    return this.normalizeText(requested) !== this.normalizeText(baseline);
  }

  shouldSkipNavigationAfterTransversalClick(previousStep = {}, currentStep = {}) {
    return Boolean(
      previousStep?.transversalTarget
      && `${previousStep?.actionType || ''}`.trim().toLowerCase() === 'click'
      && `${currentStep?.actionType || ''}`.trim().toLowerCase() === 'navigation'
    );
  }

  composeSteps(steps = [], variables = {}) {
    const composedSteps = [];
    const inputSteps = Array.isArray(steps) ? steps : [];

    for (const step of inputSteps) {
      const composedStep = this.hasTargetOverride(step, variables)
        ? {
            ...step,
            transversalTarget: this.getRequestedTarget(step, variables),
            transversalSourceTarget: this.getBaselineTarget(step)
          }
        : { ...step };

      const previousStep = composedSteps[composedSteps.length - 1] || null;
      // Current strategy: skip the immediate learned navigation after a transversal click,
      // because that URL usually points back to the originally taught entity and undoes the override.
      // Future "relax" strategy: keep the navigation step but allow it when the post-click URL
      // still represents valid progress for the same surface pattern.
      if (this.shouldSkipNavigationAfterTransversalClick(previousStep, composedStep)) {
        continue;
      }

      composedSteps.push(composedStep);
    }

    return composedSteps;
  }
}

module.exports = TransversalWorkflowComposer;
