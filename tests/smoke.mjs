import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "../tools/static-server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_FILE = path.join(ROOT, "output", "smoke-test-results.json");
const FAILURE_DIR = path.join(ROOT, "output", "smoke-failures");
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const TEST_TIMEOUT = 12_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function stopBrowserProcess(browserProcess) {
  if (!browserProcess || browserProcess.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2500);
    browserProcess.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    browserProcess.kill();
  });
}

async function removeProfile(profile) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await fs.rm(profile, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!["EBUSY", "EPERM", "ENOTEMPTY"].includes(error.code) || attempt === 5) throw error;
      await sleep(200 * (attempt + 1));
    }
  }
}

async function findBrowser() {
  const platform = os.platform();
  const chromePath = typeof process !== "undefined" ? process.env.CHROME_PATH : "";
  const candidates = [
    chromePath,
    platform === "win32" && "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    platform === "win32" && "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    platform === "win32" && "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    platform === "darwin" && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    platform === "darwin" && "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    platform === "linux" && "/usr/bin/google-chrome",
    platform === "linux" && "/usr/bin/google-chrome-stable",
    platform === "linux" && "/usr/bin/chromium",
    platform === "linux" && "/usr/bin/chromium-browser"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  throw new Error("找不到 Chrome、Chromium 或 Edge。可用 CHROME_PATH 指定瀏覽器執行檔。");
}

class CdpPipe {
  constructor(processHandle) {
    this.process = processHandle;
    this.writer = processHandle.stdio[3];
    this.reader = processHandle.stdio[4];
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();

    this.reader.on("data", (chunk) => this.onData(chunk));
    this.reader.on("error", (error) => this.rejectAll(error));
    processHandle.once("exit", (code) => {
      if (code !== 0 && this.pending.size) {
        this.rejectAll(new Error(`瀏覽器程序提前結束，exit code ${code}`));
      }
    });
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let separator;
    while ((separator = this.buffer.indexOf(0)) !== -1) {
      const raw = this.buffer.subarray(0, separator).toString("utf8");
      this.buffer = this.buffer.subarray(separator + 1);
      if (!raw) continue;
      const message = JSON.parse(raw);
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result || {});
        continue;
      }
      for (const listener of this.listeners) listener(message);
    }
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  send(method, params = {}, sessionId = null) {
    const id = this.nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      this.writer.write(`${JSON.stringify(message)}\0`);
    });
  }

  waitForEvent(method, sessionId, timeout = TEST_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error(`等待 ${method} 逾時`));
      }, timeout);
      const listener = (message) => {
        if (message.method !== method || (sessionId && message.sessionId !== sessionId)) return;
        clearTimeout(timer);
        this.listeners.delete(listener);
        resolve(message.params || {});
      };
      this.listeners.add(listener);
    });
  }
}

class SmokeBrowser {
  constructor(chrome, cdp, sessionId, baseUrl) {
    this.chrome = chrome;
    this.cdp = cdp;
    this.sessionId = sessionId;
    this.baseUrl = baseUrl;
    this.runtimeErrors = [];
    this.network404 = [];

    cdp.listeners.add((message) => {
      if (message.sessionId !== sessionId) return;
      if (message.method === "Runtime.exceptionThrown") {
        const details = message.params && message.params.exceptionDetails;
        this.runtimeErrors.push(details && (details.text || details.exception?.description) || "Runtime exception");
      }
      if (message.method === "Network.responseReceived" && message.params?.response?.status === 404) {
        this.network404.push(message.params.response.url);
      }
    });
  }

  async navigate(query = "") {
    const loaded = this.cdp.waitForEvent("Page.loadEventFired", this.sessionId);
    await this.cdp.send("Page.navigate", {
      url: `${this.baseUrl}/index.html${query ? `?${query}` : ""}`
    }, this.sessionId);
    await loaded;
    await this.waitFor("document.readyState === 'complete' && !!window.__TEST__", "測試 API 載入");
  }

  async evaluate(expression) {
    const result = await this.cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    }, this.sessionId);
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
      throw new Error(description || "頁面腳本執行失敗");
    }
    return result.result?.value;
  }

  async waitFor(expression, label, timeout = TEST_TIMEOUT) {
    const start = Date.now();
    let lastError = null;
    while (Date.now() - start < timeout) {
      try {
        if (await this.evaluate(`Boolean(${expression})`)) return;
      } catch (error) {
        lastError = error;
      }
      await sleep(80);
    }
    throw new Error(`${label}未在 ${timeout}ms 內完成${lastError ? `：${lastError.message}` : ""}`);
  }

  async click(selector, index = 0) {
    const result = await this.evaluate(`(() => {
      const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
      const node = nodes[${index}];
      if (!node) return { ok: false, reason: "missing" };
      if (node.disabled) return { ok: false, reason: "disabled" };
      node.click();
      return { ok: true };
    })()`);
    assert(result?.ok, `無法點擊 ${selector}：${result?.reason || "unknown"}`);
  }

  async prepare(query) {
    await this.navigate("test=1&qaSkipIntro=1");
    await this.evaluate("window.__TEST__.resetSave()");
    this.runtimeErrors.length = 0;
    this.network404.length = 0;
    await this.navigate(query);
  }

  async startFirstStage() {
    await this.waitFor("__TEST__.getState().screen === 'lobby'", "大廳顯示");
    await this.evaluate("App.openPortalSelect()");
    await this.waitFor("__TEST__.getState().screen === 'portal'", "傳送門畫面顯示");
    const portal = await this.evaluate(`(() => {
      const play = document.querySelector('#screen-portal [data-action="play"]');
      return {
        title: document.getElementById("portal-title")?.textContent || "",
        playEnabled: !!play && !play.disabled,
        stageId: App.selectedStageId
      };
    })()`);
    assert(portal.title.includes("台灣"), "正式台灣地圖入口未顯示");
    assert(portal.playEnabled, "第一關開始按鈕不應停用");
    assert(portal.stageId === "tidal_flat", "新存檔應選取第一關");
    await this.click('#screen-portal [data-action="play"]');
    await this.waitFor(
      "__TEST__.getState().screen === 'game' && __TEST__.getState().running && !__TEST__.getState().runIntroActive",
      "戰鬥開始"
    );
    await this.evaluate("Game.stage.waves = []; Game.stage.events = []; Game.enemies = []; true");
  }

  async setViewport(width, height, mobile = false) {
    await this.cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
      screenWidth: width,
      screenHeight: height
    }, this.sessionId);
  }

  async screenshot(filePath) {
    const result = await this.cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    }, this.sessionId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(result.data, "base64"));
  }
}

async function launchBrowser(executablePath) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "ssp-smoke-"));
  const browserProcess = spawn(executablePath, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-features=Translate",
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-gpu-rasterization",
    "--disable-gpu-sandbox",
    "--mute-audio",
    "--no-sandbox",
    "--no-default-browser-check",
    "--no-first-run",
    "--remote-debugging-pipe",
    `--user-data-dir=${profile}`,
    "about:blank"
  ], {
    stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"],
    windowsHide: true
  });

  let stderr = "";
  browserProcess.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  const cdp = new CdpPipe(browserProcess);

  try {
    const targets = await cdp.send("Target.getTargets");
    const pageTarget = targets.targetInfos.find((target) => target.type === "page");
    if (!pageTarget) throw new Error("找不到瀏覽器 page target");
    const attached = await cdp.send("Target.attachToTarget", {
      targetId: pageTarget.targetId,
      flatten: true
    });
    await Promise.all([
      cdp.send("Page.enable", {}, attached.sessionId),
      cdp.send("Runtime.enable", {}, attached.sessionId),
      cdp.send("Network.enable", {}, attached.sessionId)
    ]);
    return { browserProcess, cdp, sessionId: attached.sessionId, profile, stderr: () => stderr };
  } catch (error) {
    await stopBrowserProcess(browserProcess);
    try { await removeProfile(profile); } catch {}
    if (stderr.trim()) error.message += `\nChrome stderr:\n${stderr.trim()}`;
    throw error;
  }
}

