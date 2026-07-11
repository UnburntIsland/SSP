"""Split GPT-image enemy master sheets into normalized runtime-ready frames."""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ENEMY_ROOT = ROOT / "assets" / "images" / "enemies"
SCREENSHOT_ROOT = ROOT / "screenshots"
DIRECTIONS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")


SPECS = {
    "bottle_mite": {
        "cardinal": {"N": 0, "E": 1, "S": 2, "W": 3},
        "diagonal": {"NE": 0, "SE": 1},
    },
    "foam_crab": {
        "cardinal": {"N": 0, "E": 1, "S": 2, "W": 3},
        "diagonal": {"NE": 0, "SE": 1},
    },
    "ghost_net": {
        "cardinal": {"N": 2, "E": 1, "S": 0, "W": 3},
        "diagonal": {"NE": 1, "SE": 0},
        "canvas": 256,
        "content_width": 220,
        "content_height": 194,
        "bottom": 220,
        "preserve_particles": True,
    },
    "scrap_drone": {
        "cardinal": {"N": 2, "E": 1, "S": 0, "W": 3},
        "diagonal": {"NE": 2, "SE": 0},
        "shear_diagonal": True,
    },
    "can_crusher": {
        "cardinal": {"N": 2, "E": 1, "S": 0, "W": 3},
        "diagonal": {"NE": 0, "SE": 1},
    },
    "compactor_golem": {
        "cardinal": {"N": 2, "E": 1, "S": 0, "W": 3},
        "diagonal": {"NE": 2, "SE": 1},
        "canvas": 256,
        "content_width": 210,
        "content_height": 194,
        "bottom": 220,
        "shear_diagonal": True,
    },
    "oil_slickling": {
        "cardinal": {"N": 2, "E": 1, "S": 0, "W": 3},
        "diagonal": {"NE": 0, "SE": 1, "SW": 2, "NW": 3},
        "preserve_particles": True,
    },
    "smog_drone": {
        "cardinal": {"N": 2, "S": 0},
        "cardinal_custom": {
            "E": ((1, 0), (1, 1), (3, 2), (3, 3)),
        },
        "diagonal": {"NE": 0, "SE": 1},
        "preserve_particles": True,
    },
    "ash_wisp": {
        "cardinal": {"N": 2, "E": 1, "S": 0, "W": 3},
        "diagonal": {"NE": 0, "SE": 1, "SW": 3, "NW": 2},
        "preserve_particles": True,
    },
}


