#!/usr/bin/env python3
"""Daily independent verification of prayer times.

Reads each masjid's website like a human user would (headless browser +
Claude extracting the visible times) and compares against what the API/DB
is serving to the app. This deliberately shares ZERO logic with the Go
scraper, so a scraper bug that captures wrong times shows up here as a
mismatch instead of silently agreeing with itself.

Categories per masjid:
  MATCH      website times == DB times
  MISMATCH   website shows different times than the DB  -> action needed
  UNREADABLE site down / JS broken / no times visible   -> verification gap

Delivery: HTML email via Gmail SMTP + local report file + log.
Config via scripts/verify-prayer-times/.env (see .env.example).
"""

import json
import os
import re
import smtplib
import ssl
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPORTS_DIR = SCRIPT_DIR / "reports"

# ---------------------------------------------------------------- config


def load_env():
    env_file = SCRIPT_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())


load_env()

API_BASE = os.environ.get("API_BASE", "https://prayer-times-api-uddr.onrender.com")
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5")
GMAIL_USER = os.environ.get("GMAIL_USER", "shaqir134@gmail.com")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "").replace(" ", "")
REPORT_TO = os.environ.get("REPORT_TO", GMAIL_USER)
PAGE_TIMEOUT_MS = int(os.environ.get("PAGE_TIMEOUT_MS", "45000"))
MAX_PAGE_CHARS = 15000

PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"]

# Masjids whose sites the Go scrapers can't read reliably, so we SOURCE their
# daily times from the AI reader here and push them to the DB (with --push).
# Matched by substring against the masjid's URL. Keep this list tiny — the Go
# scrapers are always-on (Render) and free; the AI push depends on this machine
# running, so only use it when there's genuinely no server-side source.
#
# Currently empty: ISV Preston moved back to the Go scraper, which reads
# themasjidapp's embedded day-of-year JSON server-side (always-on). The --push
# mechanism and the admin endpoint remain available for any future case.
AI_SOURCED_URL_SUBSTRINGS = ()

MELBOURNE = timezone(timedelta(hours=10))  # AEST; DST only shifts date near midnight
TODAY = datetime.now(MELBOURNE).strftime("%Y-%m-%d")
TODAY_HUMAN = datetime.now(MELBOURNE).strftime("%A, %-d %B %Y")


def log(msg):
    print(f"[{datetime.now(MELBOURNE).strftime('%H:%M:%S')}] {msg}", flush=True)


# ---------------------------------------------------------------- API side


def api_get(path, timeout=30):
    with urllib.request.urlopen(f"{API_BASE}{path}", timeout=timeout) as r:
        return json.loads(r.read())


def api_put(path, payload, timeout=30):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{API_BASE}{path}", data=data, method="PUT",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def to_24h(s):
    """Convert a displayed time (e.g. '6:17AM', '5:57 pm', '17:20') to 'HH:MM',
    or None if unparseable. AM/PM is honored; a bare time is assumed 24-hour."""
    if not s:
        return None
    s = s.strip()
    m = re.match(r"(\d{1,2}):(\d{2})\s*([APap][Mm])?", s)
    if not m:
        return None
    h, mn = int(m.group(1)), int(m.group(2))
    ap = (m.group(3) or "").lower()
    if ap == "pm" and h != 12:
        h += 12
    elif ap == "am" and h == 12:
        h = 0
    if h > 23 or mn > 59:
        return None
    return f"{h:02d}:{mn:02d}"


def is_ai_sourced(url):
    return any(sub in (url or "") for sub in AI_SOURCED_URL_SUBSTRINGS)


def push_times(masjid_id, site):
    """Write AI-read adhan/iqama to the DB. Raises on failure. Skips if any
    adhan is missing (a partial read must not overwrite good data)."""
    payload = {}
    for p in PRAYERS:
        pp = (site.get("prayers") or {}).get(p) or {}
        adhan = to_24h(pp.get("adhan"))
        if not adhan:
            raise ValueError(f"missing/invalid adhan for {p}")
        entry = {"adhan": adhan}
        iqama = to_24h(pp.get("iqama"))
        if iqama:
            entry["iqama"] = iqama
        payload[p] = entry
    return api_put(f"/api/v1/admin/prayer-times/{masjid_id}", payload)


