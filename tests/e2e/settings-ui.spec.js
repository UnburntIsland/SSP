const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const SCREENSHOT_DIR = path.resolve(__dirname, "../../test-results/screenshots");

function ensureScreenshotDir() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function assertSettingsLayout(page, label) {
  const result = await page.evaluate(() => window.validateSettingsLayout && window.validateSettingsLayout());
  expect(result, `${label}: settings layout validator is available`).toBeTruthy();
  expect(result.ok, `${label}: ${result.errors.join("\n")}`).toBe(true);

  const { panel, rows, backButton } = result.layout;
  expect(rows.master.label.x, `${label}: master label left inset`).toBeGreaterThan(panel.x + 60);
  expect(rows.music.slider.x, `${label}: music slider inside panel`).toBeGreaterThanOrEqual(panel.x);
  expect(rows.sfx.slider.right, `${label}: sfx slider inside panel`).toBeLessThanOrEqual(panel.right);
  expect(rows.master.value.right, `${label}: master value right inset`).toBeLessThan(panel.right - 30);
  expect(backButton.x, `${label}: back button on canvas`).toBeGreaterThanOrEqual(0);
  expect(backButton.right, `${label}: back button on canvas`).toBeLessThanOrEqual(1280);
  expect(Math.abs((backButton.x + backButton.width / 2) - (panel.x + panel.width / 2)), `${label}: back button centered`).toBeLessThanOrEqual(2);

  const sliderXs = [rows.master.slider.x, rows.music.slider.x, rows.sfx.slider.x];
  const sliderRights = [rows.master.slider.right, rows.music.slider.right, rows.sfx.slider.right];
  const valueRights = [rows.master.value.right, rows.music.value.right, rows.sfx.value.right];
  for (const x of sliderXs) expect(Math.abs(x - sliderXs[0]), `${label}: slider left aligned`).toBeLessThanOrEqual(1);
  for (const x of sliderRights) expect(Math.abs(x - sliderRights[0]), `${label}: slider right aligned`).toBeLessThanOrEqual(1);
  for (const x of valueRights) expect(Math.abs(x - valueRights[0]), `${label}: values right aligned`).toBeLessThanOrEqual(1);
  expect(Math.abs(rows.mute.label.x - rows.master.label.x), `${label}: mute label aligned`).toBeLessThanOrEqual(1);

  return result.layout;
}

test("settings UI uses one aligned layout from home and pause", async ({ page }) => {
  ensureScreenshotDir();

  await page.goto("/index.html?test=1");
  await expect(page.locator("#screen-menu")).toBeVisible();
  await page.locator('[data-action="settings-home"]').click();
  await expect(page.locator("#screen-settings")).toBeVisible();
  const homeLayout = await assertSettingsLayout(page, "home settings");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "home-settings.png"), fullPage: false });

  await page.goto("/index.html?test=1");
  await page.locator('[data-action="play"]').click();
  await expect(page.locator("#hud")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#overlay-pause")).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "pause-menu.png"), fullPage: false });
  await page.locator('[data-action="settings-pause"]').click();
  await expect(page.locator("#screen-settings")).toBeVisible();
  const pauseLayout = await assertSettingsLayout(page, "pause settings");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "pause-settings.png"), fullPage: false });

  expect(homeLayout.sharedRenderer).toBe(true);
  expect(pauseLayout.sharedRenderer).toBe(true);
  expect(Math.abs(homeLayout.panel.x - pauseLayout.panel.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(homeLayout.rows.master.slider.x - pauseLayout.rows.master.slider.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(homeLayout.backButton.x - pauseLayout.backButton.x)).toBeLessThanOrEqual(1);
});

test("debugUI exposes settings layout guides", async ({ page }) => {
  await page.goto("/index.html?test=1&debugUI=1");
  await expect(page.locator("body")).toHaveClass(/debug-ui/);
  await page.locator('[data-action="settings-home"]').click();
  await expect(page.locator("#debug-readout")).toBeVisible();
  await assertSettingsLayout(page, "debug settings");
});
