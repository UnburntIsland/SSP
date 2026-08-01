from __future__ import annotations

import re
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "js" / "lobbyPlacement.js"
BACKGROUND = ROOT / "assets" / "images" / "lobby" / "ground" / "lobby_map.png"
OUTPUT = ROOT / "output" / "collision-qa" / "lobby-collision-overlay.png"


def parse_polygons(
    source: str,
    start_marker: str,
    end_marker: str,
) -> list[tuple[str, list[tuple[int, int]]]]:
    section = source.split(start_marker, 1)[1].split(end_marker, 1)[0]
    matches = re.findall(
        r'name:\s*"([^"]+)",\s*points:\s*\[(.*?)\]\s*\}',
        section,
        re.DOTALL,
    )
    return [
        (name, [(int(x), int(y)) for x, y in re.findall(r"\[(\d+),\s*(\d+)\]", body)])
        for name, body in matches
    ]


def parse_fixed_rects(source: str) -> list[tuple[int, int, int, int]]:
    section = source.split("fixedCollisionRects: [", 1)[1].split("],", 1)[0]
    return [
        tuple(map(int, values))
        for values in re.findall(
            r"\{\s*x:\s*(\d+),\s*y:\s*(\d+),\s*w:\s*(\d+),\s*h:\s*(\d+)",
            section,
        )
    ]


def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    polygons = parse_polygons(source, "walkablePolygons: [", "blockedPolygons:")
    blocked_polygons = parse_polygons(source, "blockedPolygons: [", "blockedRects:")
    fixed_rects = parse_fixed_rects(source)
    background = Image.open(BACKGROUND).convert("RGBA")
    overlay = Image.new("RGBA", background.size)
    draw = ImageDraw.Draw(overlay, "RGBA")
    colors = [
        (40, 230, 145, 62),
        (66, 214, 255, 72),
        (255, 211, 79, 70),
        (198, 126, 255, 72),
    ]

    for index, (_, points) in enumerate(polygons):
        if len(points) < 3:
            continue
        draw.polygon(points, fill=colors[index % len(colors)])
        draw.line(points + [points[0]], fill=(205, 255, 236, 255), width=4)

    for _, points in blocked_polygons:
        if len(points) < 3:
            continue
        draw.polygon(points, fill=(255, 71, 87, 92))
        draw.line(points + [points[0]], fill=(255, 225, 228, 255), width=3)

    for x, y, width, height in fixed_rects:
        draw.rectangle(
            (x, y, x + width, y + height),
            fill=(255, 71, 87, 92),
            outline=(255, 225, 228, 255),
            width=3,
        )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    Image.alpha_composite(background, overlay).save(OUTPUT)
    print(
        f"Rendered {len(polygons)} walkable polygons, "
        f"{len(blocked_polygons)} scenery obstacles, and {len(fixed_rects)} fixed obstacles"
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()
