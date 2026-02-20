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

    await page.waitForSelector('text=WORK ORDERS', { timeout: 15000 });
    await page.waitForSelector('text=SYNC ACTIVITY', { timeout: 10000 });
    await page.waitForSelector('text=CONFLICT INBOX', { timeout: 10000 });
    result.checks.push('Core sections rendered');

    const desktopShot = '/tmp/workorders-e2e-desktop.png';
    await page.screenshot({ path: desktopShot, fullPage: true });
    result.screenshots.push(desktopShot);

    const networkToggle = page.getByRole('button', { name: /Go Offline|Reconnect/i });
    await networkToggle.click();
    await page.waitForSelector('text=Offline', { timeout: 10000 });
    result.checks.push('Offline toggle works');

    await networkToggle.click();
    await page.waitForSelector('text=Online', { timeout: 10000 });
    result.checks.push('Reconnect toggle works');

    await page.getByRole('button', { name: 'Manager View' }).click();
    await page.waitForSelector('text=Role: manager', { timeout: 10000 });
    result.checks.push('Manager role switch works');

    await page.getByRole('button', { name: 'Tech View' }).click();
    await page.waitForSelector('text=Role: tech', { timeout: 10000 });
    result.checks.push('Tech role switch works');

    const aboutResponse = await page.goto(`${TARGET_URL}/about`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    if (!aboutResponse || aboutResponse.status() >= 400) {
      fail(`About route failed: ${aboutResponse ? aboutResponse.status() : 'none'}`);
    }
    await page.waitForSelector('text=Offline Work Order Board Demo', { timeout: 10000 });
    result.checks.push('About route renders');

    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const workOrderButtons = page.locator('aside button');
    let count = 0;
    for (let i = 0; i < 20; i++) {
      count = await workOrderButtons.count();
      if (count > 0) break;
      await page.waitForTimeout(500);
    }
    if (count > 0) {
      await workOrderButtons.first().click();
      await page.waitForSelector('text=Work Order Detail', { timeout: 10000 });
      result.checks.push(`Work order selection works (${count} listed)`);

      const saveButton = page.getByRole('button', { name: 'Save Fields' });
      await saveButton.click();
      result.checks.push('Save fields action callable');
    } else {
      result.warnings.push('No work orders were synced; mutation-path checks were limited.');
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    const mobileShot = '/tmp/workorders-e2e-mobile.png';
    await page.screenshot({ path: mobileShot, fullPage: true });
    result.screenshots.push(mobileShot);
    result.checks.push('Mobile rendering captured');

    console.log('E2E_RESULTS_START');
    console.log(JSON.stringify(result, null, 2));
    console.log('E2E_RESULTS_END');
  } catch (error) {
    const failShot = '/tmp/workorders-e2e-failure.png';
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
