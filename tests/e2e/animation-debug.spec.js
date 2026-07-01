const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const SCREENSHOT_DIR = path.resolve(__dirname, "../../screenshots");

function ensureScreenshotDir() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function ignoredConsoleError(text) {
  return text.includes("Failed to load resource: the server responded with a status of 404");
}

function boxesOverlap(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

test("formal mode keeps fallback clean and HUD separated", async ({ page }) => {
  ensureScreenshotDir();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !ignoredConsoleError(msg.text())) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/index.html?test=1");
  await expect(page.locator("#debug-readout")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/debug-animation/);

  await page.locator('[data-action="play"]').click();
  await expect(page.locator("#hud")).toBeVisible();
  await page.evaluate(() => { window.Game.enemies = []; window.Game.spawnTimer = 999; });
  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyD");
  await expect.poll(() => page.evaluate(() => window.Animation.getAnimationState(window.Game.player))).toBe("walk_NE");
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "gameplay-normal-clean-fallback.png"), fullPage: false });

  const layout = await page.evaluate(() => {
    const read = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    return {
      tl: read(".hud-tl"),
      tc: read(".hud-tc"),
      tr: read(".hud-tr"),
      debugReadoutExists: !!document.querySelector("#debug-readout")
    };
  });
  expect(layout.debugReadoutExists).toBe(false);
  expect(boxesOverlap(layout.tl, layout.tc)).toBe(false);
  expect(boxesOverlap(layout.tc, layout.tr)).toBe(false);
  expect(boxesOverlap(layout.tl, layout.tr)).toBe(false);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "hud-fixed.png"), fullPage: false });
  expect(errors).toEqual([]);
});

