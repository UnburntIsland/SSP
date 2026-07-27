from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ALPHA = ROOT / "tmp" / "imagegen" / "lobby" / "alpha"
RAW = ROOT / "tmp" / "imagegen" / "lobby" / "raw"
OUT = ROOT / "assets" / "images" / "lobby"
SCREENSHOTS = ROOT / "screenshots"


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    if not bbox:
        raise ValueError("Image contains no visible pixels")
    return bbox


def normalize(
    image: Image.Image,
    canvas: tuple[int, int],
    maximum: tuple[int, int],
    bottom_margin: int,
) -> Image.Image:
    rgba = image.convert("RGBA")
    content = rgba.crop(alpha_bbox(rgba))
    scale = min(maximum[0] / content.width, maximum[1] / content.height)
    size = (
        max(1, round(content.width * scale)),
        max(1, round(content.height * scale)),
    )
    content = content.resize(size, Image.Resampling.LANCZOS)
    alpha = content.getchannel("A").point(lambda value: 0 if value < 32 else value)
    content.putalpha(alpha)
    pixels = content.load()
    for py in range(content.height):
        for px in range(content.width):
            red, green, blue, opacity = pixels[px, py]
            if opacity and red > 220 and green < 100 and blue > 180:
                pixels[px, py] = (red, green, blue, 0)
    result = Image.new("RGBA", canvas, (0, 0, 0, 0))
    x = round((canvas[0] - content.width) / 2)
    y = canvas[1] - bottom_margin - content.height
    result.alpha_composite(content, (x, y))
    return result


def save_normalized(
    source_name: str,
    relative_output: str,
    canvas: tuple[int, int],
    maximum: tuple[int, int],
    bottom_margin: int,
) -> Path:
    source = Image.open(ALPHA / source_name)
    output = OUT / relative_output
    output.parent.mkdir(parents=True, exist_ok=True)
    normalize(source, canvas, maximum, bottom_margin).save(output)
    return output


def split_sheet(
    source_name: str,
    columns: int,
    rows: int,
    output_pattern: str,
    canvas: tuple[int, int],
    maximum: tuple[int, int],
    bottom_margin: int,
) -> list[Path]:
    sheet = Image.open(ALPHA / source_name).convert("RGBA")
    cell_w = sheet.width // columns
    cell_h = sheet.height // rows
    outputs: list[Path] = []
    frame = 0
    for row in range(rows):
        for column in range(columns):
            left = column * cell_w
            top = row * cell_h
            right = sheet.width if column == columns - 1 else (column + 1) * cell_w
            bottom = sheet.height if row == rows - 1 else (row + 1) * cell_h
            cell = sheet.crop((left, top, right, bottom))
            output = OUT / output_pattern.format(frame=frame)
            output.parent.mkdir(parents=True, exist_ok=True)
            normalize(cell, canvas, maximum, bottom_margin).save(output)
            outputs.append(output)
            frame += 1
    return outputs


def make_lobby_map() -> Path:
    source = Image.open(RAW / "lobby_map.png").convert("RGB")
    target_ratio = 1600 / 1000
    source_ratio = source.width / source.height
    if source_ratio < target_ratio:
        crop_h = round(source.width / target_ratio)
        top = round((source.height - crop_h) / 2)
        source = source.crop((0, top, source.width, top + crop_h))
    elif source_ratio > target_ratio:
        crop_w = round(source.height * target_ratio)
        left = round((source.width - crop_w) / 2)
        source = source.crop((left, 0, left + crop_w, source.height))
    output = OUT / "ground" / "lobby_map.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    source.resize((1600, 1000), Image.Resampling.LANCZOS).save(
        output, optimize=True
    )
    return output


def visible_metrics(path: Path) -> dict[str, object]:
    image = Image.open(path).convert("RGBA")
    bbox = alpha_bbox(image)
    corners = [
        image.getpixel((0, 0))[3],
        image.getpixel((image.width - 1, 0))[3],
        image.getpixel((0, image.height - 1))[3],
        image.getpixel((image.width - 1, image.height - 1))[3],
    ]
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "size": [image.width, image.height],
        "bbox": list(bbox),
        "bboxBottom": bbox[3],
        "transparentCorners": all(value == 0 for value in corners),
    }


