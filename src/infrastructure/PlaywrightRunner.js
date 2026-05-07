const { chromium } = require('playwright');

class PlaywrightRunner {
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
    if (!requested) {
      return { value: '' };
    }

    const options = await locator.evaluate((element) =>
      Array.from(element.options || []).map((option) => ({
        value: option.value,
        label: option.label,
        text: option.textContent || ''
      }))
    );

    const normalizedRequested = requested.toLowerCase();
    const exactValue = options.find((option) => option.value.toLowerCase() === normalizedRequested);
    if (exactValue) return { value: exactValue.value };

    const exactLabel = options.find((option) => option.label.toLowerCase() === normalizedRequested);
    if (exactLabel) return { label: exactLabel.label };

    const exactText = options.find((option) => option.text.trim().toLowerCase() === normalizedRequested);
    if (exactText) return { label: exactText.label || exactText.text.trim() };

    const partial = options.find((option) =>
      option.value.toLowerCase().includes(normalizedRequested) ||
      option.label.toLowerCase().includes(normalizedRequested) ||
      option.text.trim().toLowerCase().includes(normalizedRequested)
    );
    if (partial) {
      return { value: partial.value || undefined, label: partial.label || partial.text.trim() || undefined };
    }

    return { value: requested };
  }

  async applyInputAction(page, step, value) {
    const locator = this.resolveLocator(page, step);
    const tagName = await locator.evaluate((element) => element.tagName.toLowerCase());

    if (tagName === 'select') {
      const option = await this.resolveSelectOption(locator, value);
      await locator.selectOption(option);
      return;
    }

    await locator.fill(value || '');
  }

  async executeWorkflow(steps, variables = {}) {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
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
        continue;
      }

      if (step.url && page.url() !== step.url) {
        await page.goto(step.url);
        await this.disableTeachingConsole(page);
      }

      if (step.actionType === 'click') {
        await this.resolveLocator(page, step).click();
        continue;
      }

      if (step.actionType === 'input') {
        const variableName = `input_${step.stepOrder}`;
        const nextValue = Object.prototype.hasOwnProperty.call(variables, variableName)
          ? variables[variableName]
          : step.value;
        await this.applyInputAction(page, step, nextValue);
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
