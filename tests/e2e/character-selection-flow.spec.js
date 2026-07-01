const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const SAVE_KEY = "senloop_save_v1";
const SCREENSHOT_DIR = path.resolve(__dirname, "../../test-results/screenshots");

function ensureScreenshotDir() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function openFreshGame(page) {
  await page.goto("/index.html?test=1");
  await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
  await page.reload();
  await expect(page.locator("#screen-menu")).toBeVisible();
  await expect.poll(
    () => page.evaluate(() => document.getElementById("game-root")?.classList.contains("has-ui-buttons")),
    { message: "UI button skin is ready" }
  ).toBe(true);
}

async function expectHomeCharacter(page, id, name) {
  await expect(page.locator("#home-character-preview")).toHaveAttribute("data-character-id", id);
  await expect(page.locator("#home-character-name")).toHaveText(name);
}

test("character select uses candidate selection and only confirms on button press", async ({ page }) => {
  ensureScreenshotDir();
  await openFreshGame(page);

  await expectHomeCharacter(page, "ranger", "森林巡守員");
  await expect.poll(() => page.evaluate(() => window.App.selectedCharacterId)).toBe("ranger");

  await page.locator('[data-action="characters"]').click();
  await expect(page.locator("#screen-characters")).toBeVisible();
  await expect(page.locator("#confirm-character")).toHaveText(/確定/);

  await page.getByText("海岸淨灘者").click();
  await expect.poll(() => page.evaluate(() => window.App.candidateCharacterId)).toBe("beachcomber");
  await expect.poll(() => page.evaluate(() => window.App.selectedCharacterId)).toBe("ranger");
  await expect(page.locator('.char-card.selected[data-id="beachcomber"]')).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "character-select-selected.png"), fullPage: false });

  await page.locator('#screen-characters [data-action="back"]').click();
  await expect(page.locator("#screen-menu")).toBeVisible();
  await expectHomeCharacter(page, "ranger", "森林巡守員");
  await expect.poll(() => page.evaluate(() => window.App.selectedCharacterId)).toBe("ranger");

  await page.locator('[data-action="characters"]').click();
  await expect(page.locator("#screen-characters")).toBeVisible();
  await page.getByText("太陽能工程師").click();
  await expect.poll(() => page.evaluate(() => window.App.candidateCharacterId)).toBe("solar");
  await page.locator("#confirm-character").click();
  await expect(page.locator("#screen-menu")).toBeVisible();
  await expectHomeCharacter(page, "solar", "太陽能工程師");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "home-after-confirm.png"), fullPage: false });

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  expect(saved.selectedCharacterId).toBe("solar");
  expect(saved.lastChar).toBe("solar");

  await page.reload();
  await expect(page.locator("#screen-menu")).toBeVisible();
  await expectHomeCharacter(page, "solar", "太陽能工程師");
});
