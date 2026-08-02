import { promises as fs } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_FILE = path.join(ROOT, "output", "content-audit-results.json");
const results = [];

function record(name, passed, details = "") {
  results.push({ name, status: passed ? "passed" : "failed", details });
  if (!passed) process.exitCode = 1;
}

function uniqueIds(items, label) {
  const ids = items.map((item) => item && item.id).filter(Boolean);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  record(`${label} ID 唯一`, ids.length === items.length && duplicates.length === 0,
    duplicates.length ? `重複：${[...new Set(duplicates)].join(", ")}` : `共 ${ids.length} 筆`);
}

function stripQuery(value) {
  return String(value || "").split(/[?#]/, 1)[0];
}

function collectFrameNames(value, output = new Set()) {
  if (typeof value === "string") output.add(value);
  else if (Array.isArray(value)) value.forEach((item) => collectFrameNames(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectFrameNames(item, output));
  return output;
}

async function exists(relativePath) {
  try {
    const info = await fs.stat(path.join(ROOT, stripQuery(relativePath)));
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

async function walk(directory, predicate = () => true) {
  const output = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(fullPath, predicate));
    else if (predicate(fullPath)) output.push(fullPath);
  }
  return output;
}

async function loadClassicScript(context, relativePath) {
  const source = await fs.readFile(path.join(ROOT, relativePath), "utf8");
  vm.runInContext(source, context, { filename: relativePath });
}

async function main() {
  const html = await fs.readFile(path.join(ROOT, "index.html"), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  record("HTML ID 唯一", duplicateIds.length === 0,
    duplicateIds.length ? `重複：${[...new Set(duplicateIds)].join(", ")}` : `共 ${ids.length} 個 ID`);

  const localPageRefs = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value) => !/^(?:data:|https?:|\/\/)/i.test(value));
  const missingPageRefs = [];
  for (const ref of localPageRefs) if (!await exists(ref)) missingPageRefs.push(ref);
  record("HTML 樣式與腳本引用存在", missingPageRefs.length === 0,
    missingPageRefs.length ? `缺少：${missingPageRefs.join(", ")}` : `共 ${localPageRefs.length} 筆`);

  const sourceFiles = [
    path.join(ROOT, "index.html"),
    path.join(ROOT, "css", "style.css"),
    ...await walk(path.join(ROOT, "js"), (file) => file.endsWith(".js") && path.basename(file) !== "assets.js")
  ];
  const assetReferences = new Set();
  for (const file of sourceFiles) {
    const source = await fs.readFile(file, "utf8");
    for (const match of source.matchAll(/assets\/[A-Za-z0-9_./-]+\.(?:png|webp|wav|json|txt|md)/g)) {
      assetReferences.add(match[0]);
    }
  }
  const missingAssets = [];
  for (const ref of assetReferences) if (!await exists(ref)) missingAssets.push(ref);
  record("實際使用素材完整", missingAssets.length === 0,
    missingAssets.length ? `缺少：${missingAssets.join(", ")}` : `共 ${assetReferences.size} 筆引用`);

  const syntaxFailures = [];
  for (const file of await walk(path.join(ROOT, "js"), (value) => value.endsWith(".js"))) {
    const source = await fs.readFile(file, "utf8");
    try {
      new vm.Script(source, { filename: path.relative(ROOT, file) });
    } catch (error) {
      syntaxFailures.push(`${path.relative(ROOT, file)}: ${error.message}`);
    }
  }
  record("瀏覽器 JavaScript 語法有效", syntaxFailures.length === 0,
    syntaxFailures.length ? syntaxFailures.join(" | ") : "所有 js/ 檔案皆可解析");

  const assetSandbox = { window: {} };
  assetSandbox.window.window = assetSandbox.window;
  const assetContext = vm.createContext(assetSandbox);
  await loadClassicScript(assetContext, "js/assets.js");
  const manifest = assetSandbox.window.Assets && assetSandbox.window.Assets.manifest || {};
  const unusableManifestEntries = [];
  const missingPrimaryAssets = [];
  for (const [key, entry] of Object.entries(manifest)) {
    const paths = Array.isArray(entry.paths) ? entry.paths : [];
    const availability = [];
    for (const candidate of paths) availability.push(await exists(candidate));
    if (!availability.some(Boolean)) unusableManifestEntries.push(key);
    if (paths.length && !availability[0]) missingPrimaryAssets.push(`${key}: ${stripQuery(paths[0])}`);
  }
  record("素材清單至少有一個可用候選", unusableManifestEntries.length === 0,
    unusableManifestEntries.length ? `無可用素材：${unusableManifestEntries.join(", ")}` : `共 ${Object.keys(manifest).length} 組`);
  record("素材清單主要路徑不會先產生 404", missingPrimaryAssets.length === 0,
    missingPrimaryAssets.length ? missingPrimaryAssets.join(" | ") : "所有主要路徑存在");

  const dataSandbox = { window: {}, console };
  dataSandbox.window.window = dataSandbox.window;
  const dataContext = vm.createContext(dataSandbox);
  const dataScripts = [
    "js/data/characters.js",
    "js/data/skins.js",
    "js/data/skills.js",
    "js/data/enemies.js",
    "js/data/shop.js",
    "js/data/stages.js",
    "js/data/taiwanRegions.js",
    "js/data/environmentMissions.js",
    "js/data/achievements.js",
    "js/data/knowledge.js",
    "js/data/lobbyBuildings.js"
  ];
  for (const file of dataScripts) await loadClassicScript(dataContext, file);
  const data = dataSandbox.window.GameData;

  uniqueIds(data.characters || [], "角色");
  uniqueIds(data.skills || [], "技能");
  uniqueIds(Object.values(data.enemies || {}), "敵人");
  uniqueIds(data.stages || [], "關卡");
  uniqueIds(data.knowledge || [], "知識卡");
  uniqueIds(data.sustainabilityQuestions || [], "題目");
  uniqueIds(data.lobbyBuildings || [], "大廳建築");

  const animationFrameIssues = [];
  const animatedEntities = [
    ...(data.characters || []).map((item) => ({ label:`角色 ${item.id}`, base:item.spriteBasePath, frames:collectFrameNames(item.animationSet) })),
    ...Object.values(data.enemies || {}).filter((item) => item.spriteBasePath)
      .map((item) => ({ label:`敵人 ${item.id}`, base:item.spriteBasePath, frames:collectFrameNames(item.animationSet) }))
  ];
  for (const entity of animatedEntities) {
    for (const frame of entity.frames) {
      const ref = `${entity.base}${frame}.png`;
      if (!await exists(ref)) animationFrameIssues.push(`${entity.label}: ${ref}`);
    }
  }
  for (const skin of data.skins || []) {
    const character = (data.characters || []).find((item) => item.id === skin.characterId);
    for (const frame of collectFrameNames(character && character.animationSet)) {
      const ref = `${skin.spriteBasePath}${frame}.png`;
      if (!await exists(ref)) animationFrameIssues.push(`造型 ${skin.id}: ${ref}`);
    }
  }
  record("角色、造型與敵人動畫影格完整", animationFrameIssues.length === 0,
    animationFrameIssues.length ? animationFrameIssues.slice(0, 30).join(" | ") : `${animatedEntities.length} 個動畫實體、${(data.skins || []).length} 組造型`);

  const buildingAssetIssues = [];
  for (const building of data.lobbyBuildings || []) {
    const ref = `${building.assetBasePath}idle_0.png`;
    if (!await exists(ref)) buildingAssetIssues.push(`${building.id}: ${ref}`);
  }
  record("大廳建築與裝飾圖片完整", buildingAssetIssues.length === 0,
    buildingAssetIssues.length ? buildingAssetIssues.join(" | ") : `${data.lobbyBuildings.length} 組素材`);

  const skillIds = new Set((data.skills || []).map((item) => item.id));
  const enemyIds = new Set(Object.keys(data.enemies || {}));
  const knowledgeIds = new Set((data.knowledge || []).map((item) => item.id));
  const characterIssues = (data.characters || []).filter((item) => !skillIds.has(item.startingSkill))
    .map((item) => `${item.id} → ${item.startingSkill}`);
  record("角色起始技能可解析", characterIssues.length === 0,
    characterIssues.length ? characterIssues.join(", ") : `${data.characters.length} 名角色`);

  const enemyKnowledgeIssues = Object.values(data.enemies || {})
    .filter((item) => item.knowledgeId && !knowledgeIds.has(item.knowledgeId))
    .map((item) => `${item.id} → ${item.knowledgeId}`);
  record("敵人知識卡引用可解析", enemyKnowledgeIssues.length === 0,
    enemyKnowledgeIssues.length ? enemyKnowledgeIssues.join(", ") : "所有引用有效");

  const staticEnemyPortraitIssues = Object.values(data.enemies || {})
    .filter((item) => item.runtimeAnimated === false)
    .filter((item) => !manifest[item.spriteId] || !manifest[item.spriteId].paths || !manifest[item.spriteId].paths.length)
    .map((item) => `${item.id} → ${item.spriteId}`);
  record("靜態敵人圖鑑圖片可解析", staticEnemyPortraitIssues.length === 0,
    staticEnemyPortraitIssues.length ? staticEnemyPortraitIssues.join(", ") : "所有靜態敵人皆有正式圖片");

  const stageIssues = [];
  for (const stage of data.stages || []) {
    const references = [stage.bossId, ...(stage.fallbackEnemies || [])];
    for (const wave of stage.waves || []) {
      for (const type of wave.types || []) references.push(type.enemy);
    }
    for (const event of stage.events || []) references.push(event.enemy);
    for (const enemyId of references.filter(Boolean)) {
      const resolved = data.resolveEnemyId ? data.resolveEnemyId(enemyId) : enemyId;
      if (!enemyIds.has(resolved)) stageIssues.push(`${stage.id} → ${enemyId}`);
    }
  }
  record("關卡敵人與 BOSS 引用可解析", stageIssues.length === 0,
    stageIssues.length ? stageIssues.join(", ") : `${data.stages.length} 個關卡`);

  const stageOrders = (data.stages || []).map((item) => item.order);
  const duplicateOrders = stageOrders.filter((order, index) => stageOrders.indexOf(order) !== index);
  record("關卡順序唯一", duplicateOrders.length === 0,
    duplicateOrders.length ? `重複順序：${[...new Set(duplicateOrders)].join(", ")}` : stageOrders.join(" → "));

  const questionIssues = (data.sustainabilityQuestions || []).filter((item) =>
    !Array.isArray(item.options) || item.options.length < 2 ||
    !Number.isInteger(item.answer) || item.answer < 0 || item.answer >= item.options.length ||
    !String(item.explanation || "").trim()
  ).map((item) => item.id || "unknown");
  record("題目選項、正解與詳解完整", questionIssues.length === 0,
    questionIssues.length ? `異常題目：${questionIssues.join(", ")}` : `${data.sustainabilityQuestions.length} 題`);

  const report = {
    generatedAt: new Date().toISOString(),
    passed: results.filter((item) => item.status === "passed").length,
    failed: results.filter((item) => item.status === "failed").length,
    results
  };
  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  for (const item of results) {
    console.log(`${item.status === "passed" ? "PASS" : "FAIL"}  ${item.name}${item.details ? ` — ${item.details}` : ""}`);
  }
  console.log(`\nContent summary: ${report.passed}/${results.length} passed`);
  console.log(`Report: ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
