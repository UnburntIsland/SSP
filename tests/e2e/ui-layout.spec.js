const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const SCREENSHOT_DIR = path.resolve(__dirname, "../../test-results/screenshots");

function ensureScreenshotDir() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function waitForUiAssets(page) {
  await expect(page.locator("#screen-menu")).toBeVisible();
  await expect.poll(
    () => page.evaluate(() => document.getElementById("game-root")?.classList.contains("has-ui-buttons")),
    { message: "UI button image skin is applied" }
  ).toBe(true);
}

async function saveShot(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `after-${name}.png`), fullPage: false });
}

async function expectValidator(page, fnName, label) {
  const result = await page.evaluate((name) => window[name] && window[name](), fnName);
  expect(result, `${label}: validator exists`).toBeTruthy();
  expect(result.ok, `${label}: ${result.errors.join("\n")}`).toBe(true);
  return result.layout;
}

async function expectButtonLabelsReadable(page, scope, label) {
  const unreadable = await page.locator(`${scope} .btn-label`).evaluateAll((labels) =>
    labels
      .filter((el) => el.offsetParent !== null)
      .filter((el) => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== "visible")
      .map((el) => el.textContent.trim())
  );
  expect(unreadable, `${label}: button labels should not be clipped`).toEqual([]);
}

test("main UI screens are visually aligned and screenshot-ready", async ({ page }) => {
  ensureScreenshotDir();

  await page.goto("/index.html?test=1");
  await waitForUiAssets(page);
  await expectButtonLabelsReadable(page, "#screen-menu", "home");
  await saveShot(page, "home");

  await page.locator('[data-action="settings-home"]').click();
  await expect(page.locator("#screen-settings")).toBeVisible();
  await expectValidator(page, "validateSettingsLayout", "home settings");
  await expectButtonLabelsReadable(page, "#screen-settings", "home settings");
  await saveShot(page, "home-settings");

  await page.goto("/index.html?test=1");
  await waitForUiAssets(page);
  await page.locator('[data-action="characters"]').click();
  await expect(page.locator("#screen-characters")).toBeVisible();
  await expectValidator(page, "validateCharacterLayout", "character select");
  await expectButtonLabelsReadable(page, "#screen-characters", "character select");
  await saveShot(page, "character-select");

  await page.goto("/index.html?test=1");
  await waitForUiAssets(page);
  await page.locator('[data-action="play"]').click();
  await expect(page.locator("#hud")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#overlay-pause")).toBeVisible();
  const beforeHover = await page.locator('[data-action="settings-pause"]').boundingBox();
  await page.locator('[data-action="settings-pause"]').hover();
  const afterHover = await page.locator('[data-action="settings-pause"]').boundingBox();
  expect(Math.abs(beforeHover.x - afterHover.x), "pause hover keeps x alignment").toBeLessThanOrEqual(1);
  expect(Math.abs(beforeHover.y - afterHover.y), "pause hover keeps y alignment").toBeLessThanOrEqual(1);
  await expectValidator(page, "validatePauseLayout", "pause menu");
  await expectButtonLabelsReadable(page, "#overlay-pause", "pause menu");
  await saveShot(page, "pause-menu");

  await page.locator('[data-action="settings-pause"]').click();
  await expect(page.locator("#screen-settings")).toBeVisible();
  await expectValidator(page, "validateSettingsLayout", "pause settings");
  await saveShot(page, "pause-settings");

  await page.goto("/index.html?test=1");
  await waitForUiAssets(page);
  await page.locator('[data-action="play"]').click();
  await expect(page.locator("#hud")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#overlay-pause")).toBeVisible();
  await page.locator('[data-action="ask-home"]').click();
  await expect(page.locator("#overlay-confirm")).toBeVisible();
  await expectValidator(page, "validateConfirmLayout", "confirm home");
  await expectButtonLabelsReadable(page, "#overlay-confirm", "confirm home");
  await saveShot(page, "confirm-home");
});

test("debugUI exposes visible layout guides", async ({ page }) => {
  await page.goto("/index.html?test=1&debugUI=1");
  await waitForUiAssets(page);
  await expect(page.locator("body")).toHaveClass(/debug-ui/);
  await expect(page.locator("#debug-readout")).toBeVisible();
  await page.locator('[data-action="settings-home"]').click();
  await expect(page.locator("#screen-settings")).toBeVisible();
  await expectValidator(page, "validateVisibleUILayout", "debug visible UI");
});
