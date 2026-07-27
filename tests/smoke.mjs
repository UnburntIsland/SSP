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
  const candidates = [
    process.env.CHROME_PATH,
    process.platform === "win32" && "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    process.platform === "win32" && "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.platform === "win32" && "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    process.platform === "darwin" && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    process.platform === "darwin" && "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    process.platform === "linux" && "/usr/bin/google-chrome",
    process.platform === "linux" && "/usr/bin/google-chrome-stable",
    process.platform === "linux" && "/usr/bin/chromium",
    process.platform === "linux" && "/usr/bin/chromium-browser"
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

async function main() {
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
      name: "手機橫／直向版面",
      run: async () => {
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
        }
        await browser.setViewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height, false);
      }
    }
  ];

  try {
    await browser.setViewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height, false);
    for (const testCase of cases) {
      const startedAt = Date.now();
      const errorOffset = browser.runtimeErrors.length;
      try {
        await testCase.run();
        const newErrors = browser.runtimeErrors.slice(errorOffset);
        assert(newErrors.length === 0, `瀏覽器執行錯誤：${newErrors.join(" | ")}`);
        const result = {
          name: testCase.name,
          status: "passed",
          durationMs: Date.now() - startedAt,
          network404: [...new Set(browser.network404)]
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
          runtimeErrors: browser.runtimeErrors.slice(errorOffset),
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
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
