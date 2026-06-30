const { test, expect } = require("@playwright/test");

const SAVE_KEY = "senloop_save_v1";

async function openGame(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/index.html?test=1");
  await expect(page.locator("#screen-menu")).toBeVisible();
  await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
  await page.reload();
  await expect(page.locator("#screen-menu")).toBeVisible();
  return errors;
}

async function startRun(page, characterName) {
  await page.locator('[data-action="characters"]').click();
  await expect(page.locator("#screen-characters")).toBeVisible();
  await page.getByText(characterName).click();
  await page.locator("#confirm-character").click();
  await expect(page.locator("#hud")).toBeVisible();
  await page.waitForFunction(() => window.__TEST__ && window.__TEST__.getState().running);
}

test("首頁可以載入且沒有 console error", async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.locator(".game-title")).toContainText("森循島");
  await expect(page.locator('[data-action="play"]')).toContainText("開始遊戲");
  const canvasBox = await page.locator("#game-canvas").boundingBox();
  expect(canvasBox.width).toBeGreaterThan(300);
  expect(canvasBox.height).toBeGreaterThan(200);
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  expect(errors).toEqual([]);
});

test("正式模式不套用測試模式調整", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#screen-menu")).toBeVisible();

  const state = await page.evaluate(() => ({
    testEnabled: window.TestMode && window.TestMode.enabled,
    hasTestHelpers: !!window.__TEST__,
    duration: window.GameData.getStage("tidal_flat").duration
  }));

  expect(state.testEnabled).toBe(false);
  expect(state.hasTestHelpers).toBe(false);
  expect(state.duration).toBe(300);
});

test("主選單按鈕可以切換角色、商店、圖鑑畫面並返回", async ({ page }) => {
  await openGame(page);

  await page.locator('[data-action="characters"]').click();
  await expect(page.locator("#screen-characters")).toBeVisible();
  await expect(page.locator(".char-card")).toHaveCount(3);
  await page.locator('#screen-characters [data-action="back"]').click();
  await expect(page.locator("#screen-menu")).toBeVisible();

  await page.locator('[data-action="shop"]').click();
  await expect(page.locator("#screen-shop")).toBeVisible();
  await expect(page.locator(".shop-item")).toHaveCount(5);
  await expect(page.locator("#shop-coins")).toHaveText("0");
  await page.locator('#screen-shop [data-action="back"]').click();
  await expect(page.locator("#screen-menu")).toBeVisible();

  await page.locator('[data-action="codex"]').click();
  await expect(page.locator("#screen-codex")).toBeVisible();
  await expect(page.locator(".codex-item")).toHaveCount(5);
  await page.locator('#screen-codex [data-action="back"]').click();
  await expect(page.locator("#screen-menu")).toBeVisible();
});

test("三個角色資料正確，選角後可以進入第一關且被動有差異", async ({ page }) => {
  await openGame(page);

  const stats = await page.evaluate(() => {
    const meta = {};
    const ranger = new window.Player(window.GameData.getCharacter("ranger"), meta);
    const beach = new window.Player(window.GameData.getCharacter("beachcomber"), meta);
    const solar = new window.Player(window.GameData.getCharacter("solar"), meta);
    return {
      ranger: { maxHp: ranger.maxHp, pickupRange: ranger.pickupRange, cooldownMult: ranger.cooldownMult },
      beach: { maxHp: beach.maxHp, pickupRange: beach.pickupRange, cooldownMult: beach.cooldownMult },
      solar: { maxHp: solar.maxHp, pickupRange: solar.pickupRange, cooldownMult: solar.cooldownMult }
    };
  });

  expect(stats.ranger.maxHp).toBeGreaterThan(stats.beach.maxHp);
  expect(stats.beach.pickupRange).toBeGreaterThan(stats.ranger.pickupRange);
  expect(stats.solar.cooldownMult).toBeLessThan(stats.ranger.cooldownMult);

  await page.locator('[data-action="characters"]').click();
  await expect(page.getByText("森林巡守員")).toBeVisible();
  await expect(page.getByText("海岸淨灘者")).toBeVisible();
  await expect(page.getByText("太陽能工程師")).toBeVisible();
  await page.getByText("海岸淨灘者").click();
  await expect.poll(() => page.evaluate(() => window.App.selectedChar)).toBe("beachcomber");
  await page.locator("#confirm-character").click();
  await expect(page.locator("#hud")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__TEST__.getState().player.weapons[0].id)).toBe("recycle_net");
});

