# RabeVideo — פריסה לאינטרנט

האפליקציה דורשת **Python + ffmpeg**, ולכן הדרך הקלה והכי יציבה היא לפרוס דרך Docker. הקבצים `Dockerfile`, `requirements.txt`, ו-`render.yaml` כבר מוכנים בריפו.

---

## אפשרות 1 — Render.com (מומלץ)

הכי קל, יש גם תוכנית מתנה / זולה.

1. דחוף את הריפו ל-GitHub:
   ```bash
   git init && git add . && git commit -m "rabevideo v1"
   gh repo create rabevideo --public --source=. --push
   ```
2. היכנס ל-[render.com](https://render.com) → **New +** → **Blueprint**.
3. בחר את הריפו שיצרת. Render מזהה את `render.yaml` ובונה אוטומטית את ה-Docker image.
4. אחרי כ-3-5 דקות יהיה לך URL כמו `https://rabevideo.onrender.com`.

## אפשרות 2 — Railway

1. `npm i -g @railway/cli`
2. `railway login && railway init`
3. `railway up` — מזהה את ה-Dockerfile ופורס.

## אפשרות 3 — Fly.io

1. התקן `flyctl` ועשה `fly auth login`.
2. `fly launch` (יבחר את ה-Dockerfile אוטומטית).
3. `fly deploy`.

## אפשרות 4 — VPS משלך (Hetzner / DigitalOcean / Linode)

```bash
# במכונה:
sudo apt update && sudo apt install -y docker.io git
git clone <YOUR_REPO> && cd rabevideo
sudo docker build -t rabevideo .
sudo docker run -d --restart unless-stopped -p 80:8080 rabevideo
```

ואז להוסיף Cloudflare / Caddy / nginx מקדימה ל-HTTPS.

---

## דומיין משלך

אחרי הפריסה, חבר את `rabevideo.azriasolutions.com` (או דומיין אחר) דרך הספק שבחרת (Render / Railway / Fly יש להם UI נח לקישור CNAME).

## משתני סביבה

- `PORT` — היציאה שעליה ירוץ השרת. נקבעת אוטומטית בכל הספקים.

## כמות העלאות גדולות

המגבלה ב-server.py היא 512MB לבקשה (`MAX_CONTENT_LENGTH`). אפשר להגדיל ב-`web/server.py` במידת הצורך.

## תיקיות שצריך לתחזק

- `music/` — ספריית שירים. אם רוצים שמירה קבועה — או לכלול בריפו, או למפות Volume.
- `output/` — סרטונים שיצאו. ב-render.yaml יש Volume של 5GB.