def wake_api():
    log("Waking API...")
    for attempt in range(3):
        try:
            api_get("/health", timeout=60)
            time.sleep(3)
            return True
        except Exception as e:
            log(f"  health check attempt {attempt + 1} failed: {e}")
            time.sleep(10)
    return False


def fetch_db_state():
    """What the app is currently serving: times + jummah per masjid."""
    masjids = api_get("/api/v1/masjids")
    for m in masjids:
        try:
            m["db_times"] = api_get(f"/api/v1/prayer-times/{m['id']}")
        except Exception as e:
            m["db_times"] = None
            log(f"  warn: no DB times for {m['name']}: {e}")
        try:
            m["db_jummah"] = api_get(f"/api/v1/jummah/{m['id']}").get("sessions", [])
        except Exception:
            m["db_jummah"] = []
    return masjids


# ---------------------------------------------------------------- website side


def fetch_page_texts(urls):
    """Render each URL in a real headless browser and return visible text."""
    from playwright.sync_api import sync_playwright

    texts = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 2000})
        page.set_default_timeout(PAGE_TIMEOUT_MS)
        for url in urls:
            try:
                page.goto(url, wait_until="domcontentloaded")
                # let client-side JS (awqat JS_ANNONCE, masjidbox, widgets) render
                try:
                    page.wait_for_load_state("networkidle", timeout=15000)
                except Exception:
                    pass
                page.wait_for_timeout(3000)
                body = page.inner_text("body")
                # Many masjids embed their times in a third-party widget iframe
                # (AthanPlus, themasjidapp, masjidal). A visitor sees that content
                # inline, so include each child frame's visible text too — otherwise
                # the page looks empty and gets a false "no times" verdict.
                for frame in page.frames:
                    if frame is page.main_frame:
                        continue
                    try:
                        frame.wait_for_load_state("networkidle", timeout=5000)
                    except Exception:
                        pass
                    try:
                        ftext = frame.inner_text("body").strip()
                    except Exception:
                        ftext = ""
                    if ftext:
                        body += f"\n\n[embedded widget: {frame.url}]\n{ftext}"
                texts[url] = re.sub(r"\n{3,}", "\n\n", body)[:MAX_PAGE_CHARS]
                log(f"  fetched {url} ({len(texts[url])} chars)")
            except Exception as e:
                texts[url] = None
                log(f"  UNREADABLE {url}: {type(e).__name__}: {e}")
        browser.close()
    return texts


EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "readable": {
            "type": "boolean",
            "description": "true only if today's daily prayer times are visible on the page",
        },
        "prayers": {
            "type": "object",
            "properties": {
                p: {
                    "type": "object",
                    "properties": {
                        "adhan": {"type": ["string", "null"]},
                        "iqama": {"type": ["string", "null"]},
                    },
                    "required": ["adhan", "iqama"],
                    "additionalProperties": False,
                }
                for p in PRAYERS
            },
            "required": PRAYERS,
            "additionalProperties": False,
        },
        "jummah": {"type": "array", "items": {"type": "string"}},
        "notes": {"type": "string"},
    },
    "required": ["readable", "prayers", "jummah", "notes"],
    "additionalProperties": False,
}


