"""Build 5x8 character animation references and slice generated skin masters.

Sheet geometry is intentionally fixed to the 1024x1536 portrait size returned by
the built-in image generator: 32 px side margins, five 192 px columns, and eight
192 px rows ordered N, NE, E, SE, S, SW, W, NW.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ROOT / "assets" / "images" / "characters"
SKINS = CHARACTERS / "skins"
REFERENCES = SKINS / "_references"
MASTERS = SKINS / "_masters"
DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
SKIN_IDS = [
    "ranger_thorn", "ranger_gale", "ranger_canopy",
    "beach_harpoon", "beach_wave", "beach_coral",
    "solar_flare", "solar_lighttrail", "solar_battery",
    "mechanic_arc", "mechanic_bearing", "mechanic_bulwark",
    "chemist_catalyst", "chemist_current", "chemist_springguard",
]
FOLDERS = {
    "ranger": "ranger",
    "beachcomber": "beachcomber",
    "solar": "solar_engineer",
    "mechanic": "circular_mechanic",
    "chemist": "eco_chemist",
}
SHEET_SIZE = (1024, 1536)
CELL = 192
LEFT = 32
KEY = (255, 0, 255, 255)
CELL_PAD_X = 16
CELL_PAD_Y = 28
ALPHA_CUTOFF = 20
SUBJECT_MAX = (164, 176)
SUBJECT_BASELINE = 185


def _frame_path(folder: str, action: str, direction: str, index: int) -> Path:
    return CHARACTERS / folder / f"{action}_{direction}_{index}.png"


def _fit_frame(source: Path, walk_index: int | None = None) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    bbox = image.getbbox()
    if bbox:
        image = image.crop(bbox)
    image.thumbnail((164, 176), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    x = (CELL - image.width) // 2
    y = CELL - image.height - 7
    if walk_index is not None:
        # Some legacy characters only have directional idle art. The small pose
        # offsets provide an explicit four-step rhythm for GPT-image to refine.
        x += (-3, 0, 3, 0)[walk_index]
        y += (0, -4, 0, -2)[walk_index]
    canvas.alpha_composite(image, (x, y))
    return canvas


def _fit_generated_cell(image: Image.Image, row: int, col: int) -> Image.Image:
    """Extract the intended sprite, including small row overflow, without neighbour bleed.

    GPT-image can place boot pixels a few pixels beyond a logical cell. A padded crop
    captures the complete subject; connected components then discard fragments from
    the preceding/following row before the sprite is normalized to the runtime cell.
    """
    logical_left = LEFT + col * CELL
    logical_top = row * CELL
    crop_left = max(0, logical_left - CELL_PAD_X)
    crop_top = max(0, logical_top - CELL_PAD_Y)
    crop_right = min(image.width, logical_left + CELL + CELL_PAD_X)
    crop_bottom = min(image.height, logical_top + CELL + CELL_PAD_Y)
    expanded = image.crop((crop_left, crop_top, crop_right, crop_bottom))
    alpha = expanded.getchannel("A")
    alpha_bytes = alpha.tobytes()
    width, height = expanded.size
    visited = bytearray(width * height)
    components: list[dict[str, object]] = []

    for start in range(width * height):
        if visited[start] or alpha_bytes[start] <= ALPHA_CUTOFF:
            continue
        visited[start] = 1
        queue: deque[int] = deque([start])
        pixels: list[int] = []
        min_x = max_x = start % width
        min_y = max_y = start // width
        while queue:
            index = queue.popleft()
            pixels.append(index)
            x = index % width
            y = index // width
            min_x = min(min_x, x)
            max_x = max(max_x, x)
            min_y = min(min_y, y)
            max_y = max(max_y, y)
            for ny in range(max(0, y - 1), min(height, y + 2)):
                row_offset = ny * width
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    neighbour = row_offset + nx
                    if visited[neighbour] or alpha_bytes[neighbour] <= ALPHA_CUTOFF:
                        continue
                    visited[neighbour] = 1
                    queue.append(neighbour)
        components.append({
            "pixels": pixels,
            "bbox": (min_x, min_y, max_x + 1, max_y + 1),
            "size": len(pixels),
        })

    if not components:
        raise ValueError(f"row={row} col={col} has no visible subject")
    primary = max(components, key=lambda component: int(component["size"]))
    matte = bytearray(width * height)
    for index in primary["pixels"]:
        matte[index] = alpha_bytes[index]
    mask = Image.frombytes("L", (width, height), bytes(matte))
    bbox = mask.getbbox()
    if not bbox:
        raise ValueError(f"row={row} col={col} subject matte is empty")
    expanded.putalpha(mask)
    subject = expanded.crop(bbox)
    subject.thumbnail(SUBJECT_MAX, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    x = (CELL - subject.width) // 2
    y = SUBJECT_BASELINE - subject.height
    canvas.alpha_composite(subject, (x, y))
    return canvas


def build_references() -> None:
    REFERENCES.mkdir(parents=True, exist_ok=True)
    for character_id, folder in FOLDERS.items():
        sheet = Image.new("RGBA", SHEET_SIZE, KEY)
        for row, direction in enumerate(DIRECTIONS):
            idle_path = _frame_path(folder, "idle", direction, 0)
            sheet.alpha_composite(_fit_frame(idle_path), (LEFT, row * CELL))
            for walk_index in range(4):
                walk_path = _frame_path(folder, "walk", direction, walk_index)
                use_path = walk_path if walk_path.exists() else idle_path
                offset_index = None if walk_path.exists() else walk_index
                sheet.alpha_composite(
                    _fit_frame(use_path, offset_index),
                    (LEFT + (walk_index + 1) * CELL, row * CELL),
                )
        out = REFERENCES / f"{character_id}_animation_reference.png"
        sheet.convert("RGB").save(out, quality=100)
        print(out)


def _slice_sheet(asset_id: str, source: Path, out_dir: Path, metric_key: str) -> dict:
    image = Image.open(source).convert("RGBA")
    if image.size != SHEET_SIZE:
        raise ValueError(f"{source} must be {SHEET_SIZE[0]}x{SHEET_SIZE[1]}, got {image.size}")
    out_dir.mkdir(parents=True, exist_ok=True)
    metrics: dict[str, object] = {metric_key: asset_id, "source": str(source), "frames": {}}
    for row, direction in enumerate(DIRECTIONS):
        names = [f"idle_{direction}_0"] + [f"walk_{direction}_{i}" for i in range(4)]
        for col, name in enumerate(names):
            frame = _fit_generated_cell(image, row, col)
            alpha = frame.getchannel("A")
            bbox = alpha.getbbox()
            coverage = sum(alpha.histogram()[17:]) / (CELL * CELL)
            if not bbox or coverage < 0.025:
                raise ValueError(f"{asset_id}/{name} has insufficient subject coverage: {coverage:.4f}")
            frame_path = out_dir / f"{name}.png"
            frame.save(frame_path)
            metrics["frames"][name] = {"coverage": round(coverage, 4), "bbox": list(bbox)}
    metrics_path = out_dir / "animation_metrics.json"
    metrics_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    return metrics


def slice_master(skin_id: str, source: Path) -> dict:
    return _slice_sheet(skin_id, source, SKINS / skin_id, "skinId")


def slice_character(character_id: str, source: Path) -> dict:
    if character_id not in FOLDERS:
        raise ValueError(f"Unknown character: {character_id}")
    return _slice_sheet(
        character_id,
        source,
        CHARACTERS / FOLDERS[character_id],
        "characterId",
    )


def _expected_frame_names() -> set[str]:
    return {
        f"idle_{direction}_0.png" for direction in DIRECTIONS
    } | {
        f"walk_{direction}_{index}.png"
        for direction in DIRECTIONS
        for index in range(4)
    }


def _audit_animation_set(asset_id: str, asset_dir: Path) -> dict:
    expected_names = _expected_frame_names()
    actual_names = {path.name for path in asset_dir.glob("*.png")}
    missing = sorted(expected_names - actual_names)
    extra = sorted(actual_names - expected_names)
    if missing or extra:
        raise ValueError(f"{asset_id} frame mismatch; missing={missing}, extra={extra}")

    min_coverage = 1.0
    max_coverage = 0.0
    magenta_pixels = 0
    walk_variants: dict[str, int] = {}
    for name in sorted(expected_names):
        path = asset_dir / name
        image = Image.open(path).convert("RGBA")
        if image.size != (CELL, CELL):
            raise ValueError(f"{path} must be {CELL}x{CELL}, got {image.size}")
        alpha = image.getchannel("A")
        coverage = sum(alpha.histogram()[17:]) / (CELL * CELL)
        if coverage < 0.025:
            raise ValueError(f"{path} has insufficient subject coverage: {coverage:.4f}")
        min_coverage = min(min_coverage, coverage)
        max_coverage = max(max_coverage, coverage)
        pixels = image.get_flattened_data()
        magenta_pixels += sum(
            1 for red, green, blue, opacity in pixels
            if opacity > 64 and red > 220 and blue > 220 and green < 45
        )

    for direction in DIRECTIONS:
        hashes = {
            hashlib.sha256((asset_dir / f"walk_{direction}_{index}.png").read_bytes()).hexdigest()
            for index in range(4)
        }
        walk_variants[direction] = len(hashes)
        if len(hashes) < 2:
            raise ValueError(f"{asset_id} walk_{direction} has no visible animation variation")

    return {
        "frameCount": len(actual_names),
        "coverageRange": [round(min_coverage, 4), round(max_coverage, 4)],
        "walkVariants": walk_variants,
        "residualMagentaPixels": magenta_pixels,
    }


def audit_character(character_id: str) -> dict:
    if character_id not in FOLDERS:
        raise ValueError(f"Unknown character: {character_id}")
    character_dir = CHARACTERS / FOLDERS[character_id]
    report = {
        "characterId": character_id,
        **_audit_animation_set(character_id, character_dir),
    }
    audit_path = character_dir / "animation_audit.json"
    audit_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def audit_skins() -> dict:
    """Validate the complete runtime animation set and write a QA report."""
    expected_names = _expected_frame_names()
    report: dict[str, object] = {
        "skinCount": len(SKIN_IDS),
        "expectedFramesPerSkin": len(expected_names),
        "totalFrames": 0,
        "skins": {},
    }

    for skin_id in SKIN_IDS:
        skin_dir = SKINS / skin_id
        report["skins"][skin_id] = _audit_animation_set(skin_id, skin_dir)
        report["totalFrames"] += report["skins"][skin_id]["frameCount"]

    audit_path = SKINS / "skin_animation_audit.json"
    audit_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("build-references")
    sub.add_parser("audit")
    audit_character_parser = sub.add_parser("audit-character")
    audit_character_parser.add_argument("--character", required=True)
    slice_parser = sub.add_parser("slice")
    slice_parser.add_argument("--skin", required=True)
    slice_parser.add_argument("--source", type=Path, required=True)
    character_parser = sub.add_parser("slice-character")
    character_parser.add_argument("--character", required=True)
    character_parser.add_argument("--source", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "build-references":
        build_references()
    elif args.command == "audit":
        report = audit_skins()
        print(json.dumps({
            "skinCount": report["skinCount"],
            "totalFrames": report["totalFrames"],
            "report": str(SKINS / "skin_animation_audit.json"),
        }, ensure_ascii=False))
    elif args.command == "audit-character":
        report = audit_character(args.character)
        print(json.dumps(report, ensure_ascii=False))
    elif args.command == "slice":
        metrics = slice_master(args.skin, args.source.resolve())
        print(json.dumps({"skinId": args.skin, "frameCount": len(metrics["frames"])}, ensure_ascii=False))
    else:
        metrics = slice_character(args.character, args.source.resolve())
        print(json.dumps({"characterId": args.character, "frameCount": len(metrics["frames"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
