const { chromium } = require('playwright');

class PlaywrightRunner {
  async executeWorkflow(steps) {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    console.log(`\x1b[32mStarting workflow execution with ${steps.length} steps...\x1b[0m`);
    
    for (const step of steps) {
      console.log(`\x1b[36mNavigating to: ${step.url}\x1b[0m`);
      console.log(`\x1b[90mExplanation: ${step.explanation}\x1b[0m`);
      await page.goto(step.url);
      await page.waitForTimeout(2000); // Pause to see the action
    }
    
    await browser.close();
    console.log(`\x1b[32mWorkflow completed.\x1b[0m`);
  }
}

module.exports = PlaywrightRunner;