def extract_times(client, masjid_name, page_text):
    """Ask Claude to read the page like a visitor and report the times shown."""
    prompt = f"""You are reading the visible text of a mosque website, exactly as a visitor sees it.

Mosque: {masjid_name}
Today's date: {TODAY_HUMAN} ({TODAY})

Report the prayer times the page shows FOR TODAY.
- "adhan" is the prayer start time (may be labelled adhan/azan/begins/start/starts).
- "iqama" is the congregation time (may be labelled iqama/iqamah/jamaah/jamaat/congregation/prayer).
- If the page shows only one time per prayer, put it in "adhan" and leave "iqama" null.
- "jummah" is the Friday prayer (khutbah/jumu'ah/jumaah). ALWAYS report it when the page displays
  a jummah time, even if today is not Friday — it is a recurring weekly time. Report the IQAMAH
  (congregation) time for each session, following these rules IN ORDER:
    (a) A session is a labelled pair ONLY when the word IQAMAH/IQAMA/JAMA'AH/CONGREGATION actually
        appears next to the second time (common on masjidbox: "JUMUAH 12:27 IQAMAH 12:37", or
        "JUMUAH 12:25 IQAMAH 2:00"). In that case report ONLY the labelled IQAMAH value, no matter
        how far apart the two times are, and do NOT report the adhan/JUMU'AH time. Two times merely
        joined by "&", ",", "and", or "/" are NOT a labelled pair — see (b).
    (b) A masjid may run several separate SESSIONS at different times, written as a list with no
        iqamah label (e.g. "12:15PM, 1:15PM & 2:15PM" is three sessions; "1:30PM & 2:10PM" is two
        sessions). Report EVERY such time as its own entry, preserving all of them.
    (c) Only when two UNLABELLED times sit within ~15 minutes of each other (e.g. "12:26 / 12:30")
        treat them as an adhan+iqamah pair and report only the later one.
  If the page only states a rule (e.g. "10 minutes after dhuhr") with no clock time, leave jummah
  empty.
- Copy times as displayed (e.g. "5:15", "5:15 PM", "17:15"). Do not compute or guess times.
- Some pages split a time across lines: "6" then "01" means 6:01. Rejoin them as h:mm.
- Daily prayer times must be for TODAY: if the page's daily times are dated a different day, is an
  error page, or shows no times at all, set readable=false and say why in notes. A page showing
  only jummah (no daily times) is still readable=true with the daily prayers null.

PAGE TEXT:
{page_text}"""

    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        output_config={"format": {"type": "json_schema", "schema": EXTRACTION_SCHEMA}},
        messages=[{"role": "user", "content": prompt}],
    )
    return json.loads(response.content[0].text)


# ---------------------------------------------------------------- comparison


def norm_time(s):
    """'5:15 PM' / '17:15' / '5.15' -> (5, 15) on a 12h clock, else None."""
    if not s:
        return None
    m = re.search(r"(\d{1,2})[:.](\d{2})", str(s))
    if not m:
        return None
    return (int(m.group(1)) % 12, int(m.group(2)))


def compare_masjid(db_times, db_jummah, site):
    """Return (status, rows). Compare only fields both sides actually have."""
    rows, mismatches = [], 0
    for p in PRAYERS:
        db_p = (db_times or {}).get(p, {}) or {}
        site_p = site["prayers"].get(p, {}) if site else {}
        for kind, db_key in (("adhan", "adhan12"), ("iqama", "iqama12")):
            db_val = db_p.get(db_key) or ""
            site_val = (site_p or {}).get(kind) or ""
            a, b = norm_time(db_val), norm_time(site_val)
            if a is None or b is None:
                continue  # one side doesn't publish this field — nothing to verify
            ok = a == b
            if not ok and kind == "adhan":
                # tolerate 1-minute rounding on calculated adhan times
                diff = abs((a[0] * 60 + a[1]) - (b[0] * 60 + b[1]))
                ok = diff <= 1 or diff >= 719  # handles 11:59<->12:00 wrap
            if not ok:
                mismatches += 1
            rows.append((f"{p.capitalize()} {kind}", db_val, site_val, ok))

    db_j = sorted({norm_time(s.get("time12") or s.get("time")) for s in db_jummah} - {None})
    site_j = sorted({norm_time(t) for t in (site or {}).get("jummah", [])} - {None})
    if db_j and site_j and db_j != site_j:
        mismatches += 1
        rows.append((
            "Jummah",
            ", ".join(s.get("time12", s.get("time", "")) for s in db_jummah),
            ", ".join((site or {}).get("jummah", [])),
            False,
        ))

    if not rows:
        return "UNREADABLE", rows
    return ("MISMATCH" if mismatches else "MATCH"), rows


