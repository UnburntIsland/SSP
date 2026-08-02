import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "../tools/static-server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_ROOT = process.env.SMOKE_ROOT ? path.resolve(ROOT, process.env.SMOKE_ROOT) : ROOT;
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
  const server = await startStaticServer({ root: SERVER_ROOT, port: 0 });
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
      name: "倒數歸零保證 BOSS 只生成一次",
      run: async () => {
        await browser.prepare("test=1&duration=8&qaSkipIntro=1&seed=1006");
        await browser.startFirstStage();
        const guarantee = await browser.evaluate(`(() => {
          Game.stage.events = [];
          Game.stage.waves = [];
          Game.enemies = [];
          Game.bossSpawned = false;
          Game.bossSpawnReason = null;
          Game.time = Game.runDuration - 0.01;
          Game.update(0.02);
          const firstCount = Game.enemies.filter((enemy) =>
            !enemy.dead && enemy.isBoss && enemy.id === Game.stage.bossId
          ).length;
          const firstBoss = Game.ensureBossSpawned("test-repeat");
          Game.handleEvents();
          const finalCount = Game.enemies.filter((enemy) =>
            !enemy.dead && enemy.isBoss && enemy.id === Game.stage.bossId
          ).length;
          return {
            firstCount,
            finalCount,
            repeatedReturnsExisting: !!firstBoss,
            bossSpawned: Game.bossSpawned,
            reason: Game.bossSpawnReason,
            overtime: Game.overtimeActive
          };
        })()`);
        assert(guarantee.bossSpawned && guarantee.firstCount === 1 && guarantee.finalCount === 1,
          `倒數歸零沒有生成唯一 BOSS：${JSON.stringify(guarantee)}`);
        assert(guarantee.repeatedReturnsExisting && guarantee.reason === "timer" && guarantee.overtime,
          `BOSS 保證機制沒有保持冪等或啟動延長賽：${JSON.stringify(guarantee)}`);
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
        const explanation = await browser.evaluate("document.getElementById('levelup-feedback')?.textContent || ''");
        assert(explanation.includes("正確答案") && explanation.includes("詳解") && explanation.includes("題目複習"),
          "作答後沒有顯示正確答案、詳解或複習入口提示");
        await browser.click(".quiz-continue");
        await browser.waitFor("document.querySelectorAll('#levelup-options .levelup-card').length >= 1", "升級選項顯示");
        await browser.click("#levelup-options .levelup-card", 0);
        await browser.waitFor("!UI.isLevelUpVisible() && !Game.paused", "升級完成");
        assert(await browser.evaluate("__TEST__.clearCurrentStage()"), "無法完成測試關卡");
        await browser.waitFor("__TEST__.getState().screen === 'victory'", "勝利結算顯示");
        const state = await browser.evaluate("__TEST__.getState()");
        assert(state.quizCorrect === 1, "答對題數未寫入當局統計");
        assert(state.save.clearedStages.includes("tidal_flat"), "勝利後未保存通關紀錄");
        const reviewSeed = await browser.evaluate(`(() => {
          const first = Game.quizOrder[Game.quizIndex - 1];
          const wrongQuestion = GameData.sustainabilityQuestions.find((item) => item.id !== first.id);
          const wrongAnswer = wrongQuestion.options.findIndex((_, index) => index !== wrongQuestion.answer);
          Storage.recordQuestionAttempt(wrongQuestion, wrongAnswer, false);
          App.enterLobby();
          App.handleAction("codex");
          UI.setCodexView("questions");
          return {
            wrongId: wrongQuestion.id,
            correctAnswer: wrongQuestion.answer,
            summary: Storage.getQuestionSummary(),
            firstStatus: Storage.getQuestionStatus(first.id),
            wrongStatus: Storage.getQuestionStatus(wrongQuestion.id)
          };
        })()`);
        assert(reviewSeed.firstStatus === "correct" && reviewSeed.wrongStatus === "wrong" &&
          reviewSeed.summary.attempted === 2 && reviewSeed.summary.wrong === 1,
          `題目分類或統計錯誤：${JSON.stringify(reviewSeed)}`);
        await browser.waitFor("document.querySelectorAll('.codex-question-card').length > 0", "題目複習清單顯示");
        const wrongFilterIndex = await browser.evaluate(`Array.from(document.querySelectorAll('.question-review-filter')).findIndex((node) => node.textContent === '答錯')`);
        await browser.click(".question-review-filter", wrongFilterIndex);
        await browser.waitFor("document.querySelectorAll('.codex-question-card.status-wrong').length === 1", "答錯分類顯示");
        await browser.click(".question-card-open", 0);
        await browser.waitFor("!document.getElementById('overlay-question-review').classList.contains('hidden')", "訂正題目開啟");
        await browser.click(".question-practice-option", reviewSeed.correctAnswer);
        await browser.waitFor("document.querySelector('.question-detail-box .question-detail-answer')", "訂正詳解顯示");
        const corrected = await browser.evaluate(`(() => ({
          status: Storage.getQuestionStatus(${JSON.stringify(reviewSeed.wrongId)}),
          summary: Storage.getQuestionSummary(),
          text: document.getElementById('question-review-body')?.textContent || ''
        }))()`);
        assert(corrected.status === "corrected" && corrected.summary.corrected === 1 &&
          corrected.text.includes("正確答案") && corrected.text.includes("詳解"),
          `錯題沒有完成訂正或詳解缺漏：${JSON.stringify(corrected)}`);
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
          delete oldSave.learningEvents;
          const legacyQuestionId = GameData.sustainabilityQuestions[0].id;
          oldSave.questionProgress.byId[legacyQuestionId] = {
            attempts:3,correctCount:2,wrongCount:1,lastSelected:0,lastCorrect:true,
            firstAnsweredAt:Date.now()-2000,lastAnsweredAt:Date.now()-1000,correctedAt:Date.now()-1000
          };
          oldSave.lobby.version = 1;
          oldSave.lobby.playerPosition = { x: 820, y: 500, direction: "S" };
          localStorage.setItem("senloop_save_v1", JSON.stringify(oldSave));
          Storage.data = null;
          Storage.load();
          const persistedLobbyVersion =
            JSON.parse(localStorage.getItem("senloop_save_v1")).lobby.version;
          Storage.getLobby().buildings = [{
            instanceId: "building-99",
            buildingId: "small_tree",
            x: 576,
            y: 512,
            rotation: 0,
            level: 1,
            placed: true
          }];
          Storage.getLobby().inventory = {};
          const relocatedBuildings = Lobby.reconcileFixedLayout();
          const relocation = {
            count: relocatedBuildings,
            placed: Storage.getLobby().buildings.length,
            inventory: Storage.getLobbyInventoryCount("small_tree")
          };
          Storage.getLobby().land.expansionLevel = 0;
          const landLocked = {
            northwest: LobbyWorld.circleInWalkable(480, 225, 15),
            northeast: LobbyWorld.circleInWalkable(1140, 245, 15),
            southwest: LobbyWorld.circleInWalkable(240, 720, 15),
            southeast: LobbyWorld.circleInWalkable(1410, 760, 15)
          };
          Storage.getLobby().land.expansionLevel = 1;
          const landTierOne = {
            northwest: LobbyWorld.circleInWalkable(480, 225, 15),
            southwest: LobbyWorld.circleInWalkable(240, 720, 15),
            northeast: LobbyWorld.circleInWalkable(1140, 245, 15)
          };
          Storage.getLobby().land.expansionLevel = 2;
          const landTierTwo = {
            northeast: LobbyWorld.circleInWalkable(1140, 245, 15),
            southeast: LobbyWorld.circleInWalkable(1410, 760, 15)
          };
          return {
            world: state.world,
            fixed: {
              portal: { x: LobbyWorld.portal.x, y: LobbyWorld.portal.y },
              portalScene: {
                decorations: LobbyWorld.ambientDecorations
                  .filter((item) => item.id === "solar_lamp")
                  .map((item) => ({ x:item.x, y:item.y })),
                collisions: LobbyWorld.fixedCollisionRects
                  .filter((item) => item.name.startsWith("portal-"))
                  .map((item) => ({ x:item.x, y:item.y, w:item.w, h:item.h, name:item.name })),
                reserved: (() => {
                  const item = LobbyWorld.reservedRects.find((rect) => rect.name === "傳送門保留區");
                  return item ? { x:item.x, y:item.y, w:item.w, h:item.h } : null;
                })(),
                oldCenterClear: !LobbyWorld.fixedCollisionRects.some((rect) =>
                  800 >= rect.x && 800 <= rect.x + rect.w && 365 >= rect.y && 365 <= rect.y + rect.h)
              },
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
              workbenchApproach: LobbyWorld.circleInWalkable(676, 530, 15),
              recycleApproach: LobbyWorld.circleInWalkable(920, 530, 15),
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
                  600, 540, 700, 540, 15, LobbyPlacement.collisionRects()
                );
                return p.x >= 667;
              })(),
              footAnchorSafe: (() => {
                const p = Lobby.resolveAvatarPosition(80, 470, 250, 470);
                return LobbyWorld.circleInWalkable(p.x, p.y + 30, 15);
              })()
            },
            unreachable: LobbyPlacement.checkReachability([], null),
            hubDistances: {
              workbench: Math.hypot(LobbyWorld.spawn.x - LobbyWorld.workbench.x, LobbyWorld.spawn.y - LobbyWorld.workbench.y),
              recycle: Math.hypot(
                LobbyWorld.spawn.x - (LobbyWorld.idleZone.x + LobbyWorld.idleZone.w / 2),
                LobbyWorld.spawn.y - (LobbyWorld.idleZone.y + LobbyWorld.idleZone.h / 2)
              )
            },
            migratedVersion: migrated.version,
            migratedPlayerY: migrated.playerPosition.y,
            migratedBuildingY: migrated.buildings[0]?.y,
            persistedLobbyVersion,
            legacyLearningEvents: Storage.getPendingLearningEvents().filter((event) => event.legacy).map((event) => event.kind),
            relocation,
            landStages: { locked: landLocked, tierOne: landTierOne, tierTwo: landTierTwo }
          };
        })()`);
        assert(alignment.world.width === 1600 && alignment.world.height === 1000,
          "大廳世界尺寸不是 1600x1000");
        assert(alignment.world.backgroundWidth === alignment.world.width &&
          alignment.world.backgroundHeight === alignment.world.height,
          "大廳底圖仍被縮放到不同長寬比");
        assert(
          alignment.fixed.portal.x === 800 && alignment.fixed.portal.y === 40 &&
          alignment.fixed.workbench.x === 600 && alignment.fixed.workbench.y === 530 &&
          alignment.fixed.idleZone.x === 900 && alignment.fixed.idleZone.y === 445 &&
          alignment.fixed.idleZone.w === 210 && alignment.fixed.idleZone.h === 170,
          "傳送門未回到北側平台，或工作台與回收區位置錯誤"
        );
        assert(
          alignment.fixed.portalScene.decorations.length === 2 &&
          alignment.fixed.portalScene.decorations.every((item) => item.y === 110) &&
          alignment.fixed.portalScene.collisions.length === 3 &&
          alignment.fixed.portalScene.collisions.every((item) => item.y < 150) &&
          alignment.fixed.portalScene.reserved?.y === 0 &&
          alignment.fixed.portalScene.reserved?.h === 230 &&
          alignment.fixed.portalScene.oldCenterClear,
          `傳送門燈具、碰撞或保留區仍殘留在中央：${JSON.stringify(alignment.fixed.portalScene)}`
        );
        assert(Object.values(alignment.hubDistances).every((distance) => distance <= 260),
          `工作台或回收區離出生點仍太遠：${JSON.stringify(alignment.hubDistances)}`);
        assert(alignment.legacyLearningEvents.includes("quiz_answer") && alignment.legacyLearningEvents.includes("correction"),
          `舊版答題紀錄沒有轉成可稽核事件：${JSON.stringify(alignment.legacyLearningEvents)}`);
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
        assert(Object.values(alignment.landStages.locked).every((value) => value === false) &&
          alignment.landStages.tierOne.northwest && alignment.landStages.tierOne.southwest && !alignment.landStages.tierOne.northeast &&
          alignment.landStages.tierTwo.northeast && alignment.landStages.tierTwo.southeast,
          `土地分階邊界沒有正確開放：${JSON.stringify(alignment.landStages)}`);
        assert(alignment.migratedVersion === 5 &&
          alignment.migratedPlayerY === 556 &&
          alignment.migratedBuildingY === 462 &&
          alignment.persistedLobbyVersion === 5,
          "舊版大廳 Y 座標沒有正確遷移");
        assert(alignment.relocation.count === 1 && alignment.relocation.placed === 0 &&
          alignment.relocation.inventory === 1,
          `與新設施重疊的舊建築未安全收納：${JSON.stringify(alignment.relocation)}`);

        const lobbyTitle = await browser.evaluate(`(() => {
          const title = document.querySelector(".lobby-title-tag");
          const objective = document.getElementById("lobby-objective");
          const titleRect = title.getBoundingClientRect();
          const objectiveRect = objective.getBoundingClientRect();
          const style = getComputedStyle(title);
          return {
            width: titleRect.width,
            bottom: titleRect.bottom,
            objectiveTop: objectiveRect.top,
            backgroundImage: style.backgroundImage,
            color: style.color
          };
        })()`);
        assert(lobbyTitle.width >= 240 && lobbyTitle.backgroundImage.includes("linear-gradient") &&
          lobbyTitle.bottom <= lobbyTitle.objectiveTop,
          `森循島標題橫條不清楚或與任務列重疊：${JSON.stringify(lobbyTitle)}`);

        const lobbyLabels = await browser.evaluate(`(() => {
          const original = UI_THEME.drawOutlinedText;
          const avatar = Lobby.avatar;
          const captures = [];
          const stationNames = ["行動傳送門", "建造工作台", "資源回收區"];
          UI_THEME.drawOutlinedText = function (ctx, text, x, y, options) {
            if (stationNames.includes(text)) captures.push({ text, x, y, cameraX: Lobby.camera.x });
            return original.call(this, ctx, text, x, y, options);
          };
          Lobby.running = false;
          Lobby.avatar = null;
          Lobby.camera.y = 200;
          Lobby.camera.x = 0;
          Lobby.render();
          Lobby.camera.x = 540;
          Lobby.render();
          Lobby.camera.x = 700;
          Lobby.render();
          Lobby.avatar = avatar;
          UI_THEME.drawOutlinedText = original;
          const workbench = captures.filter((entry) => entry.text === "建造工作台");
          return { captures, workbench };
        })()`);
        assert(lobbyLabels.workbench.length === 2 &&
          lobbyLabels.workbench.every((entry) => entry.x === 600),
          `工作台標籤仍隨鏡頭漂移或離場後未隱藏：${JSON.stringify(lobbyLabels.workbench)}`);

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
        await captureLobbyAnchor({ x: 288, y: 0 }, "lobby-upper-portal.png");
      }
    },
    {
      name: "自動回收、離線補算與一次領取",
      run: async () => {
        await browser.prepare("test=1&qaSkipIntro=1&qaIdleInterval=0.2&seed=1008");
        const beforeSettings = await browser.evaluate(`(() => {
          const lobby = Storage.getLobby();
          lobby.recycleGenerator.unclaimed = 0;
          lobby.recycleGenerator.lastAccruedAt = Date.now();
          Storage.save();
          const wallet = Storage.getRecycled();
          App.openSettings("home");
          return { wallet, unclaimed: LobbyEconomy.getStatus().unclaimed };
        })()`);
        await browser.waitFor(
          "App.state === 'SETTINGS_FROM_HOME'",
          "設定頁顯示"
        );
        await browser.waitFor(
          `LobbyEconomy.getStatus().unclaimed > ${beforeSettings.unclaimed}`,
          "設定頁自動回收累積",
          4000
        );
        assert(await browser.evaluate(`Storage.getRecycled() === ${beforeSettings.wallet}`),
          "自動生產不應在領取前直接灌入錢包");
        await browser.evaluate("App.closeSettings()");
        await browser.waitFor("__TEST__.getState().screen === 'lobby'", "設定頁返回大廳");
        const collection = await browser.evaluate(`(() => {
          const lobby = Storage.getLobby();
          lobby.recycleGenerator.lastAccruedAt = Date.now() - 1000;
          Storage.save();
          const before = Storage.getRecycled();
          const generated = LobbyEconomy.settle();
          const ready = LobbyEconomy.getStatus().unclaimed;
          const collected = LobbyEconomy.collect();
          const second = LobbyEconomy.collect();
          return {
            generated, ready, collected, second,
            walletGain: Storage.getRecycled() - before,
            afterReady: LobbyEconomy.getStatus().unclaimed
          };
        })()`);
        assert(collection.generated > 0 && collection.ready > 0,
          "離線時間差沒有補算到回收站");
        assert(collection.collected === collection.ready && collection.walletGain === collection.collected &&
          collection.second === 0 && collection.afterReady === 0,
          `回收站沒有一次領取或重複領取防護：${JSON.stringify(collection)}`);
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

        assert(featureState.schemaVersion === 12 && featureState.hasMissionSave &&
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
      name: "v1.3 帳號、跨裝置同步與衝突復原",
      run: async () => {
        await browser.setViewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height, false);
        await browser.prepare("test=1&qaCloud=1&qaSkipIntro=1&forceMobile=1&seed=1013");
        await browser.waitFor("CloudSync.configured && CloudSync.getState().status === 'guest'", "模擬雲端準備");
        await browser.evaluate("CloudSync.__qaResetCloud(); true");
        await browser.click('.lobby-topright [data-action="account"]');
        await browser.waitFor("App.state === 'ACCOUNT' && !!document.getElementById('cloud-email')", "帳號畫面顯示");

        await browser.evaluate(`(() => {
          document.getElementById("cloud-email").value = "guardian@example.com";
          document.getElementById("cloud-password").value = "GreenIsland123!";
          return true;
        })()`);
        await browser.click('[data-action="cloud-register"]');
        await browser.waitFor(
          "CloudSync.getState().signedIn && !CloudSync.getState().syncing && CloudSync.getState().baseRevision === 1",
          "註冊後首次上傳"
        );
        const registered = await browser.evaluate(`(() => {
          const state = CloudSync.getState();
          const saves = JSON.parse(localStorage.getItem("senloop_mock_cloud_saves_v1") || "{}");
          return {
            email: state.user?.email,
            revision: state.baseRevision,
            pending: state.pending,
            hasRemote: !!saves[state.user?.id],
            passwordInputGone: !document.getElementById("cloud-password")
          };
        })()`);
        assert(registered.email === "guardian@example.com" && registered.revision === 1 &&
          !registered.pending && registered.hasRemote && registered.passwordInputGone,
          `註冊或首次雲端存檔錯誤：${JSON.stringify(registered)}`);

        await browser.evaluate("Storage.addCoins(125); true");
        await browser.waitFor("CloudSync.getState().pending", "本機變更排入同步");
        await browser.click('[data-action="cloud-sync"]');
        await browser.waitFor(
          "!CloudSync.getState().syncing && !CloudSync.getState().pending && CloudSync.getState().baseRevision === 2",
          "手動同步完成"
        );

        const conflictSeed = await browser.evaluate(`(() => {
          const remote = Storage.exportCloudData();
          remote.coins = 777;
          CloudSync.__qaSeedRemote(remote, CloudSync.getState().baseRevision + 1);
          Storage.addCoins(3);
          CloudSync.syncNow({ manual:true });
          return { localCoins:Storage.getCoins(), remoteCoins:remote.coins };
        })()`);
        await browser.waitFor(
          "CloudSync.getState().status === 'conflict' && !document.getElementById('overlay-cloud-conflict').classList.contains('hidden')",
          "跨裝置衝突選擇顯示"
        );
        const conflict = await browser.evaluate(`(() => ({
          localText:document.getElementById("cloud-conflict-local")?.textContent || "",
          cloudText:document.getElementById("cloud-conflict-cloud")?.textContent || "",
          localButton:!!document.querySelector('[data-action="cloud-conflict-local"]:not([disabled])'),
          cloudButton:!!document.querySelector('[data-action="cloud-conflict-cloud"]:not([disabled])')
        }))()`);
        assert(conflict.localText.replaceAll(",", "").includes(String(conflictSeed.localCoins)) && conflict.cloudText.includes("777") &&
          conflict.localButton && conflict.cloudButton,
          `衝突畫面未同時呈現兩份進度：${JSON.stringify(conflict)}`);
        await browser.evaluate(`(() => {
          const newer = Storage.exportCloudData();
          newer.coins = 888;
          CloudSync.__qaSeedRemote(newer, 4);
          return true;
        })()`);
        await browser.click('[data-action="cloud-conflict-local"]');
        await browser.waitFor(
          "CloudSync.getState().status === 'conflict' && CloudSync.getState().conflict.revision === 4",
          "第三台裝置更新後重新確認衝突"
        );
        await browser.click('[data-action="cloud-conflict-local"]');
        await browser.waitFor(
          "CloudSync.getState().status === 'synced' && CloudSync.getState().baseRevision === 5",
          "保留本機版本"
        );
        const localResolved = await browser.evaluate(`(() => {
          const state = CloudSync.getState();
          const row = JSON.parse(localStorage.getItem("senloop_mock_cloud_saves_v1") || "{}")[state.user.id];
          return { local:Storage.getCoins(), remote:row?.payload?.coins, revision:row?.revision };
        })()`);
        assert(localResolved.local === conflictSeed.localCoins && localResolved.remote === conflictSeed.localCoins && localResolved.revision === 5,
          `保留本機版本沒有安全寫回雲端：${JSON.stringify(localResolved)}`);

        await browser.evaluate(`(() => {
          const cloud = Storage.exportCloudData();
          cloud.coins = 777;
          CloudSync.__qaSeedRemote(cloud, 6);
          Storage.addCoins(1);
          CloudSync.syncNow({ manual:true });
          return true;
        })()`);
        await browser.waitFor(
          "CloudSync.getState().status === 'conflict' && !document.getElementById('overlay-cloud-conflict').classList.contains('hidden')",
          "第二次跨裝置衝突"
        );
        await browser.click('[data-action="cloud-conflict-cloud"]');
        await browser.waitFor(
          "Storage.getCoins() === 777 && CloudSync.getState().status === 'synced' && CloudSync.getState().baseRevision === 6 && App.state === 'LOBBY'",
          "套用雲端版本"
        );

        await browser.click('.lobby-topright [data-action="account"]');
        await browser.waitFor(`App.state === "ACCOUNT" && !!document.querySelector('[data-action="cloud-link-google"]')`, "重新開啟帳號畫面");
        await browser.click('[data-action="cloud-link-google"]');
        await browser.waitFor(
          "CloudSync.getState().user.identities.some((identity) => identity.provider === 'google')",
          "Google 身分連結"
        );

        const accountViewports = [
          { width:1280, height:720, mobile:false, name:"desktop" },
          { width:844, height:390, mobile:true, name:"phone-landscape" },
          { width:768, height:1024, mobile:true, name:"tablet" },
          { width:390, height:844, mobile:true, name:"phone-portrait" }
        ];
        for (const viewport of accountViewports) {
          await browser.setViewport(viewport.width, viewport.height, viewport.mobile);
          await sleep(180);
          await browser.evaluate(`(() => {
            const hint = document.getElementById("rotate-hint");
            if (hint && !hint.classList.contains("hidden")) document.querySelector(".rotate-hint-close")?.click();
            return true;
          })()`);
          await sleep(80);
          const layout = await browser.evaluate(`(() => {
            const read = (selector) => {
              const node = document.querySelector(selector);
              const rect = node?.getBoundingClientRect();
              if (!node || !rect) return null;
              const centerX = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
              const centerY = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
              const hit = document.elementFromPoint(centerX, centerY);
              return { left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom,
                width:rect.width, height:rect.height, hit:!!hit && (hit === node || node.contains(hit)) };
            };
            return {
              viewport:{ width:innerWidth, height:innerHeight },
              scrollWidth:document.documentElement.scrollWidth,
              content:read("#account-content"),
              back:read('#screen-account [data-action="back"]'),
              tutorialHidden:document.getElementById("tutorial-coach").classList.contains("hidden"),
              buttons:Array.from(document.querySelectorAll("#screen-account button:not([disabled])")).map((node) => {
                const r=node.getBoundingClientRect(); return { width:r.width, height:r.height, left:r.left, right:r.right, top:r.top, bottom:r.bottom };
              })
            };
          })()`);
          assert(layout.scrollWidth <= layout.viewport.width + 1 && layout.content &&
            layout.content.left >= -1 && layout.content.right <= layout.viewport.width + 1,
            `${viewport.name} 帳號內容水平裁切：${JSON.stringify(layout)}`);
          assert(layout.tutorialHidden, `${viewport.name} 教學卡不應覆蓋帳號頁`);
          assert(layout.back && layout.back.left >= -1 && layout.back.right <= layout.viewport.width + 1 &&
            layout.back.top >= -1 && layout.back.bottom <= layout.viewport.height + 1 && layout.back.hit,
            `${viewport.name} 返回按鈕被遮擋或無法點擊：${JSON.stringify(layout.back)}`);
          assert(layout.buttons.every((button) => button.width >= 44 && button.height >= 44 &&
            button.left >= -1 && button.right <= layout.viewport.width + 1 &&
            button.top >= -1 && button.bottom <= layout.viewport.height + 1),
            `${viewport.name} 帳號按鈕被裁切或點擊區過小：${JSON.stringify(layout.buttons)}`);
        }

        await browser.setViewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height, false);
        await browser.click('[data-action="cloud-logout"]');
        await browser.waitFor("!CloudSync.getState().signedIn && !!document.getElementById('cloud-email')", "登出保留本機存檔");
        await browser.evaluate(`(() => {
          Storage.reset();
          localStorage.removeItem("senloop_cloud_sync_meta_v1");
          document.getElementById("cloud-email").value = "guardian@example.com";
          document.getElementById("cloud-password").value = "GreenIsland123!";
          return true;
        })()`);
        await browser.click('[data-action="cloud-login"]');
        await browser.waitFor(
          "CloudSync.getState().signedIn && CloudSync.getState().status === 'synced' && Storage.getCoins() === 777 && App.state === 'LOBBY'",
          "新裝置登入下載雲端存檔"
        );
        const restored = await browser.evaluate(`(() => ({
          coins:Storage.getCoins(),
          google:CloudSync.getState().user.identities.some((identity) => identity.provider === "google"),
          pending:CloudSync.getState().pending,
          revision:CloudSync.getState().baseRevision
        }))()`);
        assert(restored.coins === 777 && restored.google && !restored.pending && restored.revision === 6,
          `跨裝置登入未恢復完整雲端狀態：${JSON.stringify(restored)}`);
      }
    },
    {
      name: "v1.4 班級代碼、派作業、驗收與班級總覽",
      run: async () => {
        await browser.setViewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height, false);
        await browser.prepare("test=1&qaCloud=1&qaSkipIntro=1&forceMobile=1&seed=1014");
        await browser.evaluate("CloudSync.__qaResetCloud(); Education.__qaReset(); true");
        await browser.waitFor("CloudSync.configured && CloudSync.getState().status === 'guest'", "v1.4 模擬雲端準備");

        await browser.click('.lobby-topright [data-action="account"]');
        await browser.waitFor("App.state === 'ACCOUNT' && !!document.getElementById('cloud-email')", "教師帳號註冊畫面");
        await browser.evaluate(`(() => {
          document.getElementById("cloud-email").value = "teacher@example.com";
          document.getElementById("cloud-password").value = "TeacherCloud123!";
          return true;
        })()`);
        await browser.click('[data-action="cloud-register"]');
        await browser.waitFor("CloudSync.getState().signedIn && !!Education.profile", "教師帳號與教育 profile 建立");
        assert(await browser.evaluate("Education.__qaSetRole('teacher')"), "無法在隔離測試資料建立教師角色");
        await browser.waitFor("Education.getState().role === 'teacher'", "教師權限載入");
        await browser.evaluate("App.enterLobby(); true");
        await browser.click('.lobby-topright [data-action="education"]');
        await browser.waitFor("App.state === 'EDUCATION' && !!document.getElementById('teacher-class-name')", "教師後台顯示");

        await browser.evaluate(`(() => {
          document.getElementById("teacher-class-name").value = "五年三班";
          return true;
        })()`);
        await browser.click('[data-action="education-create-class"]');
        await browser.waitFor("Education.getState().classes.length === 1 && !!document.getElementById('teacher-assignment-title')", "建立班級與代碼");
        const classInfo = await browser.evaluate(`(() => {
          const state = Education.getState();
          return { id:state.classes[0]?.id, code:state.classes[0]?.code, name:state.classes[0]?.name,
            codeText:document.querySelector(".teacher-class-summary .class-code-display")?.textContent || "" };
        })()`);
        assert(classInfo.name === "五年三班" && /^[A-Z0-9]{6}$/.test(classInfo.code) && classInfo.codeText.includes(classInfo.code),
          `班級或六位代碼錯誤：${JSON.stringify(classInfo)}`);

        await browser.evaluate(`(() => {
          document.getElementById("teacher-assignment-title").value = "永續知識小測";
          document.getElementById("teacher-assignment-description").value = "完成兩次永續知識作答後送交老師。";
          document.getElementById("teacher-assignment-kind").value = "quiz_count";
          document.getElementById("teacher-assignment-count").value = "2";
          return true;
        })()`);
        await browser.click('[data-action="education-create-assignment"]');
        await browser.waitFor("Education.getState().assignments.length === 1", "教師派發作業");
        const assignmentInfo = await browser.evaluate(`(() => {
          const item=Education.getState().assignments[0];
          return { id:item?.id, title:item?.title, kind:item?.kind, count:item?.target?.count };
        })()`);
        assert(assignmentInfo.title === "永續知識小測" && assignmentInfo.kind === "quiz_count" && assignmentInfo.count === 2,
          `派作業資料錯誤：${JSON.stringify(assignmentInfo)}`);

        await browser.evaluate("CloudSync.signOut()");
        await browser.waitFor("!CloudSync.getState().signedIn", "教師登出");
        await browser.evaluate(`(async () => {
          Storage.reset();
          await CloudSync.signUp("student@example.com", "StudentCloud123!");
          return true;
        })()`);
        await browser.waitFor("CloudSync.getState().signedIn && Education.getState().role === 'student'", "學生帳號建立");
        await browser.evaluate("App.enterLobby(); true");
        await browser.click('.lobby-topright [data-action="education"]');
        await browser.waitFor("App.state === 'EDUCATION' && !!document.getElementById('education-class-code')", "學生班級中心顯示");
        await browser.evaluate(`document.getElementById("education-class-code").value=${JSON.stringify(classInfo.code)}`);
        await browser.click('[data-action="education-join-class"]');
        await browser.waitFor("Education.getState().classes.length === 1 && document.querySelectorAll('.student-assignment-card').length === 1", "學生以代碼加入班級");

        const denied = await browser.evaluate(`(async () => {
          const before=Education.__qaData().classes.length;
          const ok=await Education.createClass("不應建立的班級");
          return { ok, before, after:Education.__qaData().classes.length, role:Education.getState().role };
        })()`);
        assert(!denied.ok && denied.before === denied.after && denied.role === "student",
          `學生不應能建立班級：${JSON.stringify(denied)}`);

        await browser.evaluate(`(async () => {
          const questions=GameData.sustainabilityQuestions.slice(0,2);
          questions.forEach((question) => Storage.recordQuestionAttempt(question, question.answer, true));
          await Education.syncProgress();
          return true;
        })()`);
        await browser.waitFor("Education.getState().submissions.some((row) => row.status === 'pending_review')", "學生達標後自動送驗");
        const studentView = await browser.evaluate(`(() => ({
          status:Education.getState().submissions[0]?.status,
          progress:Education.getState().submissions[0]?.progress,
          card:document.querySelector(".student-assignment-card")?.textContent || "",
          teacherForm:!!document.getElementById("teacher-class-name")
        }))()`);
        assert(studentView.status === "pending_review" && studentView.progress >= 2 &&
          studentView.card.includes("等待老師驗收") && !studentView.teacherForm,
          `學生自動送驗或權限介面錯誤：${JSON.stringify(studentView)}`);

        await browser.evaluate(`(async () => {
          await CloudSync.signOut();
          await CloudSync.signIn("teacher@example.com", "TeacherCloud123!");
          return true;
        })()`);
        await browser.waitFor("CloudSync.getState().signedIn && Education.getState().role === 'teacher'", "教師重新登入");
        await browser.evaluate("App.enterLobby(); true");
        await browser.click('.lobby-topright [data-action="education"]');
        await browser.waitFor("document.querySelectorAll('[data-action=\"education-review-accept\"]').length === 1", "教師看到待驗成果");
        const pendingOverview = await browser.evaluate(`(() => ({
          students:Education.getState().members.length,
          pending:Education.getState().submissions.filter((row) => row.status === "pending_review").length,
          matrix:document.querySelector(".class-matrix")?.textContent || ""
        }))()`);
        assert(pendingOverview.students === 1 && pendingOverview.pending === 1 &&
          pendingOverview.matrix.includes("student") && pendingOverview.matrix.includes("待驗收"),
          `教師班級總覽未呈現學生待驗狀態：${JSON.stringify(pendingOverview)}`);
        await browser.evaluate(`document.querySelector('.teacher-review-feedback').value="請先完成錯題訂正，再重新送出。"`);
        await browser.click('[data-action="education-review-return"]');
        await browser.waitFor("Education.getState().submissions.some((row) => row.status === 'needs_revision')", "教師自訂回饋退回");
        const returned = await browser.evaluate(`(() => { const row=Education.getState().submissions[0]; return {feedback:row?.feedback,status:row?.status}; })()`);
        assert(returned.status === "needs_revision" && returned.feedback === "請先完成錯題訂正，再重新送出。",
          `教師自訂退回回饋沒有保存：${JSON.stringify(returned)}`);
        await browser.evaluate(`(async () => { const row=Education.getState().submissions[0]; await Education.review(row.assignment_id,row.student_id,"accepted",""); return true; })()`);
        await browser.waitFor("Education.getState().submissions.some((row) => row.status === 'accepted')", "教師驗收通過");
        const acceptedOverview = await browser.evaluate(`(() => ({
          accepted:Education.getState().submissions.filter((row) => row.status === "accepted").length,
          pending:Education.getState().submissions.filter((row) => row.status === "pending_review").length,
          text:document.getElementById("education-content")?.textContent || "",
          returnButton:!!document.querySelector('[data-action="education-review-return"]')
        }))()`);
        assert(acceptedOverview.accepted === 1 && acceptedOverview.pending === 0 &&
          acceptedOverview.text.includes("已通過") && !acceptedOverview.returnButton,
          `教師驗收或總覽更新錯誤：${JSON.stringify(acceptedOverview)}`);

        const educationViewports = [
          { width:1280, height:720, mobile:false, name:"desktop" },
          { width:844, height:390, mobile:true, name:"phone-landscape" },
          { width:390, height:844, mobile:true, name:"phone-portrait" },
          { width:768, height:1024, mobile:true, name:"tablet" }
        ];
        for (const viewport of educationViewports) {
          await browser.setViewport(viewport.width, viewport.height, viewport.mobile);
          await sleep(180);
          await browser.evaluate(`(() => {
            const hint=document.getElementById("rotate-hint");
            if(hint&&!hint.classList.contains("hidden")) document.querySelector(".rotate-hint-close")?.click();
            return true;
          })()`);
          await sleep(80);
          const layout = await browser.evaluate(`(() => {
            const read=(selector)=>{const node=document.querySelector(selector),r=node?.getBoundingClientRect();return r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}:null};
            const contentRect=document.getElementById("education-content").getBoundingClientRect();
            const visibleButtons=Array.from(document.querySelectorAll("#screen-education button:not([disabled])")).map((node)=>{const r=node.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;const inFooter=!!node.closest(".education-footer");const visible=x>=0&&x<=innerWidth&&y>=0&&y<=innerHeight&&(inFooter||(y>=contentRect.top&&y<=contentRect.bottom));let hit=true;if(visible){const found=document.elementFromPoint(x,y);hit=!!found&&(found===node||node.contains(found));}return {text:node.textContent.trim(),left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,visible,hit};});
            return { viewport:{width:innerWidth,height:innerHeight}, scrollWidth:document.documentElement.scrollWidth,
              screen:read("#screen-education"),content:read("#education-content"),footer:read("#screen-education .education-footer"),
              tutorialHidden:document.getElementById("tutorial-coach").classList.contains("hidden"),buttons:visibleButtons };
          })()`);
          assert(layout.scrollWidth <= layout.viewport.width + 1 && layout.content &&
            layout.content.left >= -1 && layout.content.right <= layout.viewport.width + 1,
            `${viewport.name} 教師後台水平裁切：${JSON.stringify(layout)}`);
          assert(layout.footer && layout.footer.top >= -1 && layout.footer.bottom <= layout.viewport.height + 1 && layout.tutorialHidden,
            `${viewport.name} 教師後台頁尾或教學卡遮擋：${JSON.stringify(layout)}`);
          assert(layout.buttons.every((button) => button.width >= 44 && button.height >= 44 &&
            button.left >= -1 && button.right <= layout.viewport.width + 1 && (!button.visible || button.hit)),
            `${viewport.name} 教師後台按鈕被裁切或無法點擊：${JSON.stringify(layout.buttons)}`);
        }
        await browser.setViewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height, false);
      }
    },
    {
      name: "v1.5 土地擴張、小屋、實驗室與回收場",
      run: async () => {
        await browser.setViewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height, false);
        await browser.prepare("test=1&qaCloud=1&qaSkipIntro=1&forceMobile=1&seed=1015");
        const initial = await browser.evaluate(`(() => {
          Storage.getLobby().materials.recycled = 0;
          const insufficient = IslandSpaces.expand(1);
          Storage.getLobby().materials.recycled = 150;
          Storage.save();
          return {
            schema:Storage.data.schemaVersion,
            lobbyVersion:Storage.getLobby().version,
            level:Storage.getLobbyExpansionLevel(),
            northwest:LobbyWorld.circleInWalkable(480,225,15),
            northeast:LobbyWorld.circleInWalkable(1140,245,15),
            outOfOrder:IslandSpaces.expand(2),insufficient
          };
        })()`);
        assert(initial.schema === 12 && initial.lobbyVersion === 5 && initial.level === 0 &&
          !initial.northwest && !initial.northeast && initial.outOfOrder === false && initial.insufficient === false,
          `v1.5 初始土地或存檔遷移錯誤：${JSON.stringify(initial)}`);

        await browser.click('[data-action="build"]');
        await browser.waitFor("App.state === 'LOBBY_BUILD'", "開啟土地擴張工作台");
        await browser.click('#build-tab-land');
        await browser.waitFor("document.querySelectorAll('.land-expansion-card').length === 2", "土地擴張卡片顯示");
        await browser.click('[data-action="island-expand"][data-expansion-level="1"]');
        const tierOne = await browser.evaluate(`(() => ({
          level:Storage.getLobbyExpansionLevel(),materials:Storage.getRecycled(),
          northwest:LobbyWorld.circleInWalkable(480,225,15),
          southwest:LobbyWorld.circleInWalkable(240,720,15),
          northeast:LobbyWorld.circleInWalkable(1140,245,15),
          cottage:IslandSpaces.isUnlocked("cottage"),laboratory:IslandSpaces.isUnlocked("laboratory")
        }))()`);
        assert(tierOne.level === 1 && tierOne.materials === 130 && tierOne.northwest && tierOne.southwest &&
          !tierOne.northeast && tierOne.cottage && !tierOne.laboratory,
          `第一階段土地擴張錯誤：${JSON.stringify(tierOne)}`);

        await browser.click('[data-action="island-expand"][data-expansion-level="2"]');
        const tierTwo = await browser.evaluate(`(() => ({
          level:Storage.getLobbyExpansionLevel(),materials:Storage.getRecycled(),
          northeast:LobbyWorld.circleInWalkable(1140,245,15),
          southeast:LobbyWorld.circleInWalkable(1410,760,15),
          lab:IslandSpaces.isUnlocked("laboratory"),yard:IslandSpaces.isUnlocked("recycleYard"),
          unreachable:LobbyPlacement.checkReachability([],null)
        }))()`);
        assert(tierTwo.level === 2 && tierTwo.materials === 85 && tierTwo.northeast && tierTwo.southeast &&
          tierTwo.lab && tierTwo.yard && tierTwo.unreachable.length === 0,
          `第二階段土地擴張或可達性錯誤：${JSON.stringify(tierTwo)}`);

        await browser.click('[data-action="build-close"]');
        await browser.click('[data-action="island-spaces"]');
        await browser.waitFor("App.state === 'ISLAND_SPACES' && document.querySelectorAll('.island-space-card').length === 3", "島嶼空間總覽顯示");
        await browser.click('[data-action="island-open-space"][data-space-id="cottage"]');
        const coinsBeforeRest = await browser.evaluate("Storage.getCoins()");
        await browser.click('[data-action="cottage-rest"]');
        const cottage = await browser.evaluate(`(() => ({
          coinGain:Storage.getCoins()-${coinsBeforeRest},claims:Storage.getIslandSpaces().cottage.restClaims,
          buttonDisabled:document.querySelector('[data-action="cottage-rest"]')?.disabled,
          text:document.getElementById("island-space-content")?.textContent||""
        }))()`);
        assert(cottage.coinGain === 50 && cottage.claims === 1 && cottage.buttonDisabled && cottage.text.includes("今天已整理完成"),
          `小屋每日整理錯誤：${JSON.stringify(cottage)}`);

        const cottageClock = await browser.evaluate(`(() => {
          CloudSync.__qaSetTrustedTime(Date.UTC(2030,0,2,12));
          IslandSpaces.renderCottage();
          const readyNextDay=!document.querySelector('[data-action="cottage-rest"]')?.disabled;
          IslandSpaces.restCottage();
          CloudSync.__qaSetTrustedTime(Date.UTC(2030,0,1,12));
          IslandSpaces.renderCottage();
          return {readyNextDay,rollbackBlocked:document.querySelector('[data-action="cottage-rest"]')?.disabled,
            claims:Storage.getIslandSpaces().cottage.restClaims,lastDate:Storage.getIslandSpaces().cottage.lastRestDate};
        })()`);
        assert(cottageClock.readyNextDay && cottageClock.rollbackBlocked && cottageClock.claims === 2 && cottageClock.lastDate === "2030-01-02",
          `小屋伺服器日期或時鐘倒退防護錯誤：${JSON.stringify(cottageClock)}`);

        await browser.click('[data-action="island-space-back"]');
        await browser.click('[data-action="island-open-space"][data-space-id="laboratory"]');
        const beforeResearch = await browser.evaluate(`(() => ({materials:Storage.getRecycled(),interval:LobbyEconomy.getInterval(),capacity:LobbyEconomy.getCapacity()}))()`);
        await browser.click('[data-action="laboratory-research"][data-research-id="recycleSpeed"]');
        await browser.click('[data-action="laboratory-research"][data-research-id="recycleCapacity"]');
        await browser.evaluate("Storage.getLobby().materials.recycled += 5; Storage.save(); IslandSpaces.renderLaboratory(); true");
        await browser.click('[data-action="laboratory-research"][data-research-id="recycleSpeed"]');
        await browser.click('[data-action="laboratory-research"][data-research-id="recycleCapacity"]');
        const research = await browser.evaluate(`(() => ({
          materials:Storage.getRecycled(),speed:Storage.getIslandSpaces().laboratory.research.recycleSpeed,
          capacityLevel:Storage.getIslandSpaces().laboratory.research.recycleCapacity,
          interval:LobbyEconomy.getInterval(),capacity:LobbyEconomy.getCapacity(),dailyCap:LobbyEconomy.getDailyCap()
        }))()`);
        assert(beforeResearch.materials - research.materials === 85 && beforeResearch.interval === 20 &&
          research.speed === 2 && research.capacityLevel === 2 && research.interval === 16 &&
          research.capacity === 90 && research.dailyCap === 90,
          `實驗室研究未套用自動回收：${JSON.stringify({beforeResearch,research})}`);

        await browser.click('[data-action="island-space-back"]');
        await browser.click('[data-action="island-open-space"][data-space-id="recycleYard"]');
        await browser.evaluate(`(() => {
          const generator=Storage.getLobby().recycleGenerator;
          generator.unclaimed=3;generator.lastAccruedAt=GameClock.now();Storage.save();
          IslandSpaces.renderRecycleYard();return true;
        })()`);
        const materialsBeforeCollect = await browser.evaluate("Storage.getRecycled()");
        await browser.click('[data-action="recycle-yard-collect"]');
        assert(await browser.evaluate(`Storage.getRecycled()-${materialsBeforeCollect}===3 && LobbyEconomy.getStatus().unclaimed===0`),
          "回收場沒有一次領取自動累積材料");

        const beforeGameMaterials = await browser.evaluate("Storage.getRecycled()");
        await browser.click('[data-action="recycle-game-start"]');
        assert(await browser.evaluate("Storage.getIslandSpaces().recycleYard.playsToday===0"), "分類挑戰開始時不應先扣每日次數");
        const firstBin = await browser.evaluate("IslandSpaces.game.items[IslandSpaces.game.index].bin");
        await browser.click(`[data-action="recycle-sort-choice"][data-bin-id="${firstBin}"]`);
        const interrupted = await browser.evaluate(`(() => ({active:!!Storage.getIslandSpaces().recycleYard.activeGame,
          awaiting:IslandSpaces.game?.awaitingNext,index:IslandSpaces.game?.index,plays:Storage.getIslandSpaces().recycleYard.playsToday}))()`);
        assert(interrupted.active && interrupted.awaiting && interrupted.index === 0 && interrupted.plays === 0,
          `分類挑戰中斷保存錯誤：${JSON.stringify(interrupted)}`);

        await browser.navigate("test=1&qaCloud=1&qaSkipIntro=1&forceMobile=1&seed=1015");
        await browser.evaluate(`(() => { App.openIslandSpaces(); App.openIslandSpace("recycleYard"); return true; })()`);
        const resumed = await browser.evaluate(`(() => ({awaiting:IslandSpaces.game?.awaitingNext,index:IslandSpaces.game?.index,
          feedback:!!IslandSpaces.game?.feedback,plays:Storage.getIslandSpaces().recycleYard.playsToday}))()`);
        assert(resumed.awaiting && resumed.index === 0 && resumed.feedback && resumed.plays === 0,
          `重新載入後沒有續接分類挑戰：${JSON.stringify(resumed)}`);
        await browser.click('[data-action="recycle-sort-next"]');
        for (let index = 1; index < 5; index += 1) {
          const bin = await browser.evaluate("IslandSpaces.game.items[IslandSpaces.game.index].bin");
          await browser.click(`[data-action="recycle-sort-choice"][data-bin-id="${bin}"]`);
          await browser.click('[data-action="recycle-sort-next"]');
        }
        const sorting = await browser.evaluate(`(() => ({
          finished:IslandSpaces.game?.finished,score:IslandSpaces.game?.correct,reward:IslandSpaces.game?.reward,
          gain:Storage.getRecycled()-${beforeGameMaterials},plays:Storage.getIslandSpaces().recycleYard.playsToday,
          best:Storage.getIslandSpaces().recycleYard.bestScore,total:Storage.getIslandSpaces().recycleYard.totalSorted,
          result:document.querySelector('.sorting-result')?.textContent||""
        }))()`);
        assert(sorting.finished && sorting.score === 5 && sorting.reward === 13 && sorting.gain === 13 &&
          sorting.plays === 1 && sorting.best === 5 && sorting.total === 5 && sorting.result.includes("完美獎勵"),
          `回收分類挑戰或獎勵錯誤：${JSON.stringify(sorting)}`);

        const dailyLimit = await browser.evaluate(`(() => {
          function finish(){ IslandSpaces.dismissGame(); IslandSpaces.startRecycleGame(); while(IslandSpaces.game&&!IslandSpaces.game.finished){
            IslandSpaces.sortChoice(IslandSpaces.game.items[IslandSpaces.game.index].bin); IslandSpaces.nextSortItem();
          }}
          finish();finish();
          const before={plays:Storage.getIslandSpaces().recycleYard.playsToday,blocked:IslandSpaces.startRecycleGame()===false};
          CloudSync.__qaSetTrustedTime(Date.UTC(2030,0,3,12));
          const reset=IslandSpaces.ensureYardDay();
          CloudSync.__qaSetTrustedTime(Date.UTC(2030,0,2,12));
          const rollback=IslandSpaces.ensureYardDay();
          return {before,after:reset.playsToday,date:reset.dateKey,rollbackDate:rollback.dateKey};
        })()`);
        assert(dailyLimit.before.plays === 3 && dailyLimit.before.blocked && dailyLimit.after === 0 &&
          dailyLimit.date === "2030-01-03" && dailyLimit.rollbackDate === "2030-01-03",
          `回收場每日上限或日期回退防護錯誤：${JSON.stringify(dailyLimit)}`);

        await browser.navigate("test=1&qaSkipIntro=1&forceMobile=1&seed=1015");
        const persisted = await browser.evaluate(`(() => {
          const f=LobbyWorld.facilities.cottage;
          Lobby.avatar.x=f.x+60;Lobby.avatar.y=f.y;Lobby.updateInteractions();
          return {schema:Storage.data.schemaVersion,level:Storage.getLobbyExpansionLevel(),
            speed:Storage.getIslandSpaces().laboratory.research.recycleSpeed,
            capacity:Storage.getIslandSpaces().laboratory.research.recycleCapacity,
            best:Storage.getIslandSpaces().recycleYard.bestScore,interaction:Lobby.nearestInteraction?.kind};
        })()`);
        assert(persisted.schema === 12 && persisted.level === 2 && persisted.speed === 2 && persisted.capacity === 2 &&
          persisted.best === 5 && persisted.interaction === "facility:cottage",
          `v1.5 重新載入或大廳入口錯誤：${JSON.stringify(persisted)}`);

        await browser.evaluate(`(() => { App.openIslandSpaces(); App.openIslandSpace("recycleYard"); IslandSpaces.startRecycleGame(); return true; })()`);
        const viewports = [
          { width:1280,height:720,mobile:false,name:"desktop" },
          { width:844,height:390,mobile:true,name:"phone-landscape" },
          { width:390,height:844,mobile:true,name:"phone-portrait" },
          { width:768,height:1024,mobile:true,name:"tablet" }
        ];
        for (const viewport of viewports) {
          await browser.setViewport(viewport.width,viewport.height,viewport.mobile);
          await sleep(160);
          await browser.evaluate(`(() => { const hint=document.getElementById("rotate-hint"); if(hint&&!hint.classList.contains("hidden")) document.querySelector(".rotate-hint-close")?.click(); return true; })()`);
          await sleep(70);
          const layout = await browser.evaluate(`(() => {
            const read=(selector)=>{const n=document.querySelector(selector),r=n?.getBoundingClientRect();return r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}:null};
            const content=read("#island-space-content"),footer=read("#screen-island-spaces .island-space-footer");
            const buttons=Array.from(document.querySelectorAll("#screen-island-spaces button:not([disabled])")).map((n)=>{const r=n.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;const visible=x>=0&&x<=innerWidth&&y>=0&&y<=innerHeight&&(n.closest(".island-space-footer")||(y>=content.top&&y<=content.bottom));let hit=true;if(visible){const f=document.elementFromPoint(x,y);hit=!!f&&(f===n||n.contains(f));}return {text:n.textContent.trim(),left:r.left,right:r.right,width:r.width,height:r.height,visible,hit};});
            return {viewport:{width:innerWidth,height:innerHeight},scrollWidth:document.documentElement.scrollWidth,content,footer,buttons,tutorialHidden:document.getElementById("tutorial-coach").classList.contains("hidden")};
          })()`);
          assert(layout.scrollWidth <= layout.viewport.width + 1 && layout.content && layout.content.left >= -1 && layout.content.right <= layout.viewport.width + 1,
            `${viewport.name} 島嶼空間水平裁切：${JSON.stringify(layout)}`);
          assert(layout.footer && layout.footer.top >= -1 && layout.footer.bottom <= layout.viewport.height + 1 && layout.tutorialHidden,
            `${viewport.name} 島嶼空間頁尾或教學遮擋：${JSON.stringify(layout)}`);
          assert(layout.buttons.every((button) => button.width >= 44 && button.height >= 44 && button.left >= -1 && button.right <= layout.viewport.width + 1 && (!button.visible || button.hit)),
            `${viewport.name} 島嶼空間按鈕被裁切或無法點擊：${JSON.stringify(layout.buttons)}`);
        }
        await browser.setViewport(DEFAULT_VIEWPORT.width,DEFAULT_VIEWPORT.height,false);
      }
    },
    {
      name: "全畫面入口、返回操作、按鈕命中與圖片載入",
      run: async () => {
        const viewports = [
          { width:1280, height:720, mobile:false, name:"desktop" },
          { width:390, height:844, mobile:true, name:"phone-portrait" },
          { width:844, height:390, mobile:true, name:"phone-landscape" },
          { width:768, height:1024, mobile:true, name:"tablet" }
        ];
        const entries = [
          { action:"account", selector:"#screen-account", state:"ACCOUNT" },
          { action:"education", selector:"#screen-education", state:"EDUCATION" },
          { action:"island-spaces", selector:"#screen-island-spaces", state:"ISLAND_SPACES" },
          { action:"characters", selector:"#screen-characters", state:"CHARACTER_SELECT" },
          { action:"missions", selector:"#screen-missions", state:"ENVIRONMENT_MISSIONS" },
          { action:"commerce-hub", selector:"#screen-shop", state:"SHOP" },
          { action:"gacha", selector:"#screen-gacha", state:"GACHA" },
          { action:"records-hub", selector:"#screen-codex", state:"CODEX" },
          { action:"achievements", selector:"#screen-achievements", state:"ACHIEVEMENTS" },
          { action:"settings-home", selector:"#screen-settings", state:"SETTINGS_FROM_HOME" },
          { action:"help", selector:"#screen-help", state:"HELP" },
          { action:"build", selector:"#build-root", state:"LOBBY_BUILD", overlay:true },
          { action:"portal", selector:"#screen-portal", state:"PORTAL_SELECT", portal:true }
        ];

        for (const viewport of viewports) {
          await browser.setViewport(viewport.width, viewport.height, viewport.mobile);
          await browser.prepare(`test=1&qaSkipIntro=1&seed=${3100 + viewport.width + viewport.height}${viewport.mobile ? "&forceMobile=1" : ""}`);
          await browser.evaluate(`(() => {
            const hint = document.getElementById("rotate-hint");
            if (hint && !hint.classList.contains("hidden")) {
              const dismiss = hint.querySelector(".rotate-hint-close");
              if (dismiss) dismiss.click();
            }
            return true;
          })()`);
          for (const entry of entries) {
            await browser.evaluate(`(() => {
              if (window.Lobby && Lobby.mode !== "idle") App.exitBuildMode();
              App.enterLobby();
              if (${entry.portal ? "true" : "false"}) App.openPortalSelect();
              else App.handleAction(${JSON.stringify(entry.action)});
              return App.state;
            })()`);
            await browser.waitFor(
              `App.state === ${JSON.stringify(entry.state)} && !document.querySelector(${JSON.stringify(entry.selector)}).classList.contains("hidden")`,
              `${viewport.name} ${entry.action} 畫面開啟`
            );
            await browser.evaluate(`(() => {
              document.querySelector(${JSON.stringify(entry.selector)}).querySelectorAll("img[src]")
                .forEach((image) => { image.loading = "eager"; });
              return true;
            })()`);
            await browser.waitFor(
              `Array.from(document.querySelector(${JSON.stringify(entry.selector)}).querySelectorAll("img[src]")).every((image) => image.complete)`,
              `${viewport.name} ${entry.action} 圖片載入`,
              5000
            );
            const audit = await browser.evaluate(`(() => {
              const root = document.querySelector(${JSON.stringify(entry.selector)});
              const rootRect = root.getBoundingClientRect();
              const visible = (node) => {
                const style = getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                return style.display !== "none" && style.visibility !== "hidden" &&
                  Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
              };
              const controls = Array.from(root.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]"))
                .filter(visible)
                .map((node) => {
                  const footer = !!node.closest(".screen-footer") || node.classList.contains("build-close");
                  if (!footer && node.scrollIntoView) node.scrollIntoView({ block:"center", inline:"nearest" });
                  const rect = node.getBoundingClientRect();
                  const x = rect.left + rect.width / 2;
                  const y = rect.top + rect.height / 2;
                  const centerInside = x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight;
                  const target = centerInside ? document.elementFromPoint(x, y) : null;
                  return {
                    label:node.getAttribute("aria-label") || node.textContent.trim() || node.id || node.tagName,
                    centerInside,
                    hit:!centerInside || (!!target && (target === node || node.contains(target))),
                    footer,
                    fullyInside:rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1,
                    rect:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height}
                  };
                });
              const images = Array.from(root.querySelectorAll("img[src]"));
              return {
                state:App.state,
                root:{left:rootRect.left,right:rootRect.right,top:rootRect.top,bottom:rootRect.bottom},
                documentOverflowX:document.documentElement.scrollWidth - innerWidth,
                visibleScreens:Array.from(document.querySelectorAll(".screen:not(.hidden)")).map((node) => node.id),
                blockedControls:controls.filter((item) => item.centerInside && !item.hit),
                clippedFixedControls:controls.filter((item) => item.footer && !item.fullyInside),
                brokenImages:images.filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.currentSrc || image.src),
                pendingImages:images.filter((image) => !image.complete).map((image) => image.currentSrc || image.src)
              };
            })()`);
            assert(audit.documentOverflowX <= 1,
              `${viewport.name} ${entry.action} 發生水平溢出：${JSON.stringify(audit)}`);
            assert(audit.blockedControls.length === 0,
              `${viewport.name} ${entry.action} 有可見但無法點擊的控制項：${JSON.stringify(audit.blockedControls)}`);
            assert(audit.clippedFixedControls.length === 0,
              `${viewport.name} ${entry.action} 固定操作按鈕被裁切：${JSON.stringify(audit.clippedFixedControls)}`);
            assert(audit.brokenImages.length === 0 && audit.pendingImages.length === 0,
              `${viewport.name} ${entry.action} 圖片未正確載入：${JSON.stringify({ broken:audit.brokenImages, pending:audit.pendingImages })}`);
            assert(audit.visibleScreens.length === (entry.overlay ? 0 : 1),
              `${viewport.name} ${entry.action} 同時顯示了非預期畫面：${JSON.stringify(audit.visibleScreens)}`);

            await browser.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { code:"Escape", key:"Escape", bubbles:true }))`);
            await browser.waitFor("App.state === 'LOBBY'", `${viewport.name} ${entry.action} Escape 返回大廳`);
          }
        }
        await browser.setViewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height, false);
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
          { name: "landscape", width: 844, height: 390 },
          { name: "tablet", width: 768, height: 1024 }
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
          const minimumMapWidth = viewport.name === "landscape" ? 145 : 180;
          const minimumCardWidth = viewport.name === "landscape" ? 140 : 200;
          assert(map.width >= minimumMapWidth, `${viewport.name} 傳送門地圖過小`);
          assert(card.width >= minimumCardWidth, `${viewport.name} 關卡預覽圖過小`);
          assert(stageName.fontSize >= 15, `${viewport.name} 關卡名稱字級過小`);
          assert(meta.fontSize >= 10, `${viewport.name} 關卡資訊字級過小`);
        }

        await browser.setViewport(390, 844, true);
        await browser.prepare("test=1&duration=8&qaSkipIntro=1&forceMobile=1&qaTutorial=1&seed=1011");
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
          "!document.getElementById('tutorial-coach').classList.contains('hidden')",
          "旋轉提示關閉後顯示漸進式教學"
        );
        const tutorialState = await browser.evaluate(`(() => ({
          title: document.querySelector('[data-tutorial-title]')?.textContent || '',
          progress: document.querySelector('[data-tutorial-progress]')?.textContent || '',
          oldGuideHidden: document.getElementById('overlay-lobby-guide').classList.contains('hidden'),
          coachLayout: (() => {
            const node = document.getElementById('tutorial-coach');
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return {
              rect: { left:rect.left, top:rect.top, right:rect.right, bottom:rect.bottom, width:rect.width, height:rect.height },
              css: { width:style.width, left:style.left, bottom:style.bottom, padding:style.padding, transform:style.transform },
              visibleStageWidth: getComputedStyle(document.documentElement).getPropertyValue('--visible-stage-width')
            };
          })(),
          overlaps: (() => {
            const rect = (selector) => {
              const node = document.querySelector(selector);
              const r = node?.getBoundingClientRect();
              return r && r.width && r.height ? { left:r.left, top:r.top, right:r.right, bottom:r.bottom } : null;
            };
            const overlap = (a, b) => !a || !b ? 0 :
              Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
              Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            const coach = rect('#tutorial-coach');
            return {
              menu: overlap(coach, rect('.lobby-topright')),
              objective: overlap(coach, rect('#lobby-objective')),
              help: overlap(coach, rect('#gameplay-help-btn'))
            };
          })()
        }))()`);
        assert(tutorialState.title.includes("走動") && tutorialState.progress.includes("1 / 7") && tutorialState.oldGuideHidden,
          "漸進式教學沒有從實際移動步驟開始");
        assert(Object.values(tutorialState.overlaps).every((area) => area === 0),
          `手機直向教學卡遮住功能列、任務或說明按鈕：${JSON.stringify(tutorialState)}`);
        await browser.click("[data-action='tutorial-skip']");
        await browser.waitFor(
          "document.getElementById('tutorial-coach').classList.contains('hidden')",
          "漸進式教學略過"
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

        const mobileDock = await browser.evaluate(`(() => {
          const read = (node) => {
            const r = node?.getBoundingClientRect();
            if (!r) return null;
            const x = r.left + r.width / 2, y = r.top + r.height / 2;
            const hit = r.width > 0 && r.height > 0 ? document.elementFromPoint(x, y) : null;
            return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height,
              hit:!!hit && (hit === node || node.contains(hit)) };
          };
          const dock = document.querySelector(".lobby-topright");
          const primary = Array.from(dock.children).filter((node) => node.matches("button.lobby-btn"));
          const objective = read(document.getElementById("lobby-objective"));
          const resources = read(document.querySelector(".lobby-topleft"));
          const overlap = (a, b) => !a || !b ? 0 :
            Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
            Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          return { viewport:{width:innerWidth,height:innerHeight}, dock:read(dock), primary:primary.map(read),
            primaryLabels:primary.map((node) => node.dataset.mobileLabel), moreHidden:getComputedStyle(document.getElementById("lobby-more-panel")).display === "none",
            topOverlap:overlap(objective, resources) };
        })()`);
        assert(mobileDock.dock && mobileDock.dock.left >= -1 && mobileDock.dock.right <= mobileDock.viewport.width + 1 &&
          mobileDock.dock.bottom <= mobileDock.viewport.height + 1 && mobileDock.dock.top > mobileDock.viewport.height * .72,
          `手機大廳底部導覽位置錯誤：${JSON.stringify(mobileDock)}`);
        assert(mobileDock.primary.length === 5 && mobileDock.primaryLabels.join(",") === "角色,建造,任務,商店,更多" &&
          mobileDock.primary.every((button) => button.width >= 44 && button.height >= 44 && button.hit) &&
          mobileDock.moreHidden && mobileDock.topOverlap === 0,
          `手機大廳常用入口、觸控尺寸或頂部資訊配置錯誤：${JSON.stringify(mobileDock)}`);
        await browser.screenshot(path.join(ROOT, "screenshots", "lobby-mobile-portrait.png"));
        await browser.click("#mobile-lobby-more");
        const mobileMore = await browser.evaluate(`(() => {
          const panel=document.getElementById("lobby-more-panel"),r=panel.getBoundingClientRect();
          const buttons=Array.from(panel.querySelectorAll("button")).map((node)=>{const b=node.getBoundingClientRect(),x=b.left+b.width/2,y=b.top+b.height/2,hit=document.elementFromPoint(x,y);return {label:node.dataset.mobileLabel,left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height,hit:!!hit&&(hit===node||node.contains(hit))};});
          return {expanded:document.getElementById("mobile-lobby-more").getAttribute("aria-expanded"),ariaHidden:panel.getAttribute("aria-hidden"),panel:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},buttons,viewport:{width:innerWidth,height:innerHeight}};
        })()`);
        assert(mobileMore.expanded === "true" && mobileMore.ariaHidden === "false" &&
          mobileMore.panel.left >= -1 && mobileMore.panel.right <= mobileMore.viewport.width + 1 && mobileMore.panel.top >= -1 &&
          mobileMore.buttons.length === 5 && mobileMore.buttons.every((button) => button.width >= 44 && button.height >= 44 && button.hit),
          `手機大廳更多功能面板被裁切或無法點擊：${JSON.stringify(mobileMore)}`);
        await browser.screenshot(path.join(ROOT, "screenshots", "lobby-mobile-portrait-more.png"));
        await browser.click("#mobile-lobby-more");
        await browser.setViewport(844, 390, true);
        await sleep(180);
        const landscapeDock = await browser.evaluate(`(() => {
          const dock=document.querySelector(".lobby-topright"),r=dock.getBoundingClientRect();
          const buttons=Array.from(dock.children).filter((node)=>node.matches("button.lobby-btn")).map((node)=>{const b=node.getBoundingClientRect(),x=b.left+b.width/2,y=b.top+b.height/2,hit=document.elementFromPoint(x,y);return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height,hit:!!hit&&(hit===node||node.contains(hit))};});
          return {viewport:{width:innerWidth,height:innerHeight},dock:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},buttons};
        })()`);
        assert(landscapeDock.dock.left >= -1 && landscapeDock.dock.right <= landscapeDock.viewport.width + 1 &&
          landscapeDock.dock.bottom <= landscapeDock.viewport.height + 1 && landscapeDock.buttons.every((button)=>button.width >= 44 && button.height >= 44 && button.hit),
          `手機橫向大廳底部導覽被裁切或無法點擊：${JSON.stringify(landscapeDock)}`);
        await browser.screenshot(path.join(ROOT, "screenshots", "lobby-mobile-landscape.png"));
        await browser.setViewport(390, 844, true);
        await sleep(180);

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
