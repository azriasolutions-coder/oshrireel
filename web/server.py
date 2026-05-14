import shutil
import sys
import time
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, render_template, send_file

# How long a rendered video may live on disk before being purged.
# The user previews + downloads it; after that we don't keep it around.
OUTPUT_TTL_SECONDS = 600  # 10 minutes


def purge_stale_outputs(output_dir: Path, ttl: int = OUTPUT_TTL_SECONDS) -> None:
    """Delete any video files in OUTPUT_DIR older than TTL seconds."""
    try:
        now = time.time()
        for f in output_dir.iterdir():
            if f.is_file() and now - f.stat().st_mtime > ttl:
                f.unlink(missing_ok=True)
    except Exception:
        pass  # cleanup is best-effort — never break a request over it

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from core.generator import (  # noqa: E402
    ALL_TRANSITIONS,
    ASPECT_PRESETS,
    AUDIO_EXTS,
    AUTO_MIX_TRANSITIONS,
    DEFAULT_ASPECT,
    MEDIA_EXTS,
    SCENE_DURATION,
    SCENE_LOOKS,
    TRANSITION_DURATION,
    check_ffmpeg,
    generate,
    list_music,
)

MUSIC_DIR = PROJECT_ROOT / "music"
OUTPUT_DIR = PROJECT_ROOT / "output"
WORKDIR = PROJECT_ROOT / "workdir"
for _d in (MUSIC_DIR, OUTPUT_DIR, WORKDIR):
    _d.mkdir(parents=True, exist_ok=True)

app = Flask(
    __name__,
    static_folder=str(PROJECT_ROOT / "web" / "static"),
    template_folder=str(PROJECT_ROOT / "web" / "templates"),
)
app.config["MAX_CONTENT_LENGTH"] = 300 * 1024 * 1024  # 300MB per request — VPS-friendly


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/music")
def api_music():
    tracks = list_music(MUSIC_DIR)
    return jsonify([{"name": t.name} for t in tracks])


@app.get("/api/transitions")
def api_transitions():
    return jsonify({
        "all": list(ALL_TRANSITIONS),
        "auto_mix": list(dict.fromkeys(AUTO_MIX_TRANSITIONS)),
        "looks": list(SCENE_LOOKS.keys()),
        "aspects": {k: list(v) for k, v in ASPECT_PRESETS.items()},
    })


@app.post("/api/music")
def api_upload_music():
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "no file"}), 400
    suffix = Path(f.filename).suffix.lower()
    if suffix not in AUDIO_EXTS:
        return jsonify({"error": f"unsupported audio type {suffix}"}), 400
    MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    target = MUSIC_DIR / Path(f.filename).name
    f.save(target)
    return jsonify({"name": target.name})


@app.post("/api/generate")
def api_generate():
    # Opportunistic cleanup: purge any old videos before we start a new one.
    purge_stale_outputs(OUTPUT_DIR)

    files = request.files.getlist("images")
    if not files:
        return jsonify({"error": "no images uploaded"}), 400

    music_name = (request.form.get("music") or "").strip()
    try:
        hold = float(request.form.get("hold") or SCENE_DURATION)
        xfade = float(request.form.get("xfade") or TRANSITION_DURATION)
    except ValueError:
        return jsonify({"error": "hold/xfade must be numeric"}), 400

    transition_spec = (request.form.get("transition") or "auto").strip()
    per_image_raw = request.form.get("per_image_transitions") or ""

    look_spec = (request.form.get("look") or "none").strip()
    if look_spec not in SCENE_LOOKS:
        look_spec = "none"

    aspect_spec = (request.form.get("aspect") or DEFAULT_ASPECT).strip()
    if aspect_spec not in ASPECT_PRESETS:
        aspect_spec = DEFAULT_ASPECT

    bg_file = request.files.get("background")

    job_id = uuid.uuid4().hex[:10]
    job_dir = WORKDIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    image_paths: list[Path] = []
    for idx, f in enumerate(files):
        if not f.filename:
            continue
        suffix = Path(f.filename).suffix.lower()
        if suffix not in MEDIA_EXTS:
            continue
        target = job_dir / f"{idx:04d}{suffix}"
        f.save(target)
        image_paths.append(target)

    if not image_paths:
        shutil.rmtree(job_dir, ignore_errors=True)
        return jsonify({"error": "no valid media (images/videos)"}), 400

    music_path: Path | None = None
    if music_name:
        candidate = MUSIC_DIR / music_name
        if candidate.exists():
            music_path = candidate

    bg_path: Path | None = None
    if bg_file and bg_file.filename:
        suffix = Path(bg_file.filename).suffix.lower()
        if suffix in MEDIA_EXTS:
            bg_path = job_dir / f"bg{suffix}"
            bg_file.save(bg_path)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_name = f"video_{int(time.time())}_{job_id}.mp4"
    output_path = OUTPUT_DIR / output_name

    n_gaps = max(0, len(image_paths) - 1)
    per_image_list = [x.strip() for x in per_image_raw.split(",")] if per_image_raw else []
    if per_image_list and any(per_image_list):
        from core.generator import resolve_transitions
        fallback = resolve_transitions(n_gaps, transition_spec)
        transition_arg: list[str] = []
        for i in range(n_gaps):
            override = per_image_list[i].strip() if i < len(per_image_list) else ""
            transition_arg.append(override if override else fallback[i])
    else:
        transition_arg = transition_spec  # type: ignore[assignment]

    try:
        _, transitions_used = generate(
            images=image_paths,
            output=output_path,
            music=music_path,
            hold=hold,
            xfade=xfade,
            transition=transition_arg,
            background=bg_path,
            look=look_spec,
            aspect=aspect_spec,
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)

    return jsonify({
        "ok": True,
        "video": output_name,
        "url": f"/api/video/{output_name}",
        "images": len(image_paths),
        "transitions": transitions_used,
    })


@app.get("/api/video/<name>")
def api_video(name: str):
    safe = Path(name).name
    target = OUTPUT_DIR / safe
    if not target.exists():
        return jsonify({"error": "not found"}), 404
    return send_file(target, mimetype="video/mp4", as_attachment=False, download_name=safe)


def main() -> None:
    check_ffmpeg()
    import os
    port_env = os.environ.get("PORT")
    if port_env:
        port = int(port_env)
        host = "0.0.0.0"
    else:
        port = 5057
        host = "127.0.0.1"
    print(f"OshriReel running at http://{host}:{port}")
    app.run(host=host, port=port, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