# ---------------------------------------------------------------- report


def build_html(results):
    counts = {"MATCH": 0, "MISMATCH": 0, "UNREADABLE": 0}
    for r in results:
        counts[r["status"]] += 1

    badge = {"MATCH": "✅", "MISMATCH": "⚠️", "UNREADABLE": "❓"}
    order = {"MISMATCH": 0, "UNREADABLE": 1, "MATCH": 2}
    results = sorted(results, key=lambda r: (order[r["status"]], r["name"]))

    sections = []
    for r in results:
        header = (
            f'<h3 style="margin:18px 0 4px">{badge[r["status"]]} {r["name"]} '
            f'<span style="font-weight:normal;color:#666">— {r["city"]} · '
            f'<a href="{r["url"]}">{r["url"]}</a></span></h3>'
        )
        if r["status"] == "UNREADABLE":
            sections.append(header + f'<p style="color:#946200;margin:2px 0">{r["detail"]}</p>')
            continue
        if r["status"] == "MATCH":
            n = sum(1 for _ in r["rows"])
            sections.append(header + f'<p style="color:#3c763d;margin:2px 0">{n} time fields verified against the website.</p>')
            continue
        body = "".join(
            f'<tr style="background:{"#fdecea" if not ok else "#fff"}">'
            f"<td>{label}</td><td>{db}</td><td>{site}</td>"
            f'<td>{"❌ MISMATCH" if not ok else "✓"}</td></tr>'
            for label, db, site, ok in r["rows"]
        )
        sections.append(
            header
            + '<table cellpadding="6" style="border-collapse:collapse;border:1px solid #ddd;font-size:14px">'
            + "<tr style='background:#f5f5f5'><th>Field</th><th>App / DB</th><th>Website shows</th><th></th></tr>"
            + body
            + "</table>"
        )

    summary = f'✅ {counts["MATCH"]} match &nbsp; ⚠️ {counts["MISMATCH"]} mismatch &nbsp; ❓ {counts["UNREADABLE"]} unreadable'
    html = f"""<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:800px">
<h2>Prayer Times Verification — {TODAY_HUMAN}</h2>
<p style="font-size:16px">{summary}</p>
<p style="color:#666;font-size:13px">Websites were read independently (headless browser + AI reading the page like a visitor)
and compared against what the app is serving. Mismatches mean the scraper likely needs a fix.
Unreadable means the site was down or showed no times — those masjids were NOT verified today.</p>
{"".join(sections)}
</div>"""
    subject = f"Prayer Times Verification {TODAY}: ✅{counts['MATCH']} ⚠️{counts['MISMATCH']} ❓{counts['UNREADABLE']}"
    return subject, html, counts


def send_email(subject, html):
    if not GMAIL_APP_PASSWORD:
        log("GMAIL_APP_PASSWORD not set — skipping email (report saved locally).")
        return False
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = GMAIL_USER
    msg["To"] = REPORT_TO
    msg.attach(MIMEText(html, "html"))
    # The 7am launchd run is unattended; a transient DNS/SMTP blip shouldn't lose
    # the email. Retry a few times with backoff before giving up. The report is
    # already saved to disk regardless, so a failure here is non-fatal.
    last_err = None
    for attempt in range(1, 4):
        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30,
                                  context=ssl.create_default_context()) as s:
                s.login(GMAIL_USER, GMAIL_APP_PASSWORD)
                s.sendmail(GMAIL_USER, [REPORT_TO], msg.as_string())
            log(f"Report emailed to {REPORT_TO}")
            return True
        except Exception as e:
            last_err = e
            log(f"  email attempt {attempt}/3 failed: {type(e).__name__}: {e}")
            if attempt < 3:
                time.sleep(10 * attempt)
    log(f"Email failed after 3 attempts ({last_err}). Report saved at reports/{TODAY}.html")
    return False


