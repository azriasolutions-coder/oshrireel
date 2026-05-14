FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# ffmpeg is the only system-level dependency RabeVideo needs.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Runtime-writable folders.
RUN mkdir -p music output workdir

# Render / Railway / Fly all inject $PORT.
ENV PORT=8080
EXPOSE 8080

# Tight worker count — ffmpeg is CPU-heavy; serial requests are fine for v1.
# `--timeout 600` because long videos can take a while to encode.
CMD gunicorn --bind 0.0.0.0:${PORT} --workers 1 --threads 2 --timeout 600 web.server:app
