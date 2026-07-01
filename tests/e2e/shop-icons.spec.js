const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const SAVE_KEY = "senloop_save_v1";
const SCREENSHOT_DIR = path.resolve(__dirname, "../../test-results/screenshots");

function ensureScreenshotDir() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

test("shop upgrade icons are mapped, aligned, and purchasable", async ({ page }) => {
  ensureScreenshotDir();

  await page.goto("/index.html?test=1");
  await expect(page.locator("#screen-menu")).toBeVisible();
  await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
  await page.reload();
  await expect(page.locator("#screen-menu")).toBeVisible();
  await page.evaluate(() => window.__TEST__.grantCoins(500));

  await page.locator('[data-action="shop"]').click();
  await expect(page.locator("#screen-shop")).toBeVisible();
  await expect(page.locator(".shop-item")).toHaveCount(5);
  await page.waitForTimeout(900);

  const state = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll("#shop-list .shop-item")).map((row) => {
      const icon = row.querySelector(".shop-icon").getBoundingClientRect();
      const frame = row.querySelector(".shop-icon-frame").getBoundingClientRect();
      const buy = row.querySelector(".shop-buy").getBoundingClientRect();
      const rect = row.getBoundingClientRect();
      return {
        id: row.dataset.shopId,
        iconKey: row.dataset.iconKey,
        row: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        icon: { x: icon.x, y: icon.y, width: icon.width, height: icon.height },
        frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
        buy: { x: buy.x, y: buy.y, width: buy.width, height: buy.height }
      };
    });
    const report = window.Assets.report()
      .filter((entry) => entry.key.indexOf("shop_") === 0)
      .map((entry) => ({ key: entry.key, ok: entry.ok, path: entry.path }));
    const manifest = Object.fromEntries(report.map((entry) => [
      entry.key,
      window.Assets.manifest[entry.key].paths.slice()
    ]));
    return {
      ids: window.GameData.shop.map((item) => item.id),
      items,
      report,
      manifest
    };
  });

  expect(state.ids).toEqual(["healthy_soil", "recycle_sort", "energy_saving", "eco_sense", "rainwater_harvest"]);
  expect(state.items.map((item) => item.iconKey)).toEqual(["shop_soil", "shop_recycle", "shop_energy", "shop_eco", "shop_rain"]);
  expect(state.report.every((entry) => entry.ok)).toBe(true);
  expect(state.manifest.shop_soil[0]).toBe("assets/images/shop/upgrade_healthy_soil.png");
  expect(state.manifest.shop_recycle[0]).toBe("assets/images/shop/upgrade_recycle_sort.png");
  expect(state.manifest.shop_energy[0]).toBe("assets/images/shop/upgrade_energy_saving.png");
  expect(state.manifest.shop_eco[0]).toBe("assets/images/shop/upgrade_eco_sense.png");
  expect(state.manifest.shop_rain[0]).toBe("assets/images/shop/upgrade_rainwater_harvest.png");
  expect(state.report.every((entry) => state.manifest[entry.key].length > 1)).toBe(true);

  const iconWidths = state.items.map((item) => item.icon.width);
  const iconHeights = state.items.map((item) => item.icon.height);
  const frameXs = state.items.map((item) => Math.round(item.frame.x));
  const buyXs = state.items.map((item) => Math.round(item.buy.x));
  const rowHeights = state.items.map((item) => item.row.height);
  expect(iconWidths.every((w) => Math.abs(w - 48) <= 1)).toBe(true);
  expect(iconHeights.every((h) => Math.abs(h - 48) <= 1)).toBe(true);
  expect(new Set(frameXs).size).toBe(1);
  expect(new Set(buyXs).size).toBe(1);
  expect(Math.max(...rowHeights) - Math.min(...rowHeights)).toBeLessThanOrEqual(2);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "shop-after-icons.png"), fullPage: false });

  await page.locator(".shop-item").first().locator("button").click();
  const save = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  expect(save.coins).toBe(460);
  expect(save.shop.healthy_soil).toBe(1);
});
