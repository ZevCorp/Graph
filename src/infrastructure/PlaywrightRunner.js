const { chromium } = require('playwright');

class PlaywrightRunner {
  constructor() {
    // Pure infrastructure runner, no direct LLM dependency
    this.stepDelayMs = Number(process.env.PLAYWRIGHT_STEP_DELAY_MS || 220);
  }

  normalizeChoiceText(value) {
    return `${value || ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  async disableTeachingConsole(page) {
    await page.evaluate(() => {
      const consoleEl = document.querySelector('.console');
      if (!consoleEl) return;
      consoleEl.setAttribute('data-playwright-hidden', 'true');
      consoleEl.style.pointerEvents = 'none';
      consoleEl.style.opacity = '0.08';
      consoleEl.style.transform = 'translateX(-50%) scale(0.98)';
    }).catch(() => {});
  }

  async notifyAssistant(page, payload = {}) {
    await page.evaluate((eventPayload) => {
      if (window.GraphAssistantRuntime && typeof window.GraphAssistantRuntime.handleAutomationEvent === 'function') {
        window.GraphAssistantRuntime.handleAutomationEvent(eventPayload);
      }
    }, payload).catch(() => {});
  }

  async waitBetweenSteps(page, customDelayMs = this.stepDelayMs) {
    const delayMs = Number(customDelayMs || 0);
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      return;
    }
    await page.waitForTimeout(delayMs);
  }

  resolveLocator(page, step) {
    const label = (step.label || '').trim();

    if (step.selector?.startsWith('a[')) {
      return page.locator(step.selector);
    }

    if (step.selector === 'a' && label) {
      return page.getByRole('link', { name: label, exact: true });
    }

    if (step.selector?.startsWith('button[')) {
      if (label) {
        return page.getByRole('button', { name: label, exact: true });
      }
      return page.locator(step.selector);
    }

    if (label && step.actionType === 'click') {
      const role = step.selector === 'button' ? 'button' : null;
      if (role) {
        return page.getByRole(role, { name: label, exact: true });
      }
    }

    return page.locator(step.selector);
  }

  async resolveSelectOption(locator, rawValue) {
    const requested = `${rawValue || ''}`.trim();
    const options = await locator.evaluate((element) =>
      Array.from(element.options || []).map((option) => ({
        value: option.value,
        label: option.label,
        text: option.textContent || ''
      }))
    );

    if (!requested) {
      return { value: '' };
    }

    const normalizedRequested = this.normalizeChoiceText(requested);
    const exactValue = options.find((option) => this.normalizeChoiceText(option.value) === normalizedRequested);
    if (exactValue) return { value: exactValue.value };

    const exactLabel = options.find((option) => this.normalizeChoiceText(option.label) === normalizedRequested);
    if (exactLabel) return { value: exactLabel.value };

    const exactText = options.find((option) => this.normalizeChoiceText(option.text) === normalizedRequested);
    if (exactText) return { value: exactText.value };

    const partial = options.find((option) =>
      this.normalizeChoiceText(option.value).includes(normalizedRequested) ||
      this.normalizeChoiceText(option.label).includes(normalizedRequested) ||
      this.normalizeChoiceText(option.text).includes(normalizedRequested) ||
      normalizedRequested.includes(this.normalizeChoiceText(option.value)) ||
      normalizedRequested.includes(this.normalizeChoiceText(option.label)) ||
      normalizedRequested.includes(this.normalizeChoiceText(option.text))
    );
    if (partial) {
      return { value: partial.value };
    }

    const selectableOptions = options.filter((option) => option.value);
    throw new Error(
      `No matching option found for "${requested}". Available options: ${
        selectableOptions.map((option) => `${option.value} (${option.label || option.text.trim()})`).join(', ') || 'none'
      }`
    );
  }

  async applyInputAction(page, step, value) {
    const locator = this.resolveLocator(page, step);
    const elementInfo = await locator.evaluate((element) => ({
      tagName: element.tagName.toLowerCase(),
      inputType: element instanceof HTMLInputElement ? (element.type || 'text').toLowerCase() : '',
      currentValue: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
        ? element.value
        : ''
    }));

    if (elementInfo.tagName === 'select' || step.controlType === 'select') {
      await this.applySelectAction(page, step, value);
      return;
    }

    if (elementInfo.inputType === 'radio' || elementInfo.inputType === 'checkbox') {
      const requestedValue = `${value ?? step.selectedValue ?? step.value ?? ''}`.trim().toLowerCase();
      const shouldCheck = requestedValue === '' || requestedValue === 'on' || requestedValue === 'true' || requestedValue === '1' || requestedValue === 'yes';

      if (shouldCheck) {
        await locator.check();
      } else if (elementInfo.inputType === 'checkbox') {
        await locator.uncheck();
      }
      return;
    }

    await locator.fill(value || '');
  }

  async applySelectAction(page, step, value) {
    const locator = this.resolveLocator(page, step);
    const candidates = [
      value,
      step.selectedValue,
      step.selectedLabel,
      step.value
    ].filter((candidate, index, items) => candidate && items.indexOf(candidate) === index);

    let lastError = null;
    for (const candidate of candidates) {
      try {
        const option = await this.resolveSelectOption(locator, candidate);
        await locator.selectOption(option);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    await locator.selectOption({ index: 0 });
  }

  async getVisibleEmptySelects(page) {
    return page.locator('select').evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const options = Array.from(element.options || [])
            .map((option) => ({
              value: option.value,
              label: option.label || option.textContent || '',
              text: (option.textContent || '').trim()
            }))
            .filter((option) => option.value);

          return {
            id: element.id || '',
            testid: element.dataset?.testid || '',
            name: element.getAttribute('name') || '',
            label: document.querySelector(`label[for="${element.id}"]`)?.textContent?.trim() || '',
            value: element.value || '',
            disabled: element.disabled,
            visible: rect.width > 0 && rect.height > 0,
            options
          };
        })
        .filter((element) => !element.disabled && element.visible && !element.value && element.options.length > 0)
    );
  }

  locatorForSelect(page, select) {
    if (select.testid) {
      return page.locator(`[data-testid="${select.testid}"]`);
    }
    if (select.id) {
      return page.locator(`#${select.id}`);
    }
    if (select.name) {
      return page.locator(`select[name="${select.name}"]`);
    }
    return null;
  }

  async autofillEmptySelects(page, context = {}) {
    const emptySelects = await this.getVisibleEmptySelects(page);
    if (emptySelects.length === 0) {
      return [];
    }

    let aiChoices = [];
    if (context && typeof context.optionGuesser === 'function') {
      try {
        aiChoices = await context.optionGuesser(emptySelects, context);
      } catch (error) {
        console.warn(`\x1b[33mLLM select choice fallback: ${error.message}\x1b[0m`);
      }
    }

    const choiceMap = new Map(
      aiChoices
        .filter((choice) => choice && choice.field && choice.value)
        .map((choice) => [choice.field, choice.value])
    );

    const applied = [];
    for (const select of emptySelects) {
      const locator = this.locatorForSelect(page, select);

      if (!locator) {
        continue;
      }

      const fieldKey = select.testid || select.id || select.name || 'select';
      const chosenValue = choiceMap.get(fieldKey);
      const option = select.options.find((candidate) => candidate.value === chosenValue);
      if (!option) {
        console.warn(`\x1b[33mSkipping auto-select for ${fieldKey}: no semantically chosen option.\x1b[0m`);
        continue;
      }
      await locator.selectOption({ value: option.value });
      applied.push({
        field: fieldKey,
        value: option.value
      });
    }

    return applied;
  }

  async describeEmptyFields(page) {
    return page.evaluate(() =>
      Array.from(document.querySelectorAll('input[id], textarea[id], select[id]'))
        .filter((element) => {
          if (element.closest('.console')) return false;
          if (element.disabled) return false;
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          return !(`${element.value || ''}`.trim());
        })
        .slice(0, 8)
        .map((element) => ({
          id: element.id,
          tag: element.tagName.toLowerCase(),
          label: document.querySelector(`label[for="${element.id}"]`)?.textContent?.trim() || ''
        }))
    );
  }

  async clickWithRecovery(page, step, context = {}) {
    const locator = this.resolveLocator(page, step);

    const proactivelyAppliedSelects = await this.autofillEmptySelects(page, context);
    if (proactivelyAppliedSelects.length > 0) {
      console.log(`\x1b[90mModel-selected selects before click: ${proactivelyAppliedSelects.map((item) => `${item.field}=${item.value}`).join(', ')}\x1b[0m`);
    }

    try {
      await locator.click();
      return;
    } catch (error) {
      const message = `${error.message || ''}`;
      if (!message.includes('element is not enabled') && !message.includes('Timeout')) {
        throw error;
      }
    }

    const appliedSelects = await this.autofillEmptySelects(page, context);
    if (appliedSelects.length > 0) {
      console.log(`\x1b[90mAuto-filled selects before click: ${appliedSelects.map((item) => `${item.field}=${item.value}`).join(', ')}\x1b[0m`);
    }

    await page.waitForTimeout(100);

    if (await locator.isDisabled()) {
      const emptyFields = await this.describeEmptyFields(page);
      throw new Error(
        `Could not click ${step.selector || step.label || 'target'} because it is still disabled. Empty visible fields: ${
          emptyFields.map((field) => `${field.id || field.tag}${field.label ? ` (${field.label})` : ''}`).join(', ') || 'none'
        }`
      );
    }

    await locator.click();
  }

  async executeWorkflow(steps, variables = {}, metadata = {}) {
    const browser = await chromium.launch({
      headless: false,
      args: ['--window-size=1440,1000']
    });
    const context = await browser.newContext({
      viewport: null
    });
    const page = await context.newPage();
    const closeDelayMs = Number(process.env.PLAYWRIGHT_CLOSE_DELAY_MS || 5000);

    console.log(`\x1b[32mStarting workflow execution with ${steps.length} steps...\x1b[0m`);

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      console.log(
        `\x1b[36m[Step ${step.stepOrder}] ${step.actionType} ${step.selector || step.url || ''}\x1b[0m`
      );
      if (step.explanation) {
        console.log(`\x1b[90mExplanation: ${step.explanation}\x1b[0m`);
      }

      if (step.actionType === 'navigation') {
        await page.goto(step.url);
        await this.disableTeachingConsole(page);
        await this.notifyAssistant(page, {
          selector: 'body',
          mode: 'executing',
          spotlight: false,
          message: `Abri ${step.label || step.url || 'la pagina del workflow'}.`
        });
        await this.waitBetweenSteps(page, this.stepDelayMs + 80);
        continue;
      }

      if (step.url && page.url() !== step.url) {
        await page.goto(step.url);
        await this.disableTeachingConsole(page);
        await this.notifyAssistant(page, {
          selector: 'body',
          mode: 'executing',
          spotlight: false,
          message: `Cambie a ${step.label || step.url || 'la siguiente pagina'}.`
        });
        await this.waitBetweenSteps(page, this.stepDelayMs + 80);
      }

      if (step.actionType === 'click') {
        await this.notifyAssistant(page, {
          selector: step.selector,
          label: step.label,
          mode: 'executing',
          message: `Estoy interactuando con ${step.label || step.selector || 'este control'}.`
        });
        await this.clickWithRecovery(page, step, {
          workflowId: metadata.workflowId || '',
          optionGuesser: metadata.optionGuesser,
          currentUrl: page.url(),
          currentStep: {
            stepOrder: step.stepOrder,
            selector: step.selector,
            label: step.label,
            explanation: step.explanation
          },
          upcomingSteps: steps.slice(index, index + 6).map((candidate) => ({
            stepOrder: candidate.stepOrder,
            actionType: candidate.actionType,
            selector: candidate.selector,
            label: candidate.label,
            explanation: candidate.explanation
          }))
        });
        await this.waitBetweenSteps(page);
        continue;
      }

      if (step.actionType === 'input') {
        const variableName = `input_${step.stepOrder}`;
        const nextValue = Object.prototype.hasOwnProperty.call(variables, variableName)
          ? variables[variableName]
          : step.value;
        await this.notifyAssistant(page, {
          selector: step.selector,
          label: step.label,
          mode: 'executing',
          message: `Estoy completando ${step.label || step.selector || 'este campo'}.`
        });
        await this.applyInputAction(page, step, nextValue);
        await this.waitBetweenSteps(page);
        continue;
      }

      if (step.actionType === 'select') {
        const variableName = `input_${step.stepOrder}`;
        const nextValue = Object.prototype.hasOwnProperty.call(variables, variableName)
          ? variables[variableName]
          : step.selectedValue || step.selectedLabel || step.value;
        await this.notifyAssistant(page, {
          selector: step.selector,
          label: step.label,
          mode: 'executing',
          message: `Estoy eligiendo una opcion en ${step.label || step.selector || 'este selector'}.`
        });
        await this.applySelectAction(page, step, nextValue);
        await this.waitBetweenSteps(page);
        continue;
      }

      console.warn(`\x1b[33mSkipping unsupported action type: ${step.actionType}\x1b[0m`);
    }

    console.log(`\x1b[90mWorkflow finished. Keeping browser open for ${closeDelayMs}ms.\x1b[0m`);
    await page.waitForTimeout(closeDelayMs);
    await browser.close();
    console.log('\x1b[32mWorkflow completed.\x1b[0m');
  }
}

module.exports = PlaywrightRunner;
