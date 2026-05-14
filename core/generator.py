import subprocess
import shutil
import random
from pathlib import Path
from typing import Iterable, Sequence

WIDTH = 480
HEIGHT = 848
FPS = 25
SCENE_DURATION = 2.5
TRANSITION_DURATION = 0.4
BLUR_RADIUS = 25
BACKDROP_DARKEN = -0.18

# Aspect-ratio presets. Each tuple is (width, height) in px.
ASPECT_PRESETS: dict[str, tuple[int, int]] = {
    "9:16":     (480, 848),    # Reels / WhatsApp Status (default)
    "9:16-hd":  (720, 1280),   # Same ratio, HD
    "1:1":      (720, 720),    # Square — Instagram feed
    "4:5":      (864, 1080),   # Instagram portrait
    "3:4":      (480, 640),    # Classic portrait
    "16:9":     (1280, 720),   # Landscape — YouTube
    "16:9-hd":  (1920, 1080),  # Full HD landscape
}
DEFAULT_ASPECT = "9:16"


def resolve_aspect(name: str | None) -> tuple[int, int]:
    if not name:
        return ASPECT_PRESETS[DEFAULT_ASPECT]
    return ASPECT_PRESETS.get(name, ASPECT_PRESETS[DEFAULT_ASPECT])

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".heic"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"}
MEDIA_EXTS = IMAGE_EXTS | VIDEO_EXTS
AUDIO_EXTS = {".mp3", ".m4a", ".aac", ".wav", ".ogg"}

# Cinematic "looks" applied uniformly to every scene's foreground.
# Each look is an ffmpeg filter chain inserted right before the trim/fps step.
SCENE_LOOKS: dict[str, str] = {
    "none": "",
    "cinematic": "eq=contrast=1.08:saturation=1.05:gamma=0.95,vignette=PI/5",
    "warm": "eq=gamma_r=1.06:gamma_b=0.92:saturation=1.08:contrast=1.04,curves=preset=warmer",
    "cool": "eq=gamma_r=0.94:gamma_b=1.06:saturation=0.95:contrast=1.03,curves=preset=cooler",
    "vintage": "curves=preset=vintage,vignette=PI/4,noise=alls=8:allf=t",
    "sepia": "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=contrast=1.05",
    "vivid": "eq=saturation=1.35:contrast=1.08:gamma=0.97",
    "noir": "hue=s=0,eq=contrast=1.2:gamma=0.92,vignette=PI/4",
    "sparkle": "eq=brightness=0.02:saturation=1.1,gblur=sigma=0.4",
}
DEFAULT_LOOK = "none"


def is_video(path: Path) -> bool:
    return path.suffix.lower() in VIDEO_EXTS

CUT_KEYWORD = "cut"

# Every xfade transition shipped by ffmpeg (selected — these all render correctly on yuv420p).
NATIVE_XFADE_TRANSITIONS: tuple[str, ...] = (
    "fade", "fadeblack", "fadewhite",
    "wipeleft", "wiperight", "wipeup", "wipedown",
    "slideleft", "slideright", "slideup", "slidedown",
    "smoothleft", "smoothright", "smoothup", "smoothdown",
    "circleopen", "circleclose",
    "vertopen", "vertclose", "horzopen", "horzclose",
    "dissolve", "pixelize",
    "diagtl", "diagtr", "diagbl", "diagbr",
    "hblur", "radial", "zoomin",
    "coverleft", "coverright", "coverup", "coverdown",
    "revealleft", "revealright", "revealup", "revealdown",
)

ALL_TRANSITIONS: tuple[str, ...] = NATIVE_XFADE_TRANSITIONS + (CUT_KEYWORD,)

# Curated "auto mix" — looks the most natural on portrait Reels-style content.
AUTO_MIX_TRANSITIONS: tuple[str, ...] = (
    "fade", "fade", "fade",  # weighted higher: most common in the reference video
    "slideleft", "slideright", "slideup", "slidedown",
    "smoothleft", "smoothright",
    "coverleft", "coverright",
    "circleopen", "circleclose",
    "radial", "zoomin",
    "wipeleft", "wiperight",
    "pixelize",
)


def list_images(folder: Path) -> list[Path]:
    return sorted(p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXTS)


def list_inputs(folder: Path) -> list[Path]:
    """List both images and videos as ordered scene inputs."""
    return sorted(p for p in folder.iterdir() if p.suffix.lower() in MEDIA_EXTS)


def list_music(folder: Path) -> list[Path]:
    if not folder.exists():
        return []
    return sorted(p for p in folder.iterdir() if p.suffix.lower() in AUDIO_EXTS)


