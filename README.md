# אוֹשרי-Reel · OshriReel

> סטודיו אוטומטי ליצירת סרטוני סיכום שבועי וזמני שבת — בלחיצת כפתור.

מערכת לייצור סרטונים אנכיים (480×848 / 720×1280) ובפורמטים נוספים מסט תמונות וקליפים, עם מעברים מעוצבים, פילטרים קולנועיים, רקע מותאם, ושיר רקע. נבנה במיוחד עבור התוכן השבועי של **הרב אושרי אביכזר** וקהילת **ש"ס באר שבע**.

## תכונות

- 🎞️ **39 אפקטי מעבר** (fade, slide, circle, radial, zoomin, pixelize, ועוד)
- 🎨 **9 פילטרים קולנועיים** — Cinematic, Warm, Cool, Vintage, Sepia, Vivid, Noir, Sparkle, None
- 📐 **7 גדלי וידאו** — 9:16, 1:1, 4:5, 3:4, 16:9 (כולל HD)
- 📌 **הצמדת מיקומים** — הצמד תמונות למיקומים, השאר יתפזר אקראית
- 🖼️ **רקע מותאם** — תמונה או וידאו מאחורי כל הסצנות
- 🎵 **בחירת מוזיקה** — מספריה מקומית או העלאה
- 🎬 **קלט מעורב** — תמונות וקליפים יחד

## דרישות

- Python 3.10+
- ffmpeg ב-PATH

## הפעלה

```bash
pip install -r requirements.txt
python -m web.server
# → http://127.0.0.1:5057
```

## CLI

```bash
python cli.py /path/to/images -o output.mp4 --transition auto --look cinematic --aspect 9:16
python cli.py --list-transitions   # רשימת אפקטים מלאה
```

## פריסה

ראה `DEPLOY.md`. כולל `Dockerfile` + `render.yaml` למוכן ל-Render בלחיצה.

---

<div align="center">

**מבית [AzriaSolutions](https://azriasolutions.com)** · [054-566-0226](tel:+972545660226)

</div>