def remove_chroma(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    arr = np.asarray(rgba).copy()
    corners = np.array(
        [arr[0, 0, :3], arr[0, -1, :3], arr[-1, 0, :3], arr[-1, -1, :3]],
        dtype=np.float32,
    )
    key = np.median(corners, axis=0)
    rgb = arr[:, :, :3].astype(np.float32)
    distance = np.sqrt(np.sum((rgb - key) ** 2, axis=2))
    # GPT-image may add a subtle vignette even when asked for a flat key color.
    # A wider color-distance floor removes that variation while preserving the
    # darker, less saturated colors used inside the sprites.
    matte = np.clip((distance - 45.0) / 45.0, 0.0, 1.0)
    arr[:, :, 3] = np.minimum(arr[:, :, 3], (matte * 255).astype(np.uint8))

    red = rgb[:, :, 0]
    green = rgb[:, :, 1]
    blue = rgb[:, :, 2]
    if key[1] > 180 and key[0] < 100 and key[2] < 100:
        key_hue = (green > 155) & ((green - red) > 75) & ((green - blue) > 75)
    else:
        key_hue = (red > 175) & (blue > 175) & (green < 120) & (np.abs(red - blue) < 70)
    arr[:, :, 3][key_hue] = 0

    edge = (arr[:, :, 3] > 0) & (arr[:, :, 3] < 250)
    if key[1] > 220 and key[0] < 80 and key[2] < 80:
        limit = np.maximum(arr[:, :, 0], arr[:, :, 2])
        arr[:, :, 1][edge] = np.minimum(arr[:, :, 1][edge], limit[edge])
    elif key[0] > 220 and key[2] > 220 and key[1] < 100:
        limit = np.maximum(arr[:, :, 1], np.minimum(arr[:, :, 0], arr[:, :, 2]))
        arr[:, :, 0][edge] = np.minimum(arr[:, :, 0][edge], limit[edge])
        arr[:, :, 2][edge] = np.minimum(arr[:, :, 2][edge], limit[edge])

    arr[arr[:, :, 3] == 0, :3] = 0
    return Image.fromarray(arr, "RGBA")


def cell(sheet: Image.Image, row: int, column: int) -> Image.Image:
    width, height = sheet.size
    x0 = round(column * width / 4)
    x1 = round((column + 1) * width / 4)
    y0 = round(row * height / 4)
    y1 = round((row + 1) * height / 4)
    return sheet.crop((x0, y0, x1, y1))


def shear_right(image: Image.Image, amount: float = 0.08) -> Image.Image:
    width, height = image.size
    offset = -amount * height / 2
    return image.transform(
        image.size,
        Image.Transform.AFFINE,
        (1, amount, offset, 0, 1, 0),
        resample=Image.Resampling.NEAREST,
    )


def remove_row_leakage(image: Image.Image, remove_tiny: bool = False) -> Image.Image:
    """Remove a small disconnected fragment leaked from an adjacent sheet row."""
    rgba = image.convert("RGBA")
    alpha = np.asarray(rgba.getchannel("A"))
    mask = alpha > 12
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    components = []

    for start_y in range(height):
        for start_x in range(width):
            if not mask[start_y, start_x] or visited[start_y, start_x]:
                continue
            queue = deque([(start_x, start_y)])
            visited[start_y, start_x] = True
            points = []
            while queue:
                x, y = queue.popleft()
                points.append((x, y))
                for next_y in range(max(0, y - 1), min(height, y + 2)):
                    for next_x in range(max(0, x - 1), min(width, x + 2)):
                        if mask[next_y, next_x] and not visited[next_y, next_x]:
                            visited[next_y, next_x] = True
                            queue.append((next_x, next_y))
            xs = [point[0] for point in points]
            ys = [point[1] for point in points]
            components.append(
                {
                    "points": points,
                    "area": len(points),
                    "bbox": (min(xs), min(ys), max(xs) + 1, max(ys) + 1),
                }
            )

    if len(components) < 2:
        return rgba
    main = max(components, key=lambda component: component["area"])
    main_box = main["bbox"]
    remove = []
    for component in components:
        if component is main or component["area"] >= main["area"] * 0.15:
            continue
        box = component["bbox"]
        vertically_separate = box[1] > main_box[3] + 8 or box[3] < main_box[1] - 8
        tiny_artifact = remove_tiny and component["area"] < main["area"] * 0.01
        if vertically_separate or tiny_artifact:
            remove.extend(component["points"])

    if not remove:
        return rgba
    arr = np.asarray(rgba).copy()
    for x, y in remove:
        arr[y, x] = (0, 0, 0, 0)
    return Image.fromarray(arr, "RGBA")


def extract_source_frames(enemy_id: str, spec: dict) -> dict[str, list[Image.Image]]:
    masters = ENEMY_ROOT / enemy_id / "_incoming_move_regen" / "_masters"
    cardinal = remove_chroma(Image.open(masters / f"{enemy_id}_cardinal_chroma.png"))
    diagonal = remove_chroma(Image.open(masters / f"{enemy_id}_diagonal_chroma.png"))
    frames: dict[str, list[Image.Image]] = {}

    for direction, row in spec.get("cardinal", {}).items():
        frames[direction] = [cell(cardinal, row, index) for index in range(4)]

    for direction, sources in spec.get("cardinal_custom", {}).items():
        frames[direction] = [cell(cardinal, row, column) for row, column in sources]

    if "E" in frames and "W" not in frames:
        frames["W"] = [ImageOps.mirror(frame) for frame in frames["E"]]

    for direction, row in spec.get("diagonal", {}).items():
        extracted = [cell(diagonal, row, index) for index in range(4)]
        if spec.get("shear_diagonal") and direction in ("NE", "SE"):
            extracted = [shear_right(frame) for frame in extracted]
        frames[direction] = extracted

    if "NE" in frames and "NW" not in frames:
        frames["NW"] = [ImageOps.mirror(frame) for frame in frames["NE"]]
    if "SE" in frames and "SW" not in frames:
        frames["SW"] = [ImageOps.mirror(frame) for frame in frames["SE"]]

    frames = {
        direction: [
            remove_row_leakage(frame, remove_tiny=not spec.get("preserve_particles"))
            for frame in direction_frames
        ]
        for direction, direction_frames in frames.items()
    }

    missing = [direction for direction in DIRECTIONS if direction not in frames]
    if missing:
        raise RuntimeError(f"{enemy_id}: missing mapped directions {missing}")
    return frames


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").getbbox()


def normalize_frames(enemy_id: str, spec: dict, source: dict[str, list[Image.Image]]) -> dict[str, list[Image.Image]]:
    canvas = spec.get("canvas", 192)
    max_width = spec.get("content_width", 150)
    max_height = spec.get("content_height", 136)
    target_bottom = spec.get("bottom", 160)

    boxes = [alpha_bbox(frame) for direction in DIRECTIONS for frame in source[direction]]
    if any(box is None for box in boxes):
        raise RuntimeError(f"{enemy_id}: empty generated cell")
    source_width = max(box[2] - box[0] for box in boxes if box)
    source_height = max(box[3] - box[1] for box in boxes if box)
    scale = min(max_width / source_width, max_height / source_height)

    normalized: dict[str, list[Image.Image]] = {}
    for direction in DIRECTIONS:
        normalized[direction] = []
        for frame in source[direction]:
            box = alpha_bbox(frame)
            cropped = frame.crop(box)
            resized = cropped.resize(
                (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
                Image.Resampling.NEAREST,
            )
            output = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
            x = round(canvas / 2 - resized.width / 2)
            y = round(target_bottom - resized.height)
            output.alpha_composite(resized, (x, y))
            normalized[direction].append(output)
    return stabilize_visual_mass(normalized, target_bottom)


def stabilize_visual_mass(frames: dict[str, list[Image.Image]], target_bottom: int) -> dict[str, list[Image.Image]]:
    counts = [
        np.count_nonzero(np.asarray(frame.getchannel("A")) > 12)
        for direction in DIRECTIONS
        for frame in frames[direction]
    ]
    target_count = float(np.median(counts))
    stabilized: dict[str, list[Image.Image]] = {}
    for direction in DIRECTIONS:
        stabilized[direction] = []
        for frame in frames[direction]:
            box = alpha_bbox(frame)
            count = max(1, np.count_nonzero(np.asarray(frame.getchannel("A")) > 12))
            factor = max(0.90, min(1.10, (target_count / count) ** 0.5))
            crop = frame.crop(box)
            if abs(factor - 1) > 0.005:
                crop = crop.resize(
                    (max(1, round(crop.width * factor)), max(1, round(crop.height * factor))),
                    Image.Resampling.NEAREST,
                )
            output = Image.new("RGBA", frame.size, (0, 0, 0, 0))
            x = round(frame.width / 2 - crop.width / 2)
            y = round(target_bottom - crop.height)
            output.alpha_composite(crop, (x, y))
            stabilized[direction].append(output)
    return stabilized


def frame_metrics(frames: dict[str, list[Image.Image]]) -> dict:
    result = {}
    for direction in DIRECTIONS:
        direction_frames = frames[direction]
        rows = []
        arrays = [np.asarray(frame.convert("RGBA"), dtype=np.int16) for frame in direction_frames]
        for index, frame in enumerate(direction_frames):
            box = alpha_bbox(frame)
            rows.append(
                {
                    "frame": index,
                    "bbox": list(box),
                    "bboxCenterX": round((box[0] + box[2]) / 2, 2),
                    "bboxBottom": box[3],
                    "opaquePixels": int(np.count_nonzero(arrays[index][:, :, 3] > 12)),
                }
            )
        differences = []
        for index in range(4):
            other = (index + 1) % 4
            changed = np.any(np.abs(arrays[index] - arrays[other]) > 18, axis=2)
            union = (arrays[index][:, :, 3] > 12) | (arrays[other][:, :, 3] > 12)
            differences.append(round(float(changed[union].mean() * 100) if union.any() else 0, 2))
        result[direction] = {"frames": rows, "adjacentDifferencePercent": differences}
    return result


def save_frames(enemy_id: str, frames: dict[str, list[Image.Image]]) -> None:
    base = ENEMY_ROOT / enemy_id / "_incoming_move_regen"
    for direction in DIRECTIONS:
        out_dir = base / direction
        out_dir.mkdir(parents=True, exist_ok=True)
        for index, frame in enumerate(frames[direction]):
            frame.save(out_dir / f"move_{direction}_{index}.png", optimize=True)
        frames[direction][0].save(out_dir / f"idle_{direction}_0.png", optimize=True)


def make_contact_sheet(enemy_id: str, frames: dict[str, list[Image.Image]]) -> None:
    tile = 150 if frames["S"][0].width == 192 else 184
    label_height = 24
    sheet = Image.new("RGB", (tile * 4, (tile + label_height) * 8), "#0a1b24")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for row, direction in enumerate(DIRECTIONS):
        for column, frame in enumerate(frames[direction]):
            preview = frame.copy()
            preview.thumbnail((tile - 8, tile - 8), Image.Resampling.NEAREST)
            x = column * tile + (tile - preview.width) // 2
            y = row * (tile + label_height) + (tile - preview.height) // 2
            sheet.paste(preview, (x, y), preview)
            label = f"move_{direction}_{column}"
            draw.text((column * tile + 7, row * (tile + label_height) + tile + 5), label, fill="#e8fff6", font=font)
    SCREENSHOT_ROOT.mkdir(parents=True, exist_ok=True)
    sheet.save(SCREENSHOT_ROOT / f"enemy-{enemy_id}-8dir-generated-contact-sheet.png")


def main() -> None:
    report = {}
    for enemy_id, spec in SPECS.items():
        sources = extract_source_frames(enemy_id, spec)
        normalized = normalize_frames(enemy_id, spec, sources)
        save_frames(enemy_id, normalized)
        make_contact_sheet(enemy_id, normalized)
        report[enemy_id] = frame_metrics(normalized)
    report_path = ROOT / "tmp" / "enemy_8dir_generated_metrics.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Processed {len(SPECS)} enemies; metrics: {report_path}")


if __name__ == "__main__":
    main()