def per_image_filter(
    idx: int,
    hold: float,
    is_clip: bool = False,
    bg_label: str | None = None,
    look: str = DEFAULT_LOOK,
    width: int = WIDTH,
    height: int = HEIGHT,
) -> str:
    """Per-scene branch: backdrop + fitted foreground.

    Works for stills (looped via -loop 1 -t hold) AND for video clips. For
    clips we pre-pad with cloned final frames so shorter clips still fill
    `hold` seconds; longer clips are trimmed by the closing trim filter.

    bg_label: if provided (e.g. "bgchunk0"), use that pre-built filter label
              as the backdrop. Otherwise the backdrop is a blurred copy of
              the scene image itself.
    """
    pre = "setpts=PTS-STARTPTS,"
    if is_clip:
        # `tpad` clones the last frame for up to `hold` seconds — safe no-op
        # for clips that are already longer than `hold` (trim cuts them).
        pre += f"tpad=stop_mode=clone:stop_duration={hold:.3f},"
    if bg_label:
        bg_branch = f"[{bg_label}]null[bg{idx}];"
    else:
        bg_branch = (
            f"[{idx}:v]"
            f"{pre}"
            f"scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},"
            f"boxblur={BLUR_RADIUS}:1,"
            f"eq=brightness={BACKDROP_DARKEN}:saturation=0.85"
            f"[bg{idx}];"
        )
    look_chain = SCENE_LOOKS.get(look or "none", "")
    look_step = f"{look_chain}," if look_chain else ""
    return (
        f"{bg_branch}"
        f"[{idx}:v]"
        f"{pre}"
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        # Convert to RGBA *before* the pad so the padded gaps are genuinely
        # transparent — otherwise yuv420p has no alpha and `black@0` becomes
        # solid black, which hides the user's chosen background.
        f"format=rgba,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black@0"
        f"[fg{idx}];"
        f"[bg{idx}][fg{idx}]overlay=(W-w)/2:(H-h)/2:format=auto,"
        f"format=yuv420p,"
        f"{look_step}"
        f"trim=duration={hold},setpts=PTS-STARTPTS,fps={FPS}"
        f"[v{idx}]"
    )


def resolve_transitions(n_gaps: int, spec) -> list[str]:
    """Turn a user spec into a per-gap list of transition names.

    spec may be:
      - None / ""                 -> all gaps use "fade"
      - a single transition name  -> all gaps use that name
      - "random" / "auto" / "mix" -> random pick from AUTO_MIX_TRANSITIONS per gap
      - "cycle" / "all"           -> cycle through ALL_TRANSITIONS
      - comma-separated string    -> cycle through that list
      - list of names             -> cycle through that list
    Unknown names fall back to "fade".
    """
    if n_gaps <= 0:
        return []

    if spec is None or (isinstance(spec, str) and not spec.strip()):
        return ["fade"] * n_gaps

    if isinstance(spec, str):
        s = spec.strip().lower()
        if s in ("random", "auto", "mix"):
            return [random.choice(AUTO_MIX_TRANSITIONS) for _ in range(n_gaps)]
        if s in ("cycle", "all"):
            pool = list(ALL_TRANSITIONS)
            random.shuffle(pool)  # nicer than strict order, still each gap unique modulo length
            return [pool[i % len(pool)] for i in range(n_gaps)]
        if "," in s:
            names = [p.strip() for p in s.split(",") if p.strip()]
        else:
            return [_normalize_name(s)] * n_gaps
    elif isinstance(spec, Sequence):
        names = [str(x).strip() for x in spec if str(x).strip()]
    else:
        return ["fade"] * n_gaps

    if not names:
        return ["fade"] * n_gaps
    return [_normalize_name(names[i % len(names)]) for i in range(n_gaps)]


def _normalize_name(name: str) -> str:
    n = name.strip().lower()
    if n == CUT_KEYWORD:
        return CUT_KEYWORD
    if n in NATIVE_XFADE_TRANSITIONS:
        return n
    # alias a few common names
    aliases = {
        "crossfade": "fade",
        "dissolve": "dissolve",
        "push-left": "slideleft",
        "push-right": "slideright",
        "push-up": "slideup",
        "push-down": "slidedown",
    }
    return aliases.get(n, "fade")


def _gap_duration(name: str, xfade: float) -> float:
    return (1.0 / FPS) if name == CUT_KEYWORD else xfade


def _gap_xfade_name(name: str) -> str:
    return "fade" if name == CUT_KEYWORD else name


