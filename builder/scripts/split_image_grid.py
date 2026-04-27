#!/usr/bin/env python3
import argparse
from pathlib import Path
import sys


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Split one image into equal tiles in a configurable grid."
    )
    parser.add_argument("image", help="Path to the source image")
    parser.add_argument(
        "-o",
        "--output-dir",
        default="split_output",
        help="Directory to save the output tiles",
    )
    parser.add_argument(
        "-p",
        "--prefix",
        default="tile",
        help="Filename prefix for the output tiles",
    )
    parser.add_argument(
        "--rows",
        type=int,
        default=4,
        help="Number of rows in the output grid",
    )
    parser.add_argument(
        "--cols",
        type=int,
        default=4,
        help="Number of columns in the output grid",
    )
    parser.add_argument(
        "--trim-transparent",
        action="store_true",
        help="Trim fully transparent padding from each output tile",
    )
    return parser.parse_args()


def trim_transparent_edges(image):
    if "A" not in image.getbands():
        return image

    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return image
    return image.crop(bbox)


def main() -> int:
    args = parse_args()

    try:
        from PIL import Image
    except ImportError:
        print("Missing dependency: Pillow. Install it with `pip install pillow`.", file=sys.stderr)
        return 1

    image_path = Path(args.image).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()

    if not image_path.is_file():
        print(f"Image not found: {image_path}", file=sys.stderr)
        return 1
    if args.rows <= 0 or args.cols <= 0:
        print("Rows and columns must both be positive integers.", file=sys.stderr)
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)

    with Image.open(image_path) as img:
        width, height = img.size

        if width % args.cols != 0 or height % args.rows != 0:
            print(
                (
                    "Image size must be divisible by the grid size. "
                    f"Current size: {width}x{height}, grid: {args.rows}x{args.cols}"
                ),
                file=sys.stderr,
            )
            return 1

        tile_width = width // args.cols
        tile_height = height // args.rows

        for row in range(args.rows):
            for col in range(args.cols):
                left = col * tile_width
                upper = row * tile_height
                right = left + tile_width
                lower = upper + tile_height

                tile = img.crop((left, upper, right, lower))
                if args.trim_transparent:
                    tile = trim_transparent_edges(tile)
                output_path = output_dir / f"{args.prefix}_{row + 1}_{col + 1}.png"
                tile.save(output_path)

    print(f"Done. Saved {args.rows * args.cols} tiles to: {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