export async function main() {
  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  const server = await startStaticServer({ root: ROOT, port: 0 });
  const executablePath = await findBrowser();
  const launched = await launchBrowser(executablePath);
  const browser = new SmokeBrowser(
    launched.browserProcess,
    launched.cdp,
    launched.sessionId,
    `http://${server.host}:${server.port}`
  );
  const results = [];

  const cases = [
    {
      name: "大廳 → 傳送門 → 戰鬥",
      run: async () => {
        await browser.prepare("test=1&duration=8&qaSkipIntro=1&seed=1001");
        await browser.startFirstStage();
        const state = await browser.evaluate("__TEST__.getState()");
        assert(state.stageId === "tidal_flat", "戰鬥關卡不是 tidal_flat");
      }
    },
    {
      name: "答題 → 升級 → 勝利",
      run: async () => {
        await browser.prepare("test=1&duration=8&qaSkipIntro=1&seed=1002");
        await browser.startFirstStage();
        assert(await browser.evaluate("__TEST__.forceLevelUp()"), "無法觸發升級");
        await browser.waitFor("document.querySelectorAll('.quiz-card').length >= 2", "永續問答顯示");
        const answer = await browser.evaluate("Game.quizOrder[Game.quizIndex - 1].answer");
        await browser.click(".quiz-card", answer);
        await browser.waitFor("!!document.querySelector('.quiz-continue')", "答題結果顯示");
        await browser.click(".quiz-continue");
        await browser.waitFor("document.querySelectorAll('#levelup-options .levelup-card').length >= 1", "升級選項顯示");
        await browser.click("#levelup-options .levelup-card", 0);
        await browser.waitFor("!UI.isLevelUpVisible() && !Game.paused", "升級完成");
        assert(await browser.evaluate("__TEST__.clearCurrentStage()"), "無法完成測試關卡");
        await browser.waitFor("__TEST__.getState().screen === 'victory'", "勝利結算顯示");
        const state = await browser.evaluate("__TEST__.getState()");
        assert(state.quizCorrect === 1, "答對題數未寫入當局統計");
        assert(state.save.clearedStages.includes("tidal_flat"), "勝利後未保存通關紀錄");
      }
    },
    {
      name: "失敗 → 重試",
      run: async () => {
        await browser.prepare("test=1&duration=8&qaSkipIntro=1&seed=1003");
        await browser.startFirstStage();
        await browser.evaluate("__TEST__.forceDefeat()");
        await browser.waitFor("__TEST__.getState().screen === 'gameover'", "失敗結算顯示");
        await browser.click('#screen-gameover [data-action="retry"]');
        await browser.waitFor(
          "__TEST__.getState().screen === 'game' && __TEST__.getState().running && !__TEST__.getState().runIntroActive",
          "重試後重新進入戰鬥"
        );
        assert(await browser.evaluate("__TEST__.getState().stageId === 'tidal_flat'"), "重試後關卡改變");
      }
    },
    {
      name: "存檔重設",
      run: async () => {
        await browser.prepare("test=1&qaSkipIntro=1&seed=1004");
        await browser.evaluate(`(() => {
          __TEST__.grantCoins(321);
          Storage.markStageCleared("tidal_flat");
          Storage.markEnemyEncountered("plastic_bag");
          Storage.getLobby().materials.recycled = 77;
          Storage.save();
          App.openSettings("home");
          return true;
        })()`);
        await browser.waitFor(
          "App.state === 'SETTINGS_FROM_HOME' && !document.getElementById('screen-settings').classList.contains('hidden')",
          "設定畫面顯示"
        );
        await browser.click("#settings-reset");
        await browser.waitFor("App.state === 'CONFIRM_RESET'", "重設確認視窗顯示");
        await browser.click("#confirm-ok");
        await browser.waitFor("__TEST__.getState().screen === 'lobby'", "重設後返回大廳");
        const save = await browser.evaluate("__TEST__.getState().save");
        assert(save.coins === 1_000_000, "重設後循環幣不是預設值");
        assert(save.selectedCharacterId === "ranger", "重設後角色不是 ranger");
        assert(save.clearedStages.length === 0, "重設後仍保留通關紀錄");
        assert(save.encounteredEnemies.length === 0, "重設後仍保留敵人圖鑑紀錄");
      }
    },
    {
      name: "大廳背景與固定裝置座標",
      run: async () => {
        await browser.prepare("test=1&qaSkipIntro=1&seed=1007");
        await browser.waitFor(
          "__TEST__.getState().lobby.world.backgroundWidth > 0",
          "大廳背景圖片載入"
        );
        const alignment = await browser.evaluate(`(() => {
          const state = __TEST__.getState().lobby;
          const migrated = Storage._normalizeLobby({
            version: 1,
            playerPosition: { x: 820, y: 500, direction: "S" },
            buildings: [{
              instanceId: "building-1",
              buildingId: "solar_workshop",
              x: 640,
              y: 416,
              rotation: 0,
              level: 1,
              placed: true
            }]
          });
          const oldSave = Storage._default();
          oldSave.schemaVersion = 5;
          oldSave.lobby.version = 1;
          oldSave.lobby.playerPosition = { x: 820, y: 500, direction: "S" };
          localStorage.setItem("senloop_save_v1", JSON.stringify(oldSave));
          Storage.data = null;
          Storage.load();
          const persistedLobbyVersion =
            JSON.parse(localStorage.getItem("senloop_save_v1")).lobby.version;
          return {
            world: state.world,
            fixed: {
              portal: { x: LobbyWorld.portal.x, y: LobbyWorld.portal.y },
              workbench: { x: LobbyWorld.workbench.x, y: LobbyWorld.workbench.y },
              idleZone: {
                x: LobbyWorld.idleZone.x,
                y: LobbyWorld.idleZone.y,
                w: LobbyWorld.idleZone.w,
                h: LobbyWorld.idleZone.h
              }
            },
            terrain: {
              polygonCount: LobbyWorld.walkablePolygons.length,
              portalApproach: LobbyWorld.circleInWalkable(800, 136, 15),
              workbenchApproach: LobbyWorld.circleInWalkable(370, 448, 15),
              recycleApproach: LobbyWorld.circleInWalkable(1250, 480, 15),
              reopenedClearing: LobbyWorld.circleInWalkable(700, 750, 15),
              lowerClearing: LobbyWorld.circleInWalkable(900, 760, 15),
              northwestBridge: LobbyWorld.circleInWalkable(480, 225, 15),
              northeastBridge: LobbyWorld.circleInWalkable(1140, 245, 15),
              southwestBridge: LobbyWorld.circleInWalkable(240, 720, 15),
              southeastTrail: LobbyWorld.circleInWalkable(1410, 760, 15),
              leftRiver: LobbyWorld.pointInWalkable(80, 500),
              rightRiver: LobbyWorld.pointInWalkable(1540, 500),
              upperRockWall: LobbyWorld.pointInWalkable(400, 200),
              lowerVegetation: LobbyWorld.pointInWalkable(1000, 850),
              upperIsland: LobbyWorld.pointInWalkable(1220, 110),
              northwestTree: LobbyWorld.pointInWalkable(460, 110),
              northeastTree: LobbyWorld.pointInWalkable(1260, 110),
              southwestWater: LobbyWorld.pointInWalkable(105, 760),
              southeastRocks: LobbyWorld.pointInWalkable(1440, 650),
              riverCollision: LobbyPlacement.resolveCircle(80, 500, 250, 500, 15, []),
              rockCollision: LobbyPlacement.resolveCircle(400, 200, 500, 300, 15, []),
              riverCollisionSafe: (() => {
                const p = LobbyPlacement.resolveCircle(80, 500, 250, 500, 15, []);
                return LobbyWorld.circleInWalkable(p.x, p.y, 15);
              })(),
              rockCollisionSafe: (() => {
                const p = LobbyPlacement.resolveCircle(400, 200, 500, 300, 15, []);
                return LobbyWorld.circleInWalkable(p.x, p.y, 15);
              })(),
              workbenchCollisionSafe: (() => {
                const p = LobbyPlacement.resolveCircle(
                  300, 458, 400, 458, 15, LobbyPlacement.collisionRects()
                );
                return p.x >= 367;
              })(),
              footAnchorSafe: (() => {
                const p = Lobby.resolveAvatarPosition(80, 470, 250, 470);
                return LobbyWorld.circleInWalkable(p.x, p.y + 30, 15);
              })()
            },
            unreachable: LobbyPlacement.checkReachability([], null),
            migratedVersion: migrated.version,
            migratedPlayerY: migrated.playerPosition.y,
            migratedBuildingY: migrated.buildings[0]?.y,
            persistedLobbyVersion
          };
        })()`);
        assert(alignment.world.width === 1600 && alignment.world.height === 1000,
          "大廳世界尺寸不是 1600x1000");
        assert(alignment.world.backgroundWidth === alignment.world.width &&
          alignment.world.backgroundHeight === alignment.world.height,
          "大廳底圖仍被縮放到不同長寬比");
        assert(
          alignment.fixed.portal.x === 800 && alignment.fixed.portal.y === 40 &&
          alignment.fixed.workbench.x === 300 && alignment.fixed.workbench.y === 448 &&
          alignment.fixed.idleZone.x === 1196 && alignment.fixed.idleZone.y === 379 &&
          alignment.fixed.idleZone.w === 224 && alignment.fixed.idleZone.h === 178,
          "傳送門、工作台或回收區未對齊背景預留平台"
        );
        assert(
          alignment.terrain.polygonCount === 11 &&
          alignment.terrain.portalApproach &&
          alignment.terrain.workbenchApproach &&
          alignment.terrain.recycleApproach &&
          alignment.terrain.reopenedClearing &&
          alignment.terrain.lowerClearing &&
          alignment.terrain.northwestBridge &&
          alignment.terrain.northeastBridge &&
          alignment.terrain.southwestBridge &&
          alignment.terrain.southeastTrail &&
          !alignment.terrain.leftRiver &&
          !alignment.terrain.rightRiver &&
          !alignment.terrain.upperRockWall &&
          !alignment.terrain.lowerVegetation &&
          !alignment.terrain.upperIsland &&
          !alignment.terrain.northwestTree &&
          !alignment.terrain.northeastTree &&
          !alignment.terrain.southwestWater &&
          !alignment.terrain.southeastRocks &&
          alignment.terrain.riverCollisionSafe &&
          alignment.terrain.rockCollisionSafe &&
          alignment.terrain.workbenchCollisionSafe &&
          alignment.terrain.footAnchorSafe,
          `大廳多邊形地形遮罩未貼合空地、石牆或河道：${JSON.stringify(alignment.terrain)}`
        );
        assert(alignment.unreachable.length === 0,
          `固定裝置不可到達：${alignment.unreachable.join("、")}`);
        assert(alignment.migratedVersion === 3 &&
          alignment.migratedPlayerY === 556 &&
          alignment.migratedBuildingY === 462 &&
          alignment.persistedLobbyVersion === 3,
          "舊版大廳 Y 座標沒有正確遷移");

        const captureLobbyAnchor = async (camera, filename) => {
          await browser.evaluate(`(() => {
            Lobby.running = false;
            const vw = Lobby.canvas.width / LobbyWorld.ZOOM;
            const vh = Lobby.canvas.height / LobbyWorld.ZOOM;
            Lobby.camera.x = Math.max(0, Math.min(LobbyWorld.W - vw, ${camera.x}));
            Lobby.camera.y = Math.max(0, Math.min(LobbyWorld.H - vh, ${camera.y}));
            const avatar = Lobby.avatar;
            Lobby.avatar = null;
            Lobby.render();
            Lobby.avatar = avatar;
            return true;
          })()`);
          await browser.screenshot(path.join(ROOT, "screenshots", filename));
        };
        await captureLobbyAnchor({ x: 288, y: 0 }, "lobby-aligned-portal.png");
        await captureLobbyAnchor({ x: 0, y: 180 }, "lobby-aligned-workbench.png");
        await captureLobbyAnchor({ x: 796, y: 190 }, "lobby-aligned-recycle-zone.png");
      }
    },
    {
      name: "大廳子頁持續掛機收益",
      run: async () => {
        await browser.prepare("test=1&qaSkipIntro=1&qaIdleInterval=0.2&seed=1008");
        const beforeSettings = await browser.evaluate(`(() => {
          Lobby.avatar.x = LobbyWorld.idleZone.x + LobbyWorld.idleZone.w / 2;
          Lobby.avatar.y = LobbyWorld.idleZone.y + LobbyWorld.idleZone.h / 2;
          Lobby.updateIdleEconomy();
          const before = Storage.getRecycled();
          App.openSettings("home");
          return before;
        })()`);
        await browser.waitFor(
          "App.state === 'SETTINGS_FROM_HOME' && LobbyEconomy.isCollecting()",
          "設定頁保留掛機狀態"
        );
        await browser.waitFor(
          `Storage.getRecycled() > ${beforeSettings}`,
          "設定頁掛機材料增加",
          4000
        );
        await browser.evaluate("App.closeSettings()");
        await browser.waitFor("__TEST__.getState().screen === 'lobby'", "設定頁返回大廳");

        const beforeAchievements = await browser.evaluate(`(() => {
          const before = Storage.getRecycled();
          App.openAchievements();
          return before;
        })()`);
        await browser.waitFor(
          "App.state === 'ACHIEVEMENTS' && LobbyEconomy.isCollecting()",
          "成就頁保留掛機狀態"
        );
        await browser.waitFor(
          `Storage.getRecycled() > ${beforeAchievements}`,
          "成就頁掛機材料增加",
          4000
        );
        await browser.evaluate("App.enterLobby()");
        await browser.waitFor("__TEST__.getState().screen === 'lobby'", "成就頁返回大廳");
        const state = await browser.evaluate("__TEST__.getState().lobby");
        assert(state.idleCollecting, "返回大廳後掛機狀態未延續");
      }
    },
    {
      name: "關卡鎖定與解鎖",
      run: async () => {
        await browser.prepare("test=1&duration=8&qaSkipIntro=1&seed=1005");
        await browser.evaluate("App.openPortalSelect()");
        await browser.waitFor("__TEST__.getState().screen === 'portal'", "關卡地圖顯示");
        const before = await browser.evaluate(`(() => {
          const node = document.querySelector('[data-stage-id="recycle_works"]');
          return { disabled: !!node?.disabled, ariaDisabled: node?.getAttribute("aria-disabled") };
        })()`);
        assert(before.disabled && before.ariaDisabled === "true", "第二關在新存檔不應解鎖");
        await browser.click('#screen-portal [data-action="play"]');
        await browser.waitFor(
          "__TEST__.getState().screen === 'game' && __TEST__.getState().running && !__TEST__.getState().runIntroActive",
          "第一關戰鬥開始"
        );
        await browser.evaluate("Game.stage.waves = []; Game.stage.events = []; Game.enemies = []; true");
        assert(await browser.evaluate("__TEST__.clearCurrentStage()"), "無法完成第一關");
        await browser.waitFor("__TEST__.getState().screen === 'victory'", "第一關勝利結算顯示");
        await browser.click('#screen-victory [data-action="menu"]');
        await browser.waitFor("__TEST__.getState().screen === 'lobby'", "勝利後返回大廳");
        await browser.evaluate("App.openPortalSelect()");
        await browser.waitFor("__TEST__.getState().screen === 'portal'", "解鎖後關卡地圖顯示");
        const after = await browser.evaluate(`(() => {
          const second = document.querySelector('[data-stage-id="recycle_works"]');
          const third = document.querySelector('[data-stage-id="blackwater_plant"]');
          return {
            secondDisabled: !!second?.disabled,
            secondAriaDisabled: second?.getAttribute("aria-disabled"),
            thirdDisabled: !!third?.disabled,
            cleared: Storage.isStageCleared("tidal_flat")
          };
        })()`);
        assert(after.cleared, "第一關通關狀態未保存");
        assert(!after.secondDisabled && after.secondAriaDisabled === "false", "第二關未在擊敗 Boss 後解鎖");
        assert(after.thirdDisabled, "第三關不應提前解鎖");
      }
    },
    {
      name: "地形玩法、扭蛋保底與偏好設定",
      run: async () => {
        await browser.prepare("test=1&qaSkipIntro=1&seed=1010");
        const terrain = await browser.evaluate(`(() => {
          const findEffect = (kind) => {
            for (let r = 0; r < StageRenderer.rows; r += 1) {
              for (let c = 0; c < StageRenderer.cols; c += 1) {
                if (StageRenderer.tileMap[r][c].kind !== kind) continue;
                return StageRenderer.getTerrainEffectAt(
                  c * StageRenderer.TILE + StageRenderer.TILE / 2,
                  r * StageRenderer.TILE + StageRenderer.TILE / 2
                );
              }
            }
            return null;
          };
          const first = GameData.getStage("tidal_flat");
          StageRenderer.build(first, 1010);
          const centerC = Math.floor((first.world.w / 2) / StageRenderer.TILE);
          const centerR = Math.floor((first.world.h / 2) / StageRenderer.TILE);
          let nearbyWater = 0;
          for (let r = centerR - 3; r <= centerR + 3; r += 1) {
            for (let c = centerC - 4; c <= centerC + 4; c += 1) {
              const kind = StageRenderer.tileMap[r]?.[c]?.kind;
              if (["ocean", "shoreline", "tidePool"].includes(kind)) nearbyWater += 1;
            }
          }
          const tidal = {
            landmarks: StageRenderer.landmarks.map((item) => item.type),
            nearbyWater,
            tidePool: findEffect("tidePool"),
            shoreline: findEffect("shoreline")
          };
          StageRenderer.build(GameData.getStage("recycle_works"), 1010);
          const recycle = { conveyor: findEffect("conveyor"), pad: findEffect("recyclePad") };
          StageRenderer.build(GameData.getStage("blackwater_plant"), 1010);
          const blackwater = { oil: findEffect("oilChannel") };
          StageRenderer.build(GameData.getStage("east_ridge"), 1010);
          const east = {
            river: findEffect("riverCurrent"),
            gravel: findEffect("gravelBar"),
            landslide: findEffect("landslide"),
            landmarks: StageRenderer.landmarks.map((item) => item.type),
            kinds: [...new Set(StageRenderer.tileMap.flat().map((tile) => tile.kind))]
          };
          return { tidal, recycle, blackwater, east };
        })()`);
        assert(terrain.tidal.nearbyWater >= 12, "第一關出生區周圍的海岸地標不足");
        assert(terrain.tidal.landmarks.includes("driftwood") && terrain.tidal.landmarks.includes("seaweed") &&
          terrain.tidal.landmarks.includes("rockPool"), "第一關缺少漂流木、海草或潮池地標");
        assert(terrain.tidal.tidePool?.speedMult < 1 && terrain.tidal.shoreline?.speedMult < 1, "潮池／淺水減速未生效");
        assert(Math.abs(terrain.recycle.conveyor?.pushY) > 0, "輸送帶推動未生效");
        assert(terrain.recycle.pad?.rewardMult === 1.5, "分類台加成未生效");
        assert(terrain.blackwater.oil?.damage > 0 && terrain.blackwater.oil?.damageInterval > 0, "油污持續傷害未生效");
        assert(terrain.east.kinds.includes("forestFloor") && terrain.east.kinds.includes("riverCurrent") &&
          terrain.east.kinds.includes("gravelBar") && terrain.east.kinds.includes("landslide"),
          "第四關沒有完整產生山林、溪流、礫石灘與崩塌地");
        assert(terrain.east.river?.pushY > 0 && terrain.east.river?.speedMult < 1,
          "第四關溪流推動或減速未生效");
        assert(terrain.east.gravel?.rewardMult === 1.25, "第四關礫石回收加成未生效");
        assert(terrain.east.landslide?.damage > 0 && terrain.east.landslide?.speedMult < 1,
          "第四關崩塌地傷害或減速未生效");
        assert(terrain.east.landmarks.includes("riverMarker") && terrain.east.landmarks.includes("mountainStone"),
          "第四關出生區缺少溪流與山谷地標");

        const systems = await browser.evaluate(`(() => {
          Storage.data.coins = 1000000;
          Storage.data.gachaPity = { sinceNew: 9, totalPulls: 9, guaranteeAt: 10 };
          const pull = Gacha.pull();
          App.openGacha();
          const prefs = Storage.setPreferences({
            quality: "performance",
            reduceAnimations: true,
            textSize: "large",
            colorMode: "deuteranopia",
            keyLayout: "ijkl",
            touchSensitivity: 135
          });
          UI.applyPreferences(prefs);
          return {
            pull: { ok: pull.ok, guaranteed: pull.guaranteed, kind: pull.kind, sinceNew: pull.pity?.sinceNew },
            rules: document.getElementById("gacha-rules")?.textContent || "",
            classes: document.documentElement.className,
            keyLayout: Input.keyLayout,
            touchSensitivity: Input.touchSensitivity
          };
        })()`);
        assert(systems.pull.ok && systems.pull.guaranteed, "第 10 抽新獎勵保底未觸發");
        assert(systems.pull.kind !== "duplicate-character" && systems.pull.sinceNew === 0, "保底仍抽到重複角色或未重置進度");
        assert(systems.rules.includes("技能點") && systems.rules.includes("保底"), "扭蛋頁未清楚揭露重複補償與保底");
        assert(systems.classes.includes("quality-performance") && systems.classes.includes("reduce-animations") &&
          systems.classes.includes("text-size-large") && systems.classes.includes("color-mode-deuteranopia"),
          "畫質、動畫、文字或色弱設定未套用");
        assert(systems.keyLayout === "ijkl" && systems.touchSensitivity === 135, "按鍵配置或觸控靈敏度未套用");
      }
    },
    {
      name: "第四關、週期任務與挑戰模式",
      run: async () => {
        await browser.prepare("test=1&qaSkipIntro=1&seed=1012");
        const featureState = await browser.evaluate(`(() => {
          const east = GameData.getStage("east_ridge");
          const eastRegion = GameData.getTaiwanRegionForStage("east_ridge");
          const initiallyLocked = !Storage.isStageUnlocked("east_ridge");
          const rentalBeforeUnlock = EnvironmentMissions.getChallengeState("circular_overdrive");
          Storage.markStageCleared("tidal_flat");
          Storage.markStageCleared("recycle_works");
          Storage.markStageCleared("blackwater_plant");
          const unlocked = Storage.isStageUnlocked("east_ridge");
          const fixedCharactersUnlocked =
            Storage.isCharacterOwned("mechanic") && Storage.isCharacterOwned("chemist");

          const poolSampleA = EnvironmentMissions.getMissions("daily", Date.UTC(2026, 6, 2, 2));
          const poolSampleB = EnvironmentMissions.getMissions("daily", Date.UTC(2026, 6, 3, 2));
          const consecutiveOverlap = poolSampleB.filter((mission) =>
            poolSampleA.some((previous) => previous.id === mission.id)
          ).length;

          const missionRoot = Storage.data.environmentMissions;
          missionRoot.daily.periodKey = EnvironmentMissions.dailyKey();
          missionRoot.daily.activeIds = ["daily_take_action", "daily_field_cleanup", "daily_eco_quiz"];
          missionRoot.daily.previousIds = [];
          missionRoot.daily.progress = {};
          missionRoot.daily.claimed = {};
          missionRoot.weekly.periodKey = EnvironmentMissions.weeklyKey();
          missionRoot.weekly.activeIds = [
            "weekly_restore_regions",
            "weekly_pollution_control",
            "weekly_material_recovery",
            "weekly_boss_control"
          ];
          missionRoot.weekly.previousIds = [];
          missionRoot.weekly.progress = {};
          missionRoot.weekly.claimed = {};

          const beforeCoins = Storage.getCoins();
          const beforeMaterials = Storage.getRecycled();
          EnvironmentMissions.recordRun({
            result: "victory",
            bossDefeated: true,
            purified: 120,
            mapCleaned: 14,
            quizCorrect: 2
          });
          const daily = EnvironmentMissions.getMissions("daily");
          const weekly = EnvironmentMissions.getMissions("weekly");
          EnvironmentMissions.toggleTrackedMission("daily", "daily_field_cleanup");
          const claim = EnvironmentMissions.claimMission("daily", "daily_take_action");

          Storage.data.ownedCharacters.beachcomber = true;
          App.saveSelectedCharacter("beachcomber");
          const coastReady = EnvironmentMissions.validateChallengeStart("coast_specialist");
          const windBefore = EnvironmentMissions.validateChallengeStart("wind_power_route");
          const lobby = Storage.getLobby();
          lobby.buildings.push({
            instanceId: "mission-test-wind",
            buildingId: "wind_station",
            x: 640,
            y: 520,
            rotation: 0,
            level: 1,
            placed: true
          });
          Storage.save();
          const windAfter = EnvironmentMissions.validateChallengeStart("wind_power_route");
          App.openEnvironmentMissions("daily");

          return {
            schemaVersion: Storage.data.schemaVersion,
            hasMissionSave: !!Storage.data.environmentMissions,
            missionSaveVersion: Storage.data.environmentMissions.version,
            stageCount: GameData.stages.length,
            pool: {
              dailyDefinitions: GameData.environmentMissions.daily.length,
              weeklyDefinitions: GameData.environmentMissions.weekly.length,
              dailyActive: poolSampleA.length,
              weeklyActive: weekly.length,
              consecutiveOverlap
            },
            east: {
              order: east?.order,
              unlockAfter: east?.unlockAfter,
              bossId: east?.bossId,
              previewImage: east?.previewImage,
              initiallyLocked,
              unlocked,
              regionId: eastRegion?.id
            },
            daily: daily.map((item) => ({ id: item.id, progress: item.progress, complete: item.complete })),
            weekly: weekly.map((item) => ({ id: item.id, progress: item.progress })),
            claim: {
              ok: claim.ok,
              coinDelta: Storage.getCoins() - beforeCoins,
              materialDelta: Storage.getRecycled() - beforeMaterials
            },
            rentalBeforeUnlock: !!rentalBeforeUnlock?.characterRental,
            fixedCharactersUnlocked,
            coastReady: coastReady.ok,
            windBefore: windBefore.ok,
            windAfter: windAfter.ok,
            missionCards: document.querySelectorAll("#mission-list .mission-card").length,
            missionProgressLabels: Array.from(document.querySelectorAll("#mission-list [role='progressbar']"))
              .every((bar) => !!bar.getAttribute("aria-label") && !!bar.getAttribute("aria-valuetext")),
            hasClaimAll: !!document.getElementById("mission-claim-all"),
            trackedMission: EnvironmentMissions.getTrackedMission()?.id,
            missionScreenVisible: !document.getElementById("screen-missions").classList.contains("hidden"),
            periodKeysDiffer: EnvironmentMissions.dailyKey(Date.UTC(2026, 6, 1, 15, 59)) !==
              EnvironmentMissions.dailyKey(Date.UTC(2026, 6, 1, 16, 1))
          };
        })()`);

        assert(featureState.schemaVersion === 8 && featureState.hasMissionSave &&
          featureState.missionSaveVersion === 2, "舊存檔沒有遷移到任務 schema");
        assert(featureState.pool.dailyDefinitions >= 8 && featureState.pool.weeklyDefinitions >= 9 &&
          featureState.pool.dailyActive === 3 && featureState.pool.weeklyActive === 4 &&
          featureState.pool.consecutiveOverlap === 0,
          "每日／每週任務池沒有抽取指定數量，或連續兩期仍重複");
        assert(featureState.stageCount === 4 && featureState.east.order === 4 &&
          featureState.east.unlockAfter === "blackwater_plant" && featureState.east.bossId === "landslide_colossus",
          "第四關資料或解鎖鏈不完整");
        assert(featureState.east.initiallyLocked && featureState.east.unlocked && featureState.east.regionId === "east",
          "第四關鎖定／東部地圖節點沒有正確連動");
        assert(featureState.east.previewImage.includes("east_ridge_card.webp"), "第四關沒有使用最佳化後的正式預覽圖");
        assert(featureState.daily.find((item) => item.id === "daily_take_action")?.complete &&
          featureState.daily.find((item) => item.id === "daily_field_cleanup")?.progress === 10 &&
          featureState.daily.find((item) => item.id === "daily_eco_quiz")?.complete,
          "每日任務沒有依結算統計更新");
        assert(featureState.weekly.find((item) => item.id === "weekly_restore_regions")?.progress === 1 &&
          featureState.weekly.find((item) => item.id === "weekly_pollution_control")?.progress === 120,
          "每週任務沒有累積結算統計");
        assert(featureState.claim.ok && featureState.claim.coinDelta === 80 && featureState.claim.materialDelta === 0,
          "每日任務獎勵領取或經濟寫入錯誤");
        assert(featureState.rentalBeforeUnlock && featureState.fixedCharactersUnlocked,
          "挑戰角色租借或前三關固定角色解鎖路線未生效");
        assert(featureState.coastReady && !featureState.windBefore && featureState.windAfter,
          "指定角色或已擺放建築的挑戰條件判定錯誤");
        assert(featureState.missionScreenVisible && featureState.missionCards === 3 &&
          featureState.missionProgressLabels && featureState.hasClaimAll &&
          featureState.trackedMission === "daily_field_cleanup",
          "環境任務卡片、無障礙名稱、追蹤或一鍵領取沒有建立");
        assert(featureState.periodKeysDiffer, "台灣時間每日 00:00 重置鍵計算錯誤");

        await browser.evaluate("App.startChallenge('coast_specialist')");
        await browser.waitFor("App.state === 'PLAYING' && Game.challenge?.id === 'coast_specialist'", "挑戰模式開始");
        const challengeRuntime = await browser.evaluate(`(() => {
          const def = GameData.getEnemy("plastic_bag");
          const enemy = Game.spawnOne("plastic_bag");
          return {
            challengeId: Game.challenge?.id,
            hp: enemy?.maxHp,
            baseHp: def.hp,
            speed: enemy?.speed,
            baseSpeed: def.speed,
            mapSpawnInterval: Game.mapObjectSpawnInterval,
            introGoal: document.getElementById("run-intro-goal")?.textContent || ""
          };
        })()`);
        assert(challengeRuntime.challengeId === "coast_specialist" &&
          challengeRuntime.hp > challengeRuntime.baseHp &&
          challengeRuntime.speed > challengeRuntime.baseSpeed,
          "挑戰難度倍率沒有實際套用到敵人");
        assert(challengeRuntime.introGoal.includes("潮池專家"), "挑戰開場沒有顯示挑戰名稱");
        await browser.evaluate("Game.abort(); App.enterLobby(); true");

        await browser.evaluate(`(() => {
          App.openPortalSelect();
          App.selectedStageId = "east_ridge";
          App.updateStageSelector();
          return true;
        })()`);
        await browser.waitFor(
          "document.getElementById('stage-card-image').naturalWidth > 0 && document.getElementById('stage-card-name').textContent.includes('花蓮')",
          "第四關 GPT-image 預覽載入"
        );
      }
    },
    {
      name: "污染暴走、HUD 分列與敵人介紹紀錄",
      run: async () => {
        await browser.prepare("test=1&duration=8&qaSkipIntro=1&seed=1021");
        await browser.startFirstStage();
        const featureState = await browser.evaluate(`(() => {
          const introDef = GameData.getEnemy("bottle_mite");
          Storage.data.encounteredEnemies = Storage.data.encounteredEnemies.filter((id) => id !== introDef.id);
          Storage.setPreferences({ skipSeenEnemyIntros: true });
          Game.seenEnemyIntros = {};
          const firstQueued = Game.queueEnemyIntro(introDef);
          const firstPaused = Game.enemyIntroPaused;
          UI.hideEnemyIntro(true);

          Game.seenEnemyIntros = {};
          const repeatQueued = Game.queueEnemyIntro(introDef);
          const repeatPaused = Game.enemyIntroPaused;
          const repeatToast = document.getElementById("toast")?.textContent || "";

          Storage.setPreferences({ skipSeenEnemyIntros: false });
          Game.seenEnemyIntros = {};
          const settingOffQueued = Game.queueEnemyIntro(introDef);
          const settingOffPaused = Game.enemyIntroPaused;
          UI.hideEnemyIntro(true);
          Storage.setPreferences({ skipSeenEnemyIntros: true });

          const bossDef = GameData.getEnemy(Game.stage.bossId);
          Storage.markEnemyEncountered(bossDef.id);
          Storage.markEnemyEncountered("plastic_bag");
          Game.seenEnemyIntros = {};
          Game.stage.maxEnemies = 40;
          Game.stage.waves = [{
            from: 0,
            to: Game.stage.duration,
            interval: 0.01,
            batch: 1,
            types: [{ enemy: "plastic_bag", weight: 1 }]
          }];
          const boss = Game.spawnOne(bossDef.id, true);
          const before = {
            speed: boss.speed,
            contact: boss.contact,
            cooldown: boss.ranged?.cooldown,
            projectileDamage: boss.ranged?.projectileDamage
          };
          Game.time = Game.stage.duration - 0.02;
          Game.update(0.03);

          Game.challenge = { title: "HUD 測試", goal: { mapCleaned: 25 } };
          Game.mapCleanedCount = 8;
          Game.terrainStatus = "礫石回收區：回收獎勵 +25%";
          UI.updateHUD(Game);
          const hud = {
            timer: document.getElementById("hud-timer")?.textContent || "",
            objective: document.getElementById("hud-objective")?.textContent || "",
            terrain: document.getElementById("hud-terrain")?.textContent || "",
            terrainHidden: document.getElementById("hud-terrain")?.classList.contains("hidden")
          };
          Game.challenge = null;

          return {
            intro: {
              firstQueued,
              firstPaused,
              encountered: Storage.isEnemyEncountered(introDef.id),
              repeatQueued,
              repeatPaused,
              repeatToast,
              settingOffQueued,
              settingOffPaused,
              preferenceRestored: Storage.getPreferences().skipSeenEnemyIntros
            },
            overtime: {
              active: Game.overtimeActive,
              duration: Game.overtimeDuration,
              remaining: Game.overtimeRemaining,
              bossEnraged: boss.overtimeEnraged,
              speed: boss.speed,
              contact: boss.contact,
              cooldown: boss.ranged?.cooldown,
              projectileDamage: boss.ranged?.projectileDamage,
              normalEnemies: Game.enemies.filter((enemy) => !enemy.isBoss).length,
              before
            },
            hud
          };
        })()`);

        assert(featureState.intro.firstQueued && featureState.intro.firstPaused && featureState.intro.encountered,
          "首次污染物遭遇沒有顯示介紹或寫入存檔");
        assert(!featureState.intro.repeatQueued && !featureState.intro.repeatPaused &&
          featureState.intro.repeatToast.includes("瓶蓋甲蟲"),
          "已看過的污染物沒有改為不暫停的角落提示");
        assert(featureState.intro.settingOffQueued && featureState.intro.settingOffPaused &&
          featureState.intro.preferenceRestored,
          "關閉略過設定後沒有恢復完整污染物介紹");
        assert(featureState.overtime.active && featureState.overtime.duration === 30 &&
          featureState.overtime.remaining > 29 && featureState.overtime.remaining < 30,
          "計時歸零後沒有進入 30 秒污染暴走");
        assert(featureState.overtime.bossEnraged &&
          featureState.overtime.speed > featureState.overtime.before.speed &&
          featureState.overtime.contact > featureState.overtime.before.contact &&
          featureState.overtime.cooldown < featureState.overtime.before.cooldown &&
          featureState.overtime.projectileDamage > featureState.overtime.before.projectileDamage,
          "污染暴走沒有強化 BOSS");
        assert(featureState.overtime.normalEnemies > 0, "污染暴走沒有繼續生成最終波次");
        assert(featureState.hud.timer.includes("暴走") &&
          featureState.hud.objective.includes("清理 8/25") &&
          featureState.hud.terrain.includes("礫石回收區") && !featureState.hud.terrainHidden,
          "挑戰進度、地形效果或污染暴走計時沒有分列顯示");

        const expired = await browser.evaluate(`(() => {
          Game.overtimeRemaining = 0.01;
          Game.update(0.02);
          return {
            ended: Game.ended,
            expired: Game.overtimeExpired,
            screen: App.state,
            resultText: document.getElementById("gameover-stats")?.textContent || ""
          };
        })()`);
        assert(expired.ended && expired.expired && expired.screen === "GAME_OVER",
          "污染暴走 30 秒耗盡後沒有判定失敗");
        assert(expired.resultText.includes("污染暴走") && expired.resultText.includes("挑戰失敗"),
          "污染暴走失敗原因沒有顯示在結算");
      }
    },
    {
      name: "新手建造、快速模式、專屬 BOSS 與觸控回饋",
      run: async () => {
        await browser.setViewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height, false);
        await browser.prepare("test=1&duration=200&qaSkipIntro=1&seed=1030");
        await browser.waitFor("__TEST__.getState().screen === 'lobby'", "新手建造測試大廳顯示");

        const buildState = await browser.evaluate(`(() => {
          App.enterBuildMode();
          const tree = GameData.getLobbyBuilding("small_tree");
          Lobby.startGhost(tree, "buy", null);
          const originalCell = { x: Lobby.ghost.cellX, y: Lobby.ghost.cellY };
          const help = document.getElementById("ghost-controls-hint");
          const helpText = help?.textContent || "";
          const firstHelpVisible = !!help && !help.classList.contains("hidden");
          const autoRelocatedToValid = Lobby.ghost.valid;

          Lobby.ghost.cellX = -20;
          Lobby.ghost.cellY = -20;
          Lobby.validateGhost();
          const invalidConfirmDisabled = document.getElementById("ghost-confirm")?.disabled === true;
          const invalidReason = Lobby.ghost.reasons[0] || "";

          Lobby.ghost.cellX = originalCell.x;
          Lobby.ghost.cellY = originalCell.y;
          Lobby.validateGhost();
          const validConfirmEnabled = document.getElementById("ghost-confirm")?.disabled === false;
          Lobby.confirmGhost();
          return {
            helpText,
            firstHelpVisible,
            autoRelocatedToValid,
            invalidConfirmDisabled,
            invalidReason,
            validConfirmEnabled,
            placementHelpCompleted: Storage.isPlacementHelpCompleted(),
            treePlaced: Storage.getLobby().buildings.some((building) => building.buildingId === "small_tree")
          };
        })()`);
        assert(buildState.firstHelpVisible && buildState.autoRelocatedToValid &&
          buildState.helpText.includes("滑鼠") && buildState.helpText.includes("方向鍵") &&
          buildState.helpText.includes("單指") && buildState.helpText.includes("雙指"),
          "首次放置沒有顯示完整的電腦／手機操作提示或自動移到可放置格");
        assert(buildState.invalidConfirmDisabled && buildState.invalidReason &&
          buildState.validConfirmEnabled && buildState.placementHelpCompleted && buildState.treePlaced,
          "無效位置未停用確認，或首次成功放置沒有保存教學狀態");

        const missionAndChallenge = await browser.evaluate(`(() => {
          App.exitBuildMode();
          const daily = EnvironmentMissions.getMissions("daily");
          const bucket = Storage.data.environmentMissions.daily;
          daily.forEach((mission) => { bucket.progress[mission.id] = mission.target; });
          App.openEnvironmentMissions("daily");
          const countdown = document.getElementById("mission-period-label")?.textContent || "";
          const claimAllEnabled = document.getElementById("mission-claim-all")?.disabled === false;
          const claimAll = EnvironmentMissions.claimAll();
          const allDailyClaimed = EnvironmentMissions.getMissions("daily").every((mission) => mission.claimed);
          const trackedId = daily[0]?.id;
          EnvironmentMissions.toggleTrackedMission("daily", trackedId);

          App.saveSelectedCharacter("ranger");
          App.openEnvironmentMissions("challenges");
          const cardText = (id) => document.querySelector(
            '.challenge-card[data-challenge-id="' + id + '"]'
          )?.textContent || "";
          const helperState = {
            coast: cardText("coast_specialist"),
            circular: cardText("circular_overdrive"),
            east: cardText("east_resilience")
          };
          EnvironmentMissions.recordChallenge("coast_specialist", {
            result: "victory",
            survived: 177,
            purified: 44,
            mapCleaned: 15,
            quizCorrect: 3,
            noDamage: true
          });
          UI.buildEnvironmentMissions("challenges");
          const completedText = cardText("coast_specialist");
          const claimed = EnvironmentMissions.claimChallenge("coast_specialist");
          UI.buildEnvironmentMissions("challenges");
          const claimedText = cardText("coast_specialist");

          return {
            countdown,
            claimAllEnabled,
            claimAllCount: claimAll.count,
            allDailyClaimed,
            trackedId,
            helperState,
            completedText,
            claimedOk: claimed.ok,
            claimedText
          };
        })()`);
        assert(missionAndChallenge.countdown.includes("剩餘") && missionAndChallenge.claimAllEnabled &&
          missionAndChallenge.claimAllCount === 3 && missionAndChallenge.allDailyClaimed,
          "任務倒數或一鍵領取全部沒有正確運作");
        assert(missionAndChallenge.helperState.coast.includes("切換角色") &&
          missionAndChallenge.helperState.circular.includes("免費租借") &&
          missionAndChallenge.helperState.circular.includes("前往建造") &&
          missionAndChallenge.helperState.east.includes("查看解鎖方式"),
          "挑戰條件不足時缺少角色租借或直接處理按鈕");
        assert(missionAndChallenge.completedText.includes("首次通關獎勵") &&
          missionAndChallenge.completedText.includes("個人最佳") &&
          missionAndChallenge.completedText.includes("淨化數 44") &&
          missionAndChallenge.completedText.includes("清理數 15") &&
          missionAndChallenge.completedText.includes("存活 02:57") &&
          missionAndChallenge.claimedOk &&
          missionAndChallenge.claimedText.includes("已領取") &&
          missionAndChallenge.claimedText.includes("再次挑戰"),
          "挑戰首次獎勵、最佳紀錄或個別目標狀態顯示不完整");

        await browser.evaluate(`(() => {
          App.enterLobby();
          App.openPortalSelect();
          App.setRunMode("quick");
          return App.startSelectedStage();
        })()`);
        await browser.waitFor("App.state === 'PLAYING' && Game.running", "快速模式開始");
        await browser.waitFor(
          "Assets.ready('enemy_landslide_colossus') && " +
          "Assets.ready('boss_landslide_boulder_projectile') && " +
          "Assets.ready('boss_landslide_warning_telegraph')",
          "崩谷巨像專屬素材載入"
        );
        const runtimeState = await browser.evaluate(`(() => {
          UI.updateHUD(Game);
          const bossDef = GameData.getEnemy("landslide_colossus");
          Game.enemyProjectiles = [];
          const boss = new Enemy(bossDef, Game.player.x + 180, Game.player.y, 1);
          Game.fireEnemyAttack(boss, { config: bossDef.ranged, aimX: 1, aimY: 0 });
          const projectileSpeeds = Game.enemyProjectiles.map((projectile) =>
            Math.round(Math.hypot(projectile.vx, projectile.vy))
          );
          const projectileAngles = Game.enemyProjectiles.map((projectile) =>
            Math.atan2(projectile.vy, projectile.vx)
          );
          const materialBefore = Storage.getRecycled();
          const bossBonusBase = LobbyEconomy.bossBonusAmount(Game.stage.id);
          const quickBossClaim = LobbyEconomy.claimBossDaily(
            Game.stage.id,
            Date.now(),
            Game.rewardMultiplier
          );
          const quick = {
            mode: Game.runMode,
            stageDuration: Game.stage.duration,
            runDuration: Game.runDuration,
            timelineScale: Game.timelineScale,
            rewardMultiplier: Game.rewardMultiplier,
            mapObjectSpawnInterval: Game.mapObjectSpawnInterval,
            trackedHud: document.getElementById("hud-mission")?.textContent || "",
            bossBonusBase,
            bossBonusAmount: quickBossClaim?.amount,
            bossBonusDelta: Storage.getRecycled() - materialBefore
          };
          Game.abort();

          const east = GameData.getStage("east_ridge");
          StageRenderer.build(east, 1030);
          const tileKinds = new Set(StageRenderer.tileMap.flat().map((tile) => tile.kind));
          const landmarkKinds = new Set(StageRenderer.landmarks.map((landmark) => landmark.type));
          return {
            quick,
            boss: {
              spriteId: bossDef.spriteId,
              attackKind: bossDef.ranged.kind,
              visualId: bossDef.ranged.visualId,
              projectileCount: projectileSpeeds.length,
              hasStaggeredSpeeds: new Set(projectileSpeeds).size > 1,
              angularSpread: Math.max(...projectileAngles) - Math.min(...projectileAngles)
            },
            east: {
              tileKinds: Array.from(tileKinds),
              landmarkKinds: Array.from(landmarkKinds)
            }
          };
        })()`);
        assert(runtimeState.quick.mode === "quick" &&
          runtimeState.quick.runDuration === Math.round(runtimeState.quick.stageDuration * 0.6) &&
          runtimeState.quick.timelineScale === 0.6 &&
          runtimeState.quick.rewardMultiplier === 0.5 &&
          runtimeState.quick.mapObjectSpawnInterval === 3 &&
          runtimeState.quick.bossBonusAmount === Math.floor(runtimeState.quick.bossBonusBase * 0.5) &&
          runtimeState.quick.bossBonusDelta === runtimeState.quick.bossBonusAmount &&
          runtimeState.quick.trackedHud,
          "快速模式沒有壓縮關卡節奏、降低循環幣／材料獎勵或顯示追蹤任務");
        assert(runtimeState.boss.spriteId === "enemy_landslide_colossus" &&
          runtimeState.boss.attackKind === "landslide" &&
          runtimeState.boss.visualId === "landslide_barrage" &&
          runtimeState.boss.projectileCount === 9 &&
          runtimeState.boss.hasStaggeredSpeeds &&
          runtimeState.boss.angularSpread > 1.7 && runtimeState.boss.angularSpread < 1.9,
          "第四關 BOSS 仍沿用壓縮機甲或沒有專屬扇形土石攻擊");
        assert(["forestFloor", "riverCurrent", "gravelBar", "landslide", "estuaryShoal"]
          .every((kind) => runtimeState.east.tileKinds.includes(kind)) &&
          ["driftwoodBlock", "forestBoundary", "cliffEdge", "landslideArrow"]
            .every((kind) => runtimeState.east.landmarkKinds.includes(kind)),
          "第四關缺少森林、溪谷、河口淺灘、漂流木阻塞或崩塌方向地標");

        await browser.setViewport(390, 844, true);
        await browser.prepare("test=1&duration=8&qaSkipIntro=1&forceMobile=1&seed=1031");
        await browser.startFirstStage();
        const touchState = await browser.evaluate(`(() => {
          const stage = document.getElementById("stage").getBoundingClientRect();
          Input.touch.active = true;
          Input.touch.id = 77;
          Input.touch.ox = stage.left + stage.width / 2;
          Input.touch.oy = stage.top + stage.height / 2;
          Input.touch.x = Input.touch.ox + 80;
          Input.touch.y = Input.touch.oy;
          Input.setFloatingJoystick(true);
          Input.updateTouchVisual();
          const joystick = document.getElementById("touch-joystick");
          const joystickRect = joystick.getBoundingClientRect();
          const vector = Input.getTouchVector();

          const vibrated = [];
          try {
            Object.defineProperty(navigator, "vibrate", {
              configurable: true,
              value: (pattern) => { vibrated.push(pattern); return true; }
            });
          } catch {
            navigator.vibrate = (pattern) => { vibrated.push(pattern); return true; };
          }
          Input.setHaptics(true);
          const hapticOn = Input.haptic("hurt");
          Input.setHaptics(false);
          const hapticOff = Input.haptic("level");
          Input.setFloatingJoystick(false);
          const hiddenWhenDisabled = joystick.classList.contains("hidden");
          Input.cancelTouch();
          return {
            attached: Input._touchCanvas === Game.canvas,
            visible: joystickRect.width >= 90 && joystickRect.height >= 90,
            fullStrength: joystick.classList.contains("full-strength"),
            vectorMagnitude: Math.hypot(vector.x, vector.y),
            hapticOn,
            hapticOff,
            vibrated,
            hiddenWhenDisabled
          };
        })()`);
        assert(touchState.attached && touchState.visible && touchState.fullStrength &&
          touchState.vectorMagnitude > 0.95,
          "手機浮動搖桿沒有顯示方向、力度或滿速距離：" + JSON.stringify(touchState));
        assert(touchState.hapticOn && !touchState.hapticOff &&
          touchState.vibrated.length === 1 && touchState.hiddenWhenDisabled,
          "觸控震動或浮動搖桿開關沒有生效");
        await browser.evaluate("Game.abort(); true");
        await browser.setViewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height, false);
      }
    },
    {
      name: "首頁資源按需載入與高畫質正式素材",
      run: async () => {
        await browser.setViewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height, false);
        await browser.navigate("test=1&qaSkipIntro=1&seed=1012&layout=asset-budget");
        await browser.waitFor("__TEST__.getState().screen === 'lobby'", "資源預算測試大廳顯示");
        await sleep(700);
        const lobbyAssets = await browser.evaluate(`(() => ({
          requested: window.Assets?.stats?.total || 0,
          loaded: window.Assets?.stats?.loaded || 0,
          mapHasSrc: document.getElementById("taiwan-map-image")?.hasAttribute("src") || false,
          cardHasSrc: document.getElementById("stage-card-image")?.hasAttribute("src") || false,
          lobbyMap: window.Assets?.manifest?.lobby_bg?.paths?.[0] || ""
        }))()`);
        assert(lobbyAssets.requested <= 60,
          `首頁仍一次要求過多圖片：${JSON.stringify(lobbyAssets)}`);
        assert(!lobbyAssets.mapHasSrc && !lobbyAssets.cardHasSrc,
          `尚未開啟選關就載入大型地圖：${JSON.stringify(lobbyAssets)}`);
        assert(lobbyAssets.lobbyMap.includes("lobby_map.png"),
          "大廳沒有改用無損高畫質地圖");

        await browser.evaluate("App.openPortalSelect(); true");
        await browser.waitFor("__TEST__.getState().screen === 'portal'", "資源預算測試選關顯示");
        const portalAssets = await browser.evaluate(`(() => ({
          map: document.getElementById("taiwan-map-image")?.getAttribute("src") || "",
          card: document.getElementById("stage-card-image")?.getAttribute("src") || ""
        }))()`);
        assert(portalAssets.map.includes(".webp") && portalAssets.card.includes(".webp"),
          `選關沒有按需載入 WebP 地圖：${JSON.stringify(portalAssets)}`);
      }
    },
    {
      name: "手機橫／直向版面",
      run: async () => {
        await browser.setViewport(1366, 768, false);
        await browser.navigate("test=1&qaPortal=1&seed=1006&layout=desktop");
        await browser.waitFor("__TEST__.getState().screen === 'portal'", "desktop portal visible");
        const desktopPortal = await browser.evaluate(`(() => {
          const read = (selector) => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return {
              width: rect.width,
              height: rect.height,
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right
            };
          };
          return {
            viewport: { width: innerWidth, height: innerHeight },
            layout: read("#taiwan-portal-layout"),
            map: read("#taiwan-map-panel"),
            card: read("#stage-carousel-card"),
            start: read(".stage-start-button")
          };
        })()`);
        assert(desktopPortal.layout && desktopPortal.map && desktopPortal.card && desktopPortal.start, "desktop portal elements missing");
        assert(desktopPortal.map.width >= 420, "desktop Taiwan map regressed below 420px");
        assert(desktopPortal.card.width >= 440, "desktop stage art regressed below 440px");
        assert(desktopPortal.start.width >= 440 && desktopPortal.start.height >= 56, "desktop start button is undersized");
        assert(desktopPortal.layout.top >= 0 && desktopPortal.layout.bottom <= desktopPortal.viewport.height + 1, "desktop portal clips vertically");
        assert(desktopPortal.layout.left >= 0 && desktopPortal.layout.right <= desktopPortal.viewport.width + 1, "desktop portal clips horizontally");

        const viewports = [
          { name: "portrait", width: 390, height: 844 },
          { name: "landscape", width: 844, height: 390 }
        ];
        for (const viewport of viewports) {
          await browser.setViewport(viewport.width, viewport.height, true);
          await browser.navigate(`test=1&qaPortal=1&forceMobile=1&seed=1006&layout=${viewport.name}`);
          await browser.waitFor("__TEST__.getState().screen === 'portal'", `${viewport.name} 關卡地圖顯示`);
          const layout = await browser.evaluate(`(() => {
            const selectors = [
              "#portal-title",
              "#taiwan-map-panel",
              "#stage-carousel-card",
              "#stage-card-name",
              ".stage-card-meta span",
              ".stage-start-button"
            ];
            return {
              viewport: { width: innerWidth, height: innerHeight },
              scrollWidth: document.documentElement.scrollWidth,
              elements: selectors.map((selector) => {
                const element = document.querySelector(selector);
                if (!element) return { selector, missing: true };
                const rect = element.getBoundingClientRect();
                return {
                  selector,
                  width: rect.width,
                  height: rect.height,
                  left: rect.left,
                  right: rect.right,
                  fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
                  visible: rect.width > 0 && rect.height > 0
                };
              })
            };
          })()`);
          assert(layout.scrollWidth <= layout.viewport.width + 1, `${viewport.name} 出現水平捲動`);
          for (const element of layout.elements) {
            assert(!element.missing && element.visible, `${viewport.name} 缺少或隱藏 ${element.selector}`);
            assert(element.width <= layout.viewport.width + 1, `${viewport.name} 的 ${element.selector} 超出畫面寬度`);
            assert(element.left >= -1 && element.right <= layout.viewport.width + 1, `${viewport.name} 的 ${element.selector} 被水平裁切`);
          }
          const map = layout.elements.find((element) => element.selector === "#taiwan-map-panel");
          const card = layout.elements.find((element) => element.selector === "#stage-carousel-card");
          const stageName = layout.elements.find((element) => element.selector === "#stage-card-name");
          const meta = layout.elements.find((element) => element.selector === ".stage-card-meta span");
          const minimumMapWidth = viewport.name === "portrait" ? 180 : 145;
          const minimumCardWidth = viewport.name === "portrait" ? 200 : 140;
          assert(map.width >= minimumMapWidth, `${viewport.name} 傳送門地圖過小`);
          assert(card.width >= minimumCardWidth, `${viewport.name} 關卡預覽圖過小`);
          assert(stageName.fontSize >= 15, `${viewport.name} 關卡名稱字級過小`);
          assert(meta.fontSize >= 10, `${viewport.name} 關卡資訊字級過小`);
        }

        await browser.setViewport(390, 844, true);
        await browser.prepare("test=1&duration=8&qaSkipIntro=1&forceMobile=1&qaLobbyGuide=1&seed=1011");
        await browser.waitFor(
          "!document.getElementById('rotate-hint').classList.contains('hidden')",
          "手機直向旋轉提示顯示"
        );
        const firstModal = await browser.evaluate(`(() => ({
          visibleModals: Array.from(document.querySelectorAll('[aria-modal="true"]'))
            .filter((node) => !node.classList.contains("hidden")).map((node) => node.id),
          guideHidden: document.getElementById("overlay-lobby-guide").classList.contains("hidden"),
          focused: document.activeElement?.className || ""
        }))()`);
        assert(firstModal.visibleModals.length === 1 && firstModal.visibleModals[0] === "rotate-hint",
          "首次手機直向仍同時顯示多個 Modal");
        assert(firstModal.guideHidden && firstModal.focused.includes("rotate-hint-close"),
          "旋轉提示未獨占畫面或焦點未移至最上層視窗");
        await browser.click(".rotate-hint-close");
        await browser.waitFor(
          "!document.getElementById('overlay-lobby-guide').classList.contains('hidden')",
          "旋轉提示關閉後顯示新手指南"
        );
        assert(await browser.evaluate("document.activeElement?.id === 'lobby-guide-next'"),
          "新手指南開啟後焦點未移至下一步");
        await browser.click("#lobby-guide-next");
        await browser.click("#lobby-guide-next");
        await browser.click("#lobby-guide-finish");
        await browser.waitFor(
          "document.getElementById('overlay-lobby-guide').classList.contains('hidden')",
          "新手指南關閉"
        );

        const hudOverlap = await browser.evaluate(`(() => {
          const rect = (selector) => {
            const node = document.querySelector(selector);
            if (!node) return null;
            const r = node.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          };
          const overlap = (a, b) => !a || !b ? 0 :
            Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
            Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          const help = rect("#gameplay-help-btn");
          const character = rect('.lobby-topright [data-action="characters"]');
          const fullscreen = rect("#mobile-fullscreen-btn");
          const objective = rect("#lobby-objective");
          return { helpCharacter: overlap(help, character), fullscreenObjective: overlap(fullscreen, objective) };
        })()`);
        assert(hudOverlap.helpCharacter === 0, "手機大廳說明按鈕仍與角色按鈕重疊");
        assert(hudOverlap.fullscreenObjective === 0, "手機大廳全螢幕按鈕仍與任務文字重疊");

        await browser.evaluate("App.openEnvironmentMissions('challenges')");
        await browser.waitFor("App.state === 'ENVIRONMENT_MISSIONS'", "手機環境任務顯示");
        const missionMobile = await browser.evaluate(`(() => {
          const read = (selector) => {
            const node = document.querySelector(selector);
            const rect = node?.getBoundingClientRect();
            return rect ? {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height
            } : null;
          };
          return {
            viewport: { width: innerWidth, height: innerHeight },
            scrollWidth: document.documentElement.scrollWidth,
            tabs: read(".mission-tabs"),
            list: read("#mission-list"),
            footer: read("#screen-missions .mission-footer"),
            cards: document.querySelectorAll("#mission-list .challenge-card").length
          };
        })()`);
        assert(missionMobile.scrollWidth <= missionMobile.viewport.width + 1, "手機環境任務出現水平捲動");
        assert(missionMobile.cards === 4, "手機挑戰模式卡片數量錯誤");
        for (const [name, rect] of [["tabs", missionMobile.tabs], ["list", missionMobile.list], ["footer", missionMobile.footer]]) {
          assert(rect && rect.width > 0 && rect.height > 0 &&
            rect.left >= -1 && rect.right <= missionMobile.viewport.width + 1 &&
            rect.top >= -1 && rect.bottom <= missionMobile.viewport.height + 1,
            `手機環境任務的 ${name} 被裁切`);
        }
        await browser.evaluate("App.enterLobby()");
        await browser.waitFor("__TEST__.getState().screen === 'lobby'", "環境任務返回大廳");

        const buildViewports = [
          { width: 390, height: 844 },
          { width: 768, height: 1024 }
        ];
        for (const viewport of buildViewports) {
          await browser.setViewport(viewport.width, viewport.height, true);
          await sleep(160);
          const lobbyTopLayout = await browser.evaluate(`(() => {
            const rect = (selector) => {
              const node = document.querySelector(selector);
              const r = node?.getBoundingClientRect();
              return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null;
            };
            const overlap = (a, b) => !a || !b ? 0 :
              Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
              Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            const currency = rect(".lobby-chip-coins");
            const controls = rect(".lobby-topright");
            const help = rect("#gameplay-help-btn");
            const fullscreen = rect("#mobile-fullscreen-btn");
            const objective = rect("#lobby-objective");
            return {
              overlap: overlap(currency, controls),
              helpObjective: overlap(help, objective),
              fullscreenObjective: overlap(fullscreen, objective),
              currency, controls, help, fullscreen, objective
            };
          })()`);
          assert(lobbyTopLayout.overlap === 0 &&
            lobbyTopLayout.helpObjective === 0 &&
            lobbyTopLayout.fullscreenObjective === 0,
            `${viewport.width}x${viewport.height} 大廳幣值與右上控制列重疊：${JSON.stringify(lobbyTopLayout)}`);
          await browser.click('.lobby-topright [data-action="build"]');
          await browser.waitFor(
            "!document.getElementById('build-sheet').classList.contains('hidden')",
            `${viewport.width}x${viewport.height} 建造目錄顯示`
          );
          const buildLayout = await browser.evaluate(`(() => {
            const selectors = ["#build-tab-functional", "#build-tab-decoration", ".build-sheet-wallet", ".build-close"];
            const card = document.querySelector("#build-list .build-card");
            const info = card?.querySelector(".build-card-info");
            const name = card?.querySelector(".build-card-name");
            const infoRect = info?.getBoundingClientRect();
            const nameRect = name?.getBoundingClientRect();
            return {
              width: innerWidth,
              scrollWidth: document.documentElement.scrollWidth,
              firstCard: {
                infoWidth: infoRect?.width || 0,
                nameWidth: nameRect?.width || 0,
                nameHeight: nameRect?.height || 0,
                lineHeight: Number.parseFloat(name ? getComputedStyle(name).lineHeight : "0") || 0
              },
              controls: selectors.map((selector) => {
                const node = document.querySelector(selector);
                const r = node?.getBoundingClientRect();
                return { selector, visible: !!r && r.width > 0 && r.height > 0, left: r?.left, right: r?.right };
              })
            };
          })()`);
          assert(buildLayout.scrollWidth <= buildLayout.width + 1, `${viewport.width}x${viewport.height} 建造頁出現水平捲動`);
          for (const control of buildLayout.controls) {
            assert(control.visible && control.left >= -1 && control.right <= buildLayout.width + 1,
              `${viewport.width}x${viewport.height} 的 ${control.selector} 被水平裁切`);
          }
          if (viewport.width === 390) {
            assert(buildLayout.firstCard.infoWidth >= 120 &&
              buildLayout.firstCard.nameWidth >= 120 &&
              buildLayout.firstCard.nameHeight <= Math.max(48, buildLayout.firstCard.lineHeight * 2.2),
              `390x844 功能建築資訊仍被壓成逐字直排：${JSON.stringify(buildLayout.firstCard)}`);
          }
          await browser.click("#build-tab-decoration");
          assert(await browser.evaluate(
            "document.getElementById('build-tab-decoration').getAttribute('aria-selected') === 'true'"
          ), `${viewport.width}x${viewport.height} 無法切換裝飾頁籤`);
          await browser.click(".build-close");
        }

        await browser.setViewport(844, 390, true);
        await browser.startFirstStage();
        const mobileHudFont = await browser.evaluate(`(() => {
          const mission = document.getElementById("hud-mission");
          const stage = document.getElementById("stage");
          const fontSize = Number.parseFloat(getComputedStyle(mission).fontSize);
          const scale = Number.parseFloat(getComputedStyle(stage).getPropertyValue("--stage-scale")) || 1;
          return { fontSize, scale, physical: fontSize * scale };
        })()`);
        assert(mobileHudFont.physical >= 13,
          `手機橫向追蹤任務字級過小：${JSON.stringify(mobileHudFont)}`);
        assert(await browser.evaluate("__TEST__.clearCurrentStage()"), "手機版無法完成第一關");
        await browser.waitFor("__TEST__.getState().screen === 'victory'", "手機勝利結算顯示");
        const resultViewports = [
          { width: 844, height: 390 },
          { width: 390, height: 844 }
        ];
        for (const viewport of resultViewports) {
          await browser.setViewport(viewport.width, viewport.height, true);
          await sleep(160);
          const mobileResult = await browser.evaluate(`(() => {
            const read = (node) => {
              const rect = node.getBoundingClientRect();
              return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
            };
            const screenNode = document.getElementById("screen-victory");
            const statsNode = document.getElementById("victory-stats");
            const buttonNode = document.querySelector('#screen-victory [data-action="menu"]');
            const button = buttonNode.getBoundingClientRect();
            const centerX = button.left + button.width / 2;
            const centerY = button.top + button.height / 2;
            const hit = centerX >= 0 && centerX <= innerWidth && centerY >= 0 && centerY <= innerHeight
              ? document.elementFromPoint(centerX, centerY) : null;
            return {
              viewport: { width: innerWidth, height: innerHeight },
              scrollWidth: document.documentElement.scrollWidth,
              screen: read(screenNode),
              stats: read(statsNode),
              button: read(buttonNode),
              buttonHit: !!hit && (hit === buttonNode || buttonNode.contains(hit))
            };
          })()`);
          assert(mobileResult.scrollWidth <= mobileResult.viewport.width + 1,
            `${viewport.width}x${viewport.height} 手機結算出現水平捲動`);
          for (const [name, rect] of [["stats", mobileResult.stats], ["button", mobileResult.button]]) {
            assert(rect.left >= -1 && rect.right <= mobileResult.viewport.width + 1 &&
              rect.top >= -1 && rect.bottom <= mobileResult.viewport.height + 1,
              `${viewport.width}x${viewport.height} 手機結算的 ${name} 被裁切`);
          }
          assert(mobileResult.buttonHit,
            `${viewport.width}x${viewport.height} 手機結算返回按鈕中心無法點擊`);
        }
        await browser.setViewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height, false);
      }
    }
  ];

  try {
    await browser.setViewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height, false);
    for (const testCase of cases) {
      const startedAt = Date.now();
      browser.runtimeErrors.length = 0;
      browser.network404.length = 0;
      try {
        await testCase.run();
        const newErrors = browser.runtimeErrors.slice();
        const new404 = [...new Set(browser.network404)];
        assert(newErrors.length === 0, `瀏覽器執行錯誤：${newErrors.join(" | ")}`);
        assert(new404.length === 0, `網路資源 404：${new404.join(" | ")}`);
        const result = {
          name: testCase.name,
          status: "passed",
          durationMs: Date.now() - startedAt,
          network404: new404
        };
        results.push(result);
        console.log(`PASS  ${testCase.name} (${result.durationMs}ms)`);
      } catch (error) {
        const slug = `case-${results.length + 1}`;
        const screenshot = path.join(FAILURE_DIR, `${slug}.png`);
        try { await browser.screenshot(screenshot); } catch {}
        results.push({
          name: testCase.name,
          status: "failed",
          durationMs: Date.now() - startedAt,
          error: error.stack || error.message,
          screenshot: path.relative(ROOT, screenshot).replaceAll("\\", "/"),
          runtimeErrors: browser.runtimeErrors.slice(),
          network404: [...new Set(browser.network404)]
        });
        console.error(`FAIL  ${testCase.name}: ${error.message}`);
      }
    }
  } finally {
    const summary = {
      generatedAt: new Date().toISOString(),
      browser: executablePath,
      passed: results.filter((result) => result.status === "passed").length,
      failed: results.filter((result) => result.status === "failed").length,
      results
    };
    await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    await stopBrowserProcess(launched.browserProcess);
    await server.close();
    await removeProfile(launched.profile);
  }

  const failed = results.filter((result) => result.status === "failed");
  console.log(`\nSmoke summary: ${results.length - failed.length}/${results.length} passed`);
  console.log(`Report: ${OUTPUT_FILE}`);
  if (failed.length) {
    if (typeof process !== "undefined") process.exitCode = 1;
    else throw new Error(`${failed.length} smoke test(s) failed`);
  }
  return { results, failed };
}

const isDirectRun = typeof process !== "undefined" && Array.isArray(process.argv) && process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