test("debugAnimation validates 8-direction player and enemy fallback states", async ({ page }) => {
  ensureScreenshotDir();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !ignoredConsoleError(msg.text())) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/index.html?test=1&debugAnimation=1");
  await expect(page.locator("#screen-menu")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/debug-animation/);
  await expect(page.locator("#debug-readout")).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "home-simplified.png"), fullPage: false });

  const directionMap = await page.evaluate(() => ({
    N: window.getDirectionFromVector(0, -1),
    NE: window.getDirectionFromVector(1, -1),
    E: window.getDirectionFromVector(1, 0),
    SE: window.getDirectionFromVector(1, 1),
    S: window.getDirectionFromVector(0, 1),
    SW: window.getDirectionFromVector(-1, 1),
    W: window.getDirectionFromVector(-1, 0),
    NW: window.getDirectionFromVector(-1, -1)
  }));
  expect(directionMap).toEqual({
    N: "N",
    NE: "NE",
    E: "E",
    SE: "SE",
    S: "S",
    SW: "SW",
    W: "W",
    NW: "NW"
  });

  const aliases = await page.evaluate(() => ({
    solar: window.GameData.getCharacter("solar_engineer").id,
    cigarette: window.GameData.getEnemy("cigarette_bug").id,
    oil: window.GameData.getEnemy("oil_boss").id
  }));
  expect(aliases).toEqual({ solar: "solar", cigarette: "butt_bug", oil: "oil_blob" });

  await page.locator('[data-action="play"]').click();
  await expect(page.locator("#hud")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#overlay-pause")).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "pause-fixed-ratio.png"), fullPage: false });
  await page.keyboard.press("Escape");
  await expect(page.locator("#overlay-pause")).toBeHidden();

  const cases = [
    { dir: "N", keys: ["KeyW"], vx: 0, vy: -1 },
    { dir: "NE", keys: ["KeyW", "KeyD"], vx: 0.707, vy: -0.707 },
    { dir: "E", keys: ["KeyD"], vx: 1, vy: 0 },
    { dir: "SE", keys: ["KeyS", "KeyD"], vx: 0.707, vy: 0.707 },
    { dir: "S", keys: ["KeyS"], vx: 0, vy: 1 },
    { dir: "SW", keys: ["KeyS", "KeyA"], vx: -0.707, vy: 0.707 },
    { dir: "W", keys: ["KeyA"], vx: -1, vy: 0 },
    { dir: "NW", keys: ["KeyW", "KeyA"], vx: -0.707, vy: -0.707 }
  ];
  const directionResults = [];
  for (const item of cases) {
    await page.evaluate(() => { window.Game.enemies = []; window.Game.spawnTimer = 999; });
    for (const key of item.keys) await page.keyboard.down(key);
    await expect.poll(() => page.evaluate(() => window.Animation.getAnimationState(window.Game.player))).toBe(`walk_${item.dir}`);
    await page.waitForTimeout(80);
    directionResults.push(await page.evaluate(() => {
      const animator = window.Game.player.animator;
      const resolved = animator.resolveSprite();
      const info = animator.getRenderInfo(resolved);
      return {
        direction: info.direction,
        action: info.action,
        frameName: info.frameName,
        requestedKey: info.requestedKey,
        resolvedKey: info.resolvedKey,
        spriteKey: info.spriteKey,
        hasSprite: info.hasSprite,
        fallback: info.fallback,
        fallbackType: info.fallbackType,
        flipX: info.flipX,
        inputVx: Math.round(info.inputVx * 1000) / 1000,
        inputVy: Math.round(info.inputVy * 1000) / 1000
      };
    }));
    for (const key of [...item.keys].reverse()) await page.keyboard.up(key);
    await page.waitForTimeout(40);
  }
  expect(directionResults.map((item) => item.direction)).toEqual(cases.map((item) => item.dir));
  expect(directionResults.every((item) => item.action === "walk")).toBe(true);
  expect(directionResults.every((item) => item.frameName.startsWith(`walk_${item.direction}_`))).toBe(true);
  expect(directionResults.every((item) => item.requestedKey.includes(`walk_${item.direction}_`))).toBe(true);
  expect(directionResults.every((item) => typeof item.fallbackType === "string" && item.fallbackType.length > 0)).toBe(true);
  expect(directionResults.every((item) => item.hasSprite || (item.fallback && item.fallbackType === "diagnostic"))).toBe(true);

  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyD");
  await expect.poll(() => page.evaluate(() => window.Animation.getAnimationState(window.Game.player))).toBe("walk_NE");
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "gameplay-debug-animation.png"), fullPage: false });
  await page.keyboard.up("KeyW");
  await page.keyboard.up("KeyD");

  await page.evaluate(() => {
    const g = window.Game;
    g.enemies = [];
    const def = window.GameData.getEnemy("plastic_bag");
    const e = new window.Enemy(def, g.player.x - 90, g.player.y + 90, 1);
    g.enemies.push(e);
  });
  await page.waitForTimeout(450);
  await expect.poll(() => page.evaluate(() => window.Game.enemies[0].animator.state())).toBe("move_NE");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "enemy-animation-debug.png"), fullPage: false });

  const debugState = await page.evaluate(() => {
      const audit = window.Debug.auditAnimations();
      const records = window.Debug.getAnimationRecords();
      return {
        hasPlayer: records.some((r) => r.entityType === "Player"),
        hasEnemy: records.some((r) => r.entityType === "Enemy"),
        playerState: window.Animation.getAnimationState(window.Game.player),
        enemyState: window.Game.enemies[0].animator.state(),
      fallbackCount: audit.fallbackCount,
      enemyIds: Object.keys(window.GameData.enemies)
    };
  });
  expect(debugState.hasPlayer).toBe(true);
  expect(debugState.hasEnemy).toBe(true);
  expect(debugState.enemyState).toBe("move_NE");
  expect(debugState.fallbackCount).toBeGreaterThanOrEqual(0);
  expect(debugState.enemyIds).toEqual(["plastic_bag", "butt_bug", "battery_slime", "oil_blob"]);
  expect(errors).toEqual([]);
});
