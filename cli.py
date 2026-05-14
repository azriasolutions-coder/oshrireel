import argparse
import sys
from pathlib import Path

from core.generator import (
    ALL_TRANSITIONS,
    ASPECT_PRESETS,
    DEFAULT_ASPECT,
    SCENE_DURATION,
    SCENE_LOOKS,
    TRANSITION_DURATION,
    check_ffmpeg,
    generate,
    list_inputs,
    pick_music,
)

PROJECT_ROOT = Path(__file__).resolve().parent


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate a vertical video from a folder of images with music."
    )
    parser.add_argument(
        "input",
        type=Path,
        help=(
            "Folder of media (sorted by filename) OR a list of media paths. "
            "Each scene can be an image OR a video clip; mixed lists are fine."
        ),
        nargs="+",
    )
    parser.add_argument(
        "-o", "--output",
        type=Path,
        default=PROJECT_ROOT / "output" / "video.mp4",
        help="Output MP4 path",
    )
    parser.add_argument(
        "-m", "--music",
        type=Path,
        default=None,
        help="Audio file. If omitted, picks a random track from ./music",
    )
    parser.add_argument(
        "--music-dir",
        type=Path,
        default=PROJECT_ROOT / "music",
        help="Music library folder (used when --music is omitted)",
    )
    parser.add_argument(
        "--hold",
        type=float,
        default=SCENE_DURATION,
        help=f"Seconds per image (default {SCENE_DURATION})",
    )
    parser.add_argument(
        "--xfade",
        type=float,
        default=TRANSITION_DURATION,
        help=f"Transition duration in seconds (default {TRANSITION_DURATION})",
    )
    parser.add_argument(
        "--transition",
        type=str,
        default="auto",
        help=(
            "Transition effect. Options: 'auto' (random tasteful mix), 'cycle' "
            "(rotate through everything), a single name like 'fade'/'slideleft'/"
            "'circleopen'/'cut', or a comma-separated list (cycles per gap). "
            "Full list: " + ", ".join(ALL_TRANSITIONS)
        ),
    )
    parser.add_argument(
        "--list-transitions",
        action="store_true",
        help="Print the full transition library and exit.",
    )
    parser.add_argument(
        "--background",
        type=Path,
        default=None,
        help="Optional image or video file to use as the backdrop behind every scene. If omitted, each scene uses a blurred copy of itself.",
    )
    parser.add_argument(
        "--look",
        type=str,
        default="none",
        choices=list(SCENE_LOOKS.keys()),
        help="Cinematic colour/grain look applied to every scene.",
    )
    parser.add_argument(
        "--aspect",
        type=str,
        default=DEFAULT_ASPECT,
        choices=list(ASPECT_PRESETS.keys()),
        help=f"Output aspect ratio / resolution preset (default {DEFAULT_ASPECT}).",
    )
    args = parser.parse_args(argv)

    if args.list_transitions:
        for name in ALL_TRANSITIONS:
            print(name)
        return 0

    check_ffmpeg()

    if len(args.input) == 1 and args.input[0].is_dir():
        images = list_inputs(args.input[0])
        if not images:
            print(f"No media (images/videos) found in {args.input[0]}", file=sys.stderr)
            return 2
    else:
        images = [Path(p) for p in args.input]

    music = pick_music(args.music_dir, args.music)
    if music:
        print(f"Music: {music.name}")
    else:
        print("Music: (none — silent video)")

    print(f"Images: {len(images)} -> {args.output}")
    _, transitions_used = generate(
        images=images,
        output=args.output,
        music=music,
        hold=args.hold,
        xfade=args.xfade,
        transition=args.transition,
        background=args.background,
        look=args.look,
        aspect=args.aspect,
    )
    if transitions_used:
        print("Transitions: " + ", ".join(transitions_used))
    print(f"Done: {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