def make_contact_sheet(paths: list[Path], filename: str) -> Path:
    thumb_w = 220
    thumb_h = 220
    label_h = 34
    columns = 4
    rows = (len(paths) + columns - 1) // columns
    sheet = Image.new(
        "RGB",
        (columns * thumb_w, rows * (thumb_h + label_h)),
        (22, 32, 31),
    )
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, path in enumerate(paths):
        image = Image.open(path).convert("RGBA")
        checker = Image.new("RGBA", (thumb_w, thumb_h), (38, 53, 51, 255))
        check = ImageDraw.Draw(checker)
        step = 16
        for y in range(0, thumb_h, step):
            for x in range(0, thumb_w, step):
                if ((x // step) + (y // step)) % 2:
                    check.rectangle(
                        (x, y, x + step - 1, y + step - 1),
                        fill=(50, 68, 64, 255),
                    )
        scale = min((thumb_w - 18) / image.width, (thumb_h - 18) / image.height)
        preview = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
        checker.alpha_composite(
            preview,
            (
                round((thumb_w - preview.width) / 2),
                round((thumb_h - preview.height) / 2),
            ),
        )
        column = index % columns
        row = index // columns
        x = column * thumb_w
        y = row * (thumb_h + label_h)
        sheet.paste(checker.convert("RGB"), (x, y))
        label = f"{path.parent.name}/{path.stem}"
        draw.text((x + 8, y + thumb_h + 9), label, fill=(224, 239, 228), font=font)
    SCREENSHOTS.mkdir(parents=True, exist_ok=True)
    output = SCREENSHOTS / filename
    sheet.save(output, optimize=True)
    return output


def main() -> None:
    outputs: list[Path] = [make_lobby_map()]

    outputs.extend(
        split_sheet(
            "portal_sheet.png",
            3,
            2,
            "portal/portal_idle_{frame}.png",
            (320, 320),
            (292, 270),
            18,
        )
    )
    outputs.extend(
        split_sheet(
            "recycling_station_sheet.png",
            2,
            2,
            "stations/recycling_idle_zone/idle_{frame}.png",
            (320, 320),
            (292, 280),
            18,
        )
    )

    static_specs = [
        (
            "construction_workbench.png",
            "stations/construction_workbench/idle_0.png",
            (256, 256),
            (224, 214),
            16,
        ),
        (
            "solar_workshop.png",
            "buildings/solar_workshop/idle_0.png",
            (384, 384),
            (350, 350),
            18,
        ),
        (
            "rain_garden.png",
            "buildings/rain_garden/idle_0.png",
            (384, 384),
            (350, 320),
            18,
        ),
        (
            "wind_station.png",
            "buildings/wind_station/idle_0.png",
            (384, 384),
            (320, 350),
            18,
        ),
        (
            "recycle_guard.png",
            "buildings/recycle_guard/idle_0.png",
            (384, 384),
            (350, 340),
            18,
        ),
        (
            "small_tree.png",
            "decorations/small_tree/idle_0.png",
            (256, 256),
            (200, 226),
            14,
        ),
        (
            "flower_bed.png",
            "decorations/flower_bed/idle_0.png",
            (256, 256),
            (224, 180),
            14,
        ),
        (
            "recycling_bench.png",
            "decorations/recycling_bench/idle_0.png",
            (256, 256),
            (220, 176),
            14,
        ),
        (
            "solar_streetlight.png",
            "decorations/solar_streetlight/idle_0.png",
            (256, 256),
            (170, 230),
            14,
        ),
        (
            "sorting_bins.png",
            "decorations/sorting_bins/idle_0.png",
            (256, 256),
            (220, 180),
            14,
        ),
        (
            "rain_barrel.png",
            "decorations/rain_barrel/idle_0.png",
            (256, 256),
            (164, 218),
            14,
        ),
        (
            "eco_sign.png",
            "decorations/eco_sign/idle_0.png",
            (256, 256),
            (204, 210),
            14,
        ),
        (
            "eco_pond.png",
            "decorations/eco_pond/idle_0.png",
            (256, 256),
            (226, 174),
            14,
        ),
        (
            "recycled_material_icon.png",
            "ui/recycled_material.png",
            (96, 96),
            (82, 82),
            7,
        ),
        (
            "build_mode_icon.png",
            "ui/build_mode.png",
            (96, 96),
            (82, 82),
            7,
        ),
    ]
    for spec in static_specs:
        outputs.append(save_normalized(*spec))

    transparent_outputs = [
        path for path in outputs if path.name != "lobby_map.png"
    ]
    qa = {
        "generator": "GPT-image built-in",
        "assetCount": len(outputs),
        "transparentAssetCount": len(transparent_outputs),
        "assets": [visible_metrics(path) for path in transparent_outputs],
    }
    qa_path = OUT / "LOBBY_ASSET_QA.json"
    qa_path.write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")

    preview_paths = [
        OUT / "portal" / "portal_idle_3.png",
        OUT / "stations" / "recycling_idle_zone" / "idle_2.png",
        OUT / "stations" / "construction_workbench" / "idle_0.png",
        OUT / "buildings" / "solar_workshop" / "idle_0.png",
        OUT / "buildings" / "rain_garden" / "idle_0.png",
        OUT / "buildings" / "wind_station" / "idle_0.png",
        OUT / "buildings" / "recycle_guard" / "idle_0.png",
        OUT / "decorations" / "small_tree" / "idle_0.png",
        OUT / "decorations" / "flower_bed" / "idle_0.png",
        OUT / "decorations" / "recycling_bench" / "idle_0.png",
        OUT / "decorations" / "solar_streetlight" / "idle_0.png",
        OUT / "decorations" / "sorting_bins" / "idle_0.png",
        OUT / "decorations" / "rain_barrel" / "idle_0.png",
        OUT / "decorations" / "eco_sign" / "idle_0.png",
        OUT / "decorations" / "eco_pond" / "idle_0.png",
        OUT / "ui" / "recycled_material.png",
        OUT / "ui" / "build_mode.png",
    ]
    contact_sheet = make_contact_sheet(
        preview_paths, "lobby-gpt-assets-contact-sheet.png"
    )
    animation_paths = [
        OUT / "portal" / f"portal_idle_{frame}.png" for frame in range(6)
    ] + [
        OUT / "stations" / "recycling_idle_zone" / f"idle_{frame}.png"
        for frame in range(4)
    ]
    animation_contact_sheet = make_contact_sheet(
        animation_paths, "lobby-gpt-animation-frames.png"
    )
    print(f"Wrote {len(outputs)} runtime assets")
    print(f"QA: {qa_path}")
    print(f"Contact sheet: {contact_sheet}")
    print(f"Animation contact sheet: {animation_contact_sheet}")


if __name__ == "__main__":
    main()
