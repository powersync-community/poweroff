const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';

function fail(message) {
  throw new Error(message);
}

(async () => {
  const result = {
    mode: 'headless',
    url: TARGET_URL,
    checks: [],
    warnings: [],
    consoleErrors: [],
    screenshots: [],
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') result.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    result.consoleErrors.push(`pageerror: ${err.message}`);
  });

  try {
    const response = await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!response || response.status() >= 400) {
      fail(`Home page not reachable: status ${response ? response.status() : 'none'}`);
    }
    result.checks.push('Home route reachable');

    await page.waitForSelector('text=Offline Ticket Demo', { timeout: 15000 });
    await page.waitForSelector('text=Last Write Wins', { timeout: 10000 });
    result.checks.push('Strategy landing page renders');

    await page.getByRole('link', { name: 'Last Write Wins' }).first().click();
    await page.waitForSelector('text=Sync Activity', { timeout: 10000 });
    await page.waitForSelector('text=Pending queue:', { timeout: 10000 });
    result.checks.push('LWW route renders with core panels');

    const desktopShot = '/tmp/ticket-demo-e2e-desktop.png';
    await page.screenshot({ path: desktopShot, fullPage: true });
    result.screenshots.push(desktopShot);

    const networkToggle = page.getByRole('button', { name: /Online \(Go Offline\)|Offline \(Reconnect\)/i });
    await networkToggle.click();
    await page.waitForSelector('text=Offline (Reconnect)', { timeout: 10000 });
    result.checks.push('Offline toggle works');

    await networkToggle.click();
    await page.waitForSelector('text=Online (Go Offline)', { timeout: 10000 });
    result.checks.push('Reconnect toggle works');

    const ticketButtons = page.locator('aside button');
    let count = 0;
    for (let i = 0; i < 20; i++) {
      count = await ticketButtons.count();
      if (count > 0) break;
      await page.waitForTimeout(500);
    }

    if (count > 0) {
      await ticketButtons.first().click();
      await page.waitForSelector('text=Ticket Detail', { timeout: 10000 });
      result.checks.push(`Ticket selection works (${count} listed)`);

      const saveButton = page.getByRole('button', { name: 'Save Fields' });
      await saveButton.click();
      result.checks.push('Save fields action callable');
    } else {
      result.warnings.push('No tickets were synced; mutation-path checks were limited.');
    }

    await page.goto(`${TARGET_URL}/demo/crdt`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('text=Description (CRDT)', { timeout: 10000 });
    result.checks.push('CRDT route renders');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    const mobileShot = '/tmp/ticket-demo-e2e-mobile.png';
    await page.screenshot({ path: mobileShot, fullPage: true });
    result.screenshots.push(mobileShot);
    result.checks.push('Mobile rendering captured');

    console.log('E2E_RESULTS_START');
    console.log(JSON.stringify(result, null, 2));
    console.log('E2E_RESULTS_END');
  } catch (error) {
    const failShot = '/tmp/ticket-demo-e2e-failure.png';
    try {
      await page.screenshot({ path: failShot, fullPage: true });
      result.screenshots.push(failShot);
    } catch {
      // ignore screenshot failure
    }
    console.error(error);
    console.log('E2E_RESULTS_START');
    console.log(JSON.stringify(result, null, 2));
    console.log('E2E_RESULTS_END');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
