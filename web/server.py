import queue
import shutil
import sys
import threading
import time
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, render_template, send_file

# How long a rendered video may live on disk before being purged.
# The user previews + downloads it; after that we don't keep it around.
OUTPUT_TTL_SECONDS = 600  # 10 minutes
# How long a finished job's metadata stays in the JOBS dict for status polling.
JOB_TTL_SECONDS = 1800  # 30 minutes

# ---- Render queue + jobs registry --------------------------------------------
# A single worker drains this queue, so only one ffmpeg pipeline runs at a time
# regardless of how many users press "Generate". This prevents the concurrent
# OOM that happens when several ffmpeg processes each try to grab 4–8GB on an
# 8GB cgroup.
RENDER_QUEUE: "queue.Queue" = queue.Queue()
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()


def _refresh_queue_positions() -> None:
    """Renumber 1-based queue positions for jobs still in `queued` state.
    Caller must hold JOBS_LOCK."""
    pending = [
        (jid, j) for jid, j in JOBS.items()
        if j.get("status") == "queued"
    ]
    pending.sort(key=lambda kv: kv[1].get("created_at", 0))
    for i, (_jid, j) in enumerate(pending):
        j["queue_position"] = i + 1


def _purge_stale_jobs() -> None:
    """Drop finished jobs whose result has expired."""
    now = time.time()
    with JOBS_LOCK:
        for jid in list(JOBS.keys()):
            j = JOBS[jid]
            done_at = j.get("finished_at") or 0
            if j.get("status") in ("done", "failed") and done_at and now - done_at > JOB_TTL_SECONDS:
                JOBS.pop(jid, None)


def _render_worker() -> None:
    """Background thread: pulls jobs and renders them serially."""
    while True:
        item = RENDER_QUEUE.get()
        if item is None:
            RENDER_QUEUE.task_done()
            continue
        job_id, params = item
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"] = "rendering"
                JOBS[job_id]["started_at"] = time.time()
                JOBS[job_id].pop("queue_position", None)
        job_dir = params.pop("_job_dir", None)
        try:
            output_path = params["output"]
            _, transitions_used = generate(**params)
            with JOBS_LOCK:
                if job_id in JOBS:
                    JOBS[job_id].update({
                        "status": "done",
                        "video_filename": output_path.name,
                        "video_url": f"/api/video/{output_path.name}",
                        "transitions": transitions_used,
                        "finished_at": time.time(),
                    })
        except Exception as e:
            with JOBS_LOCK:
                if job_id in JOBS:
                    JOBS[job_id].update({
                        "status": "failed",
                        "error": str(e)[:500],
                        "finished_at": time.time(),
                    })
        finally:
            if job_dir is not None:
                shutil.rmtree(job_dir, ignore_errors=True)
            RENDER_QUEUE.task_done()
            with JOBS_LOCK:
                _refresh_queue_positions()
            _purge_stale_jobs()


# Launch a single worker thread on import. With gunicorn --workers 1 --threads 2
# this is the one worker per process.
threading.Thread(target=_render_worker, daemon=True, name="render-worker").start()


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
    DEFAULT_MOTION,
    MEDIA_EXTS,
    SCENE_DURATION,
    SCENE_LOOKS,
    SCENE_MOTIONS,
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

    motion_spec = (request.form.get("motion") or DEFAULT_MOTION).strip()
    if motion_spec not in SCENE_MOTIONS:
        motion_spec = DEFAULT_MOTION

    # Optional per-image motion override list (CSV; blanks fall back to motion_spec).
    per_image_motions_raw = request.form.get("per_image_motions") or ""

    # Speed multiplier 0.5..2.0 (further clamped in generate()).
    try:
        speed_val = float(request.form.get("speed") or 1.0)
    except ValueError:
        speed_val = 1.0

    watermark_pos = (request.form.get("watermark_pos") or "none").strip()

    # Per-scene Hebrew text overlays (CSV-style — `||` separates, blanks for none).
    texts_raw = request.form.get("per_image_texts") or ""

    bg_file = request.files.get("background")
    wm_file = request.files.get("watermark")

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

    wm_path: Path | None = None
    if wm_file and wm_file.filename and watermark_pos != "none":
        suffix = Path(wm_file.filename).suffix.lower()
        if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
            wm_path = job_dir / f"watermark{suffix}"
            wm_file.save(wm_path)

    # Parse per-scene texts: split by "||" so individual texts can contain commas.
    texts_list: list[str] = []
    if texts_raw:
        texts_list = [t.strip() for t in texts_raw.split("||")]
    while len(texts_list) < len(image_paths):
        texts_list.append("")

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

    # Per-scene motion: blanks fall back to the global motion_spec.
    n_scenes = len(image_paths)
    per_image_motion_list = [x.strip() for x in per_image_motions_raw.split(",")] if per_image_motions_raw else []
    if per_image_motion_list and any(per_image_motion_list):
        motion_arg: "str | list[str]" = []
        for i in range(n_scenes):
            override = per_image_motion_list[i].strip() if i < len(per_image_motion_list) else ""
            motion_arg.append(override if override in SCENE_MOTIONS and override else motion_spec)
    else:
        motion_arg = motion_spec

    # Enqueue — actual ffmpeg work runs serially in the background worker.
    params = {
        "images": image_paths,
        "output": output_path,
        "music": music_path,
        "hold": hold,
        "xfade": xfade,
        "transition": transition_arg,
        "background": bg_path,
        "look": look_spec,
        "aspect": aspect_spec,
        "motion": motion_arg,
        "texts": texts_list,
        "speed": speed_val,
        "watermark": wm_path,
        "watermark_pos": watermark_pos,
        "_job_dir": job_dir,  # not a generate() kwarg — worker uses it for cleanup
    }
    new_job_id = uuid.uuid4().hex[:12]
    with JOBS_LOCK:
        JOBS[new_job_id] = {
            "status": "queued",
            "queue_position": RENDER_QUEUE.qsize() + 1,
            "created_at": time.time(),
            "images": len(image_paths),
        }
    RENDER_QUEUE.put((new_job_id, params))
    return jsonify({"ok": True, "job_id": new_job_id})


@app.get("/api/job/<job_id>")
def api_job(job_id: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return jsonify({"ok": False, "error": "job not found"}), 404
        return jsonify({"ok": True, **job})


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
