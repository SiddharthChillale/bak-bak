#!/usr/bin/env python3
"""Render the extension icon (play mark + sound waves on a terracotta tile).

    python3 scripts/make-icons.py      # writes public/icon/{16,32,48,96,128}.png

Drawn at 1024 px and downsampled so small sizes stay crisp. Requires Pillow.
"""
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 1024
BG = (180, 83, 42, 255)  # matches the player's accent (#b4532a)
FG = (255, 253, 249, 255)
OUT = Path(__file__).resolve().parent.parent / "public" / "icon"


def render() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([40, 40, SIZE - 40, SIZE - 40], radius=220, fill=BG)

    # Play triangle, slightly left of centre.
    d.polygon([(270, 300), (270, 724), (590, 512)], fill=FG)

    # Two sound-wave arcs to the right.
    for r, w in ((150, 70), (290, 70)):
        cx, cy = 560, 512
        d.arc([cx - r, cy - r, cx + r, cy + r], start=-48, end=48, fill=FG, width=w)
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    big = render()
    for size in (16, 32, 48, 96, 128):
        big.resize((size, size), Image.Resampling.LANCZOS).save(OUT / f"{size}.png")
    print(f"wrote icons to {OUT}")


if __name__ == "__main__":
    main()