def build_filtergraph(
    n_images: int,
    hold: float,
    xfade: float,
    transitions: list[str],
    is_clip_flags: Sequence[bool] | None = None,
    bg_input_idx: int | None = None,
    look: str = DEFAULT_LOOK,
    width: int = WIDTH,
    height: int = HEIGHT,
) -> tuple[str, str]:
    """Build the full filter graph and return (graph, final_label).

    If bg_input_idx is given, that ffmpeg input is sliced into n per-scene
    backdrop chunks and used as the backdrop for each scene (replacing the
    default per-scene blurred copy).
    """
    flags = list(is_clip_flags) if is_clip_flags is not None else [False] * n_images
    parts: list[str] = []
    bg_labels: list[str | None] = [None] * n_images

    if bg_input_idx is not None:
        split_out = "".join(f"[bgraw{i}]" for i in range(n_images))
        parts.append(
            f"[{bg_input_idx}:v]"
            f"scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},"
            f"eq=brightness={BACKDROP_DARKEN}:saturation=0.95,"
            f"format=yuv420p,fps={FPS},split={n_images}{split_out}"
        )
        for i in range(n_images):
            start = i * hold
            parts.append(
                f"[bgraw{i}]"
                f"trim=start={start:.3f}:duration={hold:.3f},"
                f"setpts=PTS-STARTPTS"
                f"[bgchunk{i}]"
            )
            bg_labels[i] = f"bgchunk{i}"

    for i in range(n_images):
        parts.append(per_image_filter(i, hold, flags[i], bg_labels[i], look, width, height))

    if n_images == 1:
        return ";".join(parts), "v0"

    assert len(transitions) >= n_images - 1, "need one transition per gap"

    prev_label = "v0"
    cursor = 0.0
    for i in range(1, n_images):
        name = transitions[i - 1]
        gap_xf = _gap_duration(name, xfade)
        xfade_name = _gap_xfade_name(name)
        cursor += hold - gap_xf
        offset = cursor
        out_label = f"x{i}"
        parts.append(
            f"[{prev_label}][v{i}]xfade=transition={xfade_name}:"
            f"duration={gap_xf:.4f}:offset={offset:.3f}[{out_label}]"
        )
        prev_label = out_label

    return ";".join(parts), prev_label


def total_video_duration(n: int, hold: float, gap_durs: Sequence[float]) -> float:
    if n <= 0:
        return 0.0
    if n == 1:
        return hold
    return n * hold - sum(gap_durs[: n - 1])


def pick_music(music_dir: Path, explicit: Path | None) -> Path | None:
    if explicit is not None:
        return explicit
    tracks = list_music(music_dir)
    if not tracks:
        return None
    return random.choice(tracks)


def generate(
    images: Iterable[Path],
    output: Path,
    music: Path | None,
    hold: float = SCENE_DURATION,
    xfade: float = TRANSITION_DURATION,
    fade_out: float = 1.0,
    transition: str | Sequence[str] | None = "fade",
    background: Path | None = None,
    look: str = DEFAULT_LOOK,
    aspect: str | None = DEFAULT_ASPECT,
) -> tuple[Path, list[str]]:
    """Render the video. Returns (output_path, transitions_used_per_gap)."""
    image_list = [Path(p) for p in images]
    if not image_list:
        raise ValueError("No images provided")
    for p in image_list:
        if not p.exists():
            raise FileNotFoundError(p)
    if xfade >= hold:
        xfade = max(0.1, hold / 4)

    n = len(image_list)
    clip_flags = [is_video(p) for p in image_list]
    transitions = resolve_transitions(n - 1, transition)
    gap_durs = [_gap_duration(t, xfade) for t in transitions]

    duration = total_video_duration(n, hold, gap_durs)

    bg_path: Path | None = None
    if background is not None and Path(background).exists():
        bg_path = Path(background)
    bg_input_idx = n if bg_path is not None else None

    width, height = resolve_aspect(aspect)
    graph, final = build_filtergraph(n, hold, xfade, transitions, clip_flags, bg_input_idx, look, width, height)

    if fade_out > 0:
        graph += f";[{final}]fade=t=out:st={max(0, duration - fade_out):.3f}:d={fade_out}[vout]"
        final = "vout"

    cmd: list[str] = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    for p, is_clip in zip(image_list, clip_flags):
        if is_clip:
            # Read each clip from start; only take the first `hold` seconds (-t before -i).
            cmd += ["-t", f"{hold:.3f}", "-i", str(p)]
        else:
            cmd += ["-loop", "1", "-t", f"{hold:.3f}", "-i", str(p)]

    # The bg input sits between scenes and music so audio_input_index lines up.
    bg_total = n * hold  # enough for all per-scene chunks
    if bg_path is not None:
        if is_video(bg_path):
            cmd += ["-stream_loop", "-1", "-t", f"{bg_total:.3f}", "-i", str(bg_path)]
        else:
            cmd += ["-loop", "1", "-t", f"{bg_total:.3f}", "-i", str(bg_path)]

    audio_input_index: int | None = None
    if music is not None and Path(music).exists():
        audio_input_index = n + (1 if bg_input_idx is not None else 0)
        cmd += ["-stream_loop", "-1", "-i", str(music)]

    cmd += ["-filter_complex", graph, "-map", f"[{final}]"]

    if audio_input_index is not None:
        cmd += [
            "-map", f"{audio_input_index}:a",
            "-c:a", "aac", "-b:a", "192k",
            "-af", f"afade=t=out:st={max(0, duration - fade_out):.3f}:d={fade_out}",
            "-shortest",
        ]

    cmd += [
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        # ultrafast preset uses far less RAM and CPU than medium, at a small
        # filesize penalty — essential on memory-constrained free hosting.
        "-preset", "ultrafast",
        "-crf", "23",
        "-threads", "2",
        "-r", str(FPS),
        "-t", f"{duration:.3f}",
        "-movflags", "+faststart",
        str(output),
    ]

    output.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            "ffmpeg failed:\n"
            + (proc.stderr or "")
            + "\n\nCommand was:\n"
            + " ".join(f'"{c}"' if " " in c else c for c in cmd)
        )
    return output, transitions


def check_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not found in PATH")
