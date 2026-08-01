import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT = path.join(ROOT, "dist");
const ROOT_ENTRIES = ["index.html", "css", "js", "assets"];
const REPLACED_RUNTIME_ASSETS = new Set([
  "assets/images/backgrounds/lobby_background.png",
  "assets/images/lobby/ground/lobby_map.png",
  "assets/images/maps/taiwan_overview/taiwan_region_map.png",
  "assets/images/stages/blackwater_plant_card.png",
  "assets/images/stages/east_ridge_card.png",
  "assets/images/stages/recycle_works_card.png",
  "assets/images/stages/tidal_flat_card.png",
  "assets/images/ui/panel_confirm.png",
  "assets/images/ui/panel_pause.png",
  "assets/images/ui/panel_settings.png"
]);

function isWorkMaterial(relativePath) {
  return relativePath.split(/[\\/]+/).some((segment) => segment.startsWith("_"));
}

function isReplacedRuntimeAsset(relativePath) {
  return REPLACED_RUNTIME_ASSETS.has(relativePath.replaceAll("\\", "/"));
}

async function measure(target) {
  const info = await stat(target);
  if (info.isFile()) return { files: 1, bytes: info.size };
  const totals = { files: 0, bytes: 0 };
  for (const entry of await readdir(target, { withFileTypes: true })) {
    const child = await measure(path.join(target, entry.name));
    totals.files += child.files;
    totals.bytes += child.bytes;
  }
  return totals;
}

export async function buildProduction(options = {}) {
  const environmentOutput = typeof process !== "undefined" ? process.env.PRODUCTION_OUT_DIR : "";
  const outputDir = path.resolve(options.outputDir || environmentOutput || DEFAULT_OUTPUT);
  if (outputDir === ROOT || path.dirname(outputDir) === outputDir) {
    throw new Error(`Refusing unsafe production output path: ${outputDir}`);
  }

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const summary = {
    generatedAt: new Date().toISOString(),
    outputDir,
    included: { files: 0, bytes: 0 },
    excluded: { files: 0, bytes: 0, paths: [] }
  };

  async function copyEntry(source, destination, relativePath) {
    if (isWorkMaterial(relativePath) || isReplacedRuntimeAsset(relativePath)) {
      const removed = await measure(source);
      summary.excluded.files += removed.files;
      summary.excluded.bytes += removed.bytes;
      summary.excluded.paths.push(relativePath.replaceAll("\\", "/"));
      return;
    }
    const info = await stat(source);
    if (info.isDirectory()) {
      await mkdir(destination, { recursive: true });
      for (const entry of await readdir(source, { withFileTypes: true })) {
        await copyEntry(
          path.join(source, entry.name),
          path.join(destination, entry.name),
          path.join(relativePath, entry.name)
        );
      }
      return;
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination);
    summary.included.files += 1;
    summary.included.bytes += info.size;
  }

  for (const entry of ROOT_ENTRIES) {
    await copyEntry(path.join(ROOT, entry), path.join(outputDir, entry), entry);
  }

  summary.excluded.paths.sort();
  await writeFile(
    path.join(outputDir, "build-manifest.json"),
    JSON.stringify(summary, null, 2) + "\n",
    "utf8"
  );
  return summary;
}

if (typeof process !== "undefined" && Array.isArray(process.argv) && process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await buildProduction();
  console.log(JSON.stringify(result, null, 2));
}