# ---------------------------------------------------------------- main


def main():
    # --only may be repeated; a masjid matches if any substring is in its name
    only = [
        sys.argv[i + 1].lower()
        for i, a in enumerate(sys.argv)
        if a == "--only" and i + 1 < len(sys.argv)
    ]
    no_email = "--no-email" in sys.argv
    push = "--push" in sys.argv

    from anthropic import Anthropic

    client = Anthropic()  # ANTHROPIC_API_KEY from .env/environment

    if not wake_api():
        subject = f"Prayer Times Verification {TODAY}: API UNREACHABLE"
        html = "<p>The backend API did not respond to /health after 3 attempts. No verification was run.</p>"
        send_email(subject, html)
        sys.exit(2)

    log("Fetching DB state from API...")
    masjids = fetch_db_state()
    if only:
        masjids = [m for m in masjids if any(o in m["name"].lower() for o in only)]
    log(f"{len(masjids)} masjids to verify")

    def verify_masjid(m, text):
        """Extract + compare one masjid. Returns a result dict. When --push and
        the masjid is AI-sourced, write the read times to the DB first so the
        app serves exactly what the reader saw."""
        name, url = m["name"], m.get("url", "")
        base = {"name": name, "city": m.get("city", ""), "url": url, "rows": []}
        if not text or len(text.strip()) < 40:
            return {**base, "status": "UNREADABLE", "detail": "Website did not load or rendered no content."}
        try:
            site = extract_times(client, name, text)
        except Exception as e:
            return {**base, "status": "UNREADABLE", "detail": f"AI extraction failed: {e}"}
        if not site.get("readable"):
            return {**base, "status": "UNREADABLE", "detail": f"No times visible to a visitor. {site.get('notes', '')}"}

        if push and is_ai_sourced(url):
            try:
                push_times(m["id"], site)
                log(f"  pushed AI-sourced times to DB: {name}")
                # Re-fetch so the comparison reflects what we just wrote.
                m["db_times"] = api_get(f"/api/v1/prayer-times/{m['id']}")
            except Exception as e:
                log(f"  push FAILED for {name}: {e}")

        status, rows = compare_masjid(m.get("db_times"), m.get("db_jummah", []), site)
        detail = site.get("notes", "") or "Times visible but nothing comparable was extracted."
        return {**base, "status": status, "detail": detail, "rows": rows}

    urls = list({m["url"] for m in masjids if m.get("url")})
    log(f"Rendering {len(urls)} unique websites...")
    page_texts = fetch_page_texts(urls)

    results = []
    for m in masjids:
        r = verify_masjid(m, page_texts.get(m.get("url", "")))
        results.append(r)
        log(f"  {r['status']}: {r['name']}")

    # one retry pass: transient page/extraction failures are common enough to matter
    retry = [i for i, r in enumerate(results) if r["status"] == "UNREADABLE"]
    if retry:
        log(f"Retrying {len(retry)} unreadable masjids...")
        retry_urls = list({results[i]["url"] for i in retry if results[i]["url"]})
        retry_texts = fetch_page_texts(retry_urls)
        for i in retry:
            m = masjids[i]
            r = verify_masjid(m, retry_texts.get(m.get("url", "")))
            if r["status"] != "UNREADABLE":
                results[i] = r
                log(f"  retry recovered {r['status']}: {r['name']}")

    subject, html, counts = build_html(results)

    REPORTS_DIR.mkdir(exist_ok=True)
    report_path = REPORTS_DIR / f"{TODAY}.html"
    report_path.write_text(html)
    log(f"Report written to {report_path}")

    if no_email:
        log("(--no-email: skipping email)")
    else:
        send_email(subject, html)
    log(f"Done: {counts}")
    sys.exit(1 if counts["MISMATCH"] else 0)


if __name__ == "__main__":
    main()
