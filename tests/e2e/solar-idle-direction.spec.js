const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const SPRITE_DIR = path.join(ROOT, "assets/images/characters/solar_engineer");
const SCREENSHOT_DIR = path.join(ROOT, "screenshots");
const IDLE_FILES = [
  "idle_N_0.png",
  "idle_NE_0.png",
  "idle_E_0.png",
  "idle_SE_0.png",
  "idle_S_0.png",
  "idle_SW_0.png",
  "idle_W_0.png",
  "idle_NW_0.png",
];

function ensureScreenshotDir() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function missingIdleFiles() {
  return IDLE_FILES.filter((file) => !fs.existsSync(path.join(SPRITE_DIR, file)));
}

function ignoredConsoleError(text) {
  return text.includes("Failed to load resource: the server responded with a status of 404");
}

async function selectSolarAndStart(page, url) {
  await page.goto(url);
  await page.evaluate(() => window.App.saveSelectedCharacter("solar"));
  await page.locator('[data-action="play"]').click();
  await expect(page.locator("#hud")).toBeVisible();
  await page.evaluate(() => {
    window.Game.enemies = [];
    window.Game.spawnAcc = -999;
  });
}

async function holdDirectionAndRead(page, keys, dir) {
  await page.keyboard.up("KeyW").catch(() => {});
  await page.keyboard.up("KeyA").catch(() => {});
  await page.keyboard.up("KeyS").catch(() => {});
  await page.keyboard.up("KeyD").catch(() => {});
  for (const key of keys) await page.keyboard.down(key);
  await expect.poll(() => page.evaluate(() => window.Animation.getAnimationState(window.Game.player))).toBe(`walk_${dir}`);
  await expect.poll(() => page.evaluate((expectedDir) => {
    const animator = window.Game.player.animator;
    const resolved = animator.resolveSprite();
    const info = animator.getRenderInfo(resolved);
    return {
      direction: info.direction,
      hasSprite: info.hasSprite,
      fallbackType: info.fallbackType,
      resolvedKey: info.resolvedKey,
      requestedKey: info.requestedKey,
    };
  }, dir)).toMatchObject({
    direction: dir,
    hasSprite: true,
    fallbackType: "idle-direction",
    resolvedKey: `canim_solar_engineer_idle_${dir}_0`,
  });
  return page.evaluate(() => {
    const animator = window.Game.player.animator;
    const resolved = animator.resolveSprite();
    return animator.getRenderInfo(resolved);
  });
}

test("solar engineer uses 8-direction idle sprites while walk sprites are missing", async ({ page }) => {
  ensureScreenshotDir();
  const missing = missingIdleFiles();
  test.skip(missing.length > 0, `Missing solar idle PNGs: ${missing.join(", ")}`);

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !ignoredConsoleError(msg.text())) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await selectSolarAndStart(page, "/index.html?test=1");
  await expect(page.locator("#debug-readout")).toHaveCount(0);

  const cases = [
    { dir: "N", keys: ["KeyW"] },
    { dir: "NE", keys: ["KeyW", "KeyD"] },
    { dir: "E", keys: ["KeyD"] },
    { dir: "SE", keys: ["KeyS", "KeyD"] },
    { dir: "S", keys: ["KeyS"] },
    { dir: "SW", keys: ["KeyS", "KeyA"] },
    { dir: "W", keys: ["KeyA"] },
    { dir: "NW", keys: ["KeyW", "KeyA"] },
  ];

  const results = [];
  for (const item of cases) {
    results.push(await holdDirectionAndRead(page, item.keys, item.dir));
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "solar-idle-moving.png"), fullPage: false });
  await page.keyboard.up("KeyW");
  await page.keyboard.up("KeyA");
  await page.keyboard.up("KeyS");
  await page.keyboard.up("KeyD");
  await expect.poll(() => page.evaluate(() => window.Animation.getAnimationState(window.Game.player))).toBe("idle_NW");
  await expect.poll(() => page.evaluate(() => {
    const animator = window.Game.player.animator;
    const resolved = animator.resolveSprite();
    const info = animator.getRenderInfo(resolved);
    return {
      direction: info.direction,
      action: info.action,
      hasSprite: info.hasSprite,
      fallbackType: info.fallbackType,
      resolvedKey: info.resolvedKey,
    };
  })).toMatchObject({
    direction: "NW",
    action: "idle",
    hasSprite: true,
    fallbackType: "exact",
    resolvedKey: "canim_solar_engineer_idle_NW_0",
  });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "solar-idle-8dir-normal.png"), fullPage: false });

  expect(results.map((item) => item.direction)).toEqual(cases.map((item) => item.dir));
  expect(results.every((item) => item.hasSprite)).toBe(true);
  expect(results.every((item) => item.fallbackType === "idle-direction")).toBe(true);
  expect(errors).toEqual([]);
});

test("solar engineer idle sprites are visible in debugAnimation resolver output", async ({ page }) => {
  ensureScreenshotDir();
  const missing = missingIdleFiles();
  test.skip(missing.length > 0, `Missing solar idle PNGs: ${missing.join(", ")}`);

  await selectSolarAndStart(page, "/index.html?test=1&debugAnimation=1");
  await expect(page.locator("#debug-readout")).toBeVisible();

  const info = await holdDirectionAndRead(page, ["KeyW", "KeyD"], "NE");
  expect(info.hasSprite).toBe(true);
  expect(info.fallbackType).toBe("idle-direction");
  expect(info.requestedKey).toMatch(/^canim_solar_engineer_walk_NE_/);
  expect(info.resolvedKey).toBe("canim_solar_engineer_idle_NE_0");

  await expect(page.locator("#debug-readout")).toContainText("fallback");
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "solar-idle-8dir-debug.png"), fullPage: false });
});