test("第一關可移動、生成敵人、自動攻擊、拾取經驗並完成升級流程", async ({ page }) => {
  await openGame(page);
  await startRun(page, "森林巡守員");

  const before = await page.evaluate(() => window.__TEST__.getState().player.x);
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(450);
  await page.keyboard.up("KeyD");
  const after = await page.evaluate(() => window.__TEST__.getState().player.x);
  expect(after).toBeGreaterThan(before);

  const clamped = await page.evaluate(() => {
    const g = window.Game;
    g.player.x = -100;
    g.player.y = -100;
    g.player.update(0.016, g.world);
    return { x: g.player.x, y: g.player.y, radius: g.player.radius };
  });
  expect(clamped.x).toBeGreaterThanOrEqual(clamped.radius);
  expect(clamped.y).toBeGreaterThanOrEqual(clamped.radius);

  await page.waitForFunction(() => window.__TEST__.getState().enemies > 0);
  await expect.poll(() => page.evaluate(() => window.__TEST__.getState().enemies)).toBeGreaterThan(0);

  await page.evaluate(() => {
    const g = window.Game;
    g.player.x = g.world.w / 2;
    g.player.y = g.world.h / 2;
    g.updateCamera();
    g.enemies = [];
    g.projectiles = [];
    g.pickups = [];
    const def = window.GameData.getEnemy("plastic_bag");
    const enemy = new window.Enemy(def, g.player.x + 42, g.player.y, 1);
    enemy.hp = 1;
    enemy.maxHp = 1;
    g.enemies.push(enemy);
    g.player.weapons[0].timer = 0;
  });
  await page.waitForFunction(() => window.Game.pickups.some((p) => p.type === "xp"), null, { timeout: 5000 });

  await page.evaluate(() => {
    const g = window.Game;
    g.pickups.push(new window.Pickup("xp", g.player.x, g.player.y, g.player.xpToNext));
  });
  await expect(page.locator("#overlay-levelup")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.Game.paused)).toBe(true);

  await page.locator(".levelup-card").first().click();
  await expect(page.locator("#overlay-levelup")).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.Game.paused)).toBe(false);
});

test("Boss 事件與圖鑑解鎖可在測試模式快速驗證並保存", async ({ page }) => {
  await openGame(page);
  await startRun(page, "森林巡守員");

  await page.evaluate(() => { window.Game.time = 20.01; });
  await page.waitForFunction(() => window.Game.enemies.some((e) => e.id === "oil_blob"));

  const unlocked = await page.evaluate(() => window.__TEST__.unlockKnowledge().id);
  expect(unlocked).toBe("k_plastic");

  await page.evaluate(() => {
    window.Game.stop();
    window.App.showScreen("menu");
    window.App.ui.updateCoinLabels();
  });
  await page.locator('[data-action="codex"]').click();
  await expect(page.locator("#screen-codex")).toBeVisible();
  await expect(page.getByText("塑膠袋與海洋")).toBeVisible();

  await page.reload();
  await page.locator('[data-action="codex"]').click();
  await expect(page.getByText("塑膠袋與海洋")).toBeVisible();
});

test("商店購買會扣循環幣並保存到 localStorage", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__TEST__.grantCoins(500));
  await page.locator('[data-action="shop"]').click();
  await expect(page.locator("#screen-shop")).toBeVisible();

  await page.locator(".shop-item").first().locator("button").click();

  const save = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  expect(save.coins).toBe(460);
  expect(save.shop.healthy_soil).toBe(1);

  await page.reload();
  await expect(page.locator("#screen-menu")).toBeVisible();
  await expect(page.locator("#menu-coins")).toHaveText("460");
});

test("測試模式可快速進入勝利與失敗結算", async ({ page }) => {
  await openGame(page);
  await startRun(page, "太陽能工程師");
  await page.evaluate(() => { window.Game.time = window.Game.stage.duration - 0.01; });
  await expect(page.locator("#screen-victory")).toBeVisible({ timeout: 3000 });
  const afterWin = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  expect(afterWin.coins).toBeGreaterThan(0);

  await page.goto("/index.html?test=1");
  await startRun(page, "森林巡守員");
  await page.evaluate(() => { window.Game.player.hp = 0; });
  await expect(page.locator("#screen-gameover")).toBeVisible({ timeout: 3000 });
});
