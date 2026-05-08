const Step = require('./Step');

class Workflow {
  constructor(data = {}) {
    this.id = data.id;
    this.description = data.description || '';
    this.summary = data.summary || '';
    this.status = data.status || 'draft';
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.completedAt = data.completedAt;
    this.steps = Array.isArray(data.steps) ? data.steps.map(s => new Step(s)) : [];
  }

  get variables() {
    return this.inferVariables();
  }

  get totalSteps() {
    return this.steps.length;
  }

  get executableSteps() {
    return this.steps.filter(step => step.isExecutable());
  }

  addStep(stepData) {
    const step = new Step({ ...stepData, stepOrder: this.steps.length + 1 });
    this.steps.push(step);
    return step;
  }

  inferVariables() {
    const variableMap = new Map();

    for (const step of this.steps) {
      const isSelectableField = step.actionType === 'select' && Array.isArray(step.allowedOptions) && step.allowedOptions.length > 0;
      if (!['input', 'select'].includes(step.actionType)) continue;
      if (!step.value && !isSelectableField) continue;
      
      const variableName = `input_${step.stepOrder}`;
      const optionPairs = step.controlType === 'select' && Array.isArray(step.allowedOptions) && step.allowedOptions.length > 0
        ? step.allowedOptions
            .filter((option) => option.value)
            .map((option) => `${option.value} = ${option.label || option.text || option.value}`)
        : [];
      const optionSummary = step.controlType === 'select' && Array.isArray(step.allowedOptions) && step.allowedOptions.length > 0
        ? ` Allowed options: ${optionPairs.join('; ')}.`
        : '';
      const controlHint = step.controlType === 'select'
        ? ' Choose the exact option value whose meaning best matches the request.'
        : '';
      const fallbackPrompt = step.controlType === 'select' && !step.value
        ? `Choose a value for ${step.label || step.selector || `step ${step.stepOrder}`}.`
        : `Value for ${step.label || step.selector || `step ${step.stepOrder}`}`;
      
      variableMap.set(variableName, {
        name: variableName,
        selector: step.selector,
        controlType: step.controlType || '',
        actionType: step.actionType,
        sourceStep: step.stepOrder,
        defaultValue: step.value,
        fieldLabel: step.label || '',
        selectedLabel: step.selectedLabel || '',
        allowedOptions: step.allowedOptions,
        prompt: `${step.explanation || fallbackPrompt}${optionSummary}${controlHint}`.trim()
      });
    }

    return Array.from(variableMap.values());
  }

  toJSON() {
    return {
      id: this.id,
      description: this.description,
      summary: this.summary,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
      steps: this.steps,
      variables: this.variables,
      totalSteps: this.totalSteps
    };
  }
}

module.exports = Workflow;
