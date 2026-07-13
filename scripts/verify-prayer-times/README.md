# Daily Prayer Times Verification

Independent outside-in check of scraper accuracy. Every morning it:

1. Renders each masjid's website in a headless browser (JS included — sees what a visitor sees)
2. Has Claude read the page like a human and extract the displayed times
3. Compares against what the API/DB is serving the app
4. Emails a report: ✅ match / ⚠️ mismatch (fix the scraper) / ❓ unreadable (verification gap)

Crucially it shares **no parsing logic** with `backend/internal/scraper` — so a scraper
bug shows up as a mismatch instead of agreeing with itself (the flaw in the old
`scripts/prayer-times-report.py`, which compared the scraper against the scraper).

## One-time setup

```bash
cd scripts/verify-prayer-times
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/playwright install chromium
cp .env.example .env   # then fill in ANTHROPIC_API_KEY and GMAIL_APP_PASSWORD
```

Gmail app password: https://myaccount.google.com/apppasswords (needs 2FA on the account).

## Run manually

```bash
.venv/bin/python verify.py                 # full run, all masjids
.venv/bin/python verify.py --only sunshine # test a single masjid by name substring
```

Exit code 0 = all match, 1 = mismatches found, 2 = API unreachable.
Reports are also saved to `reports/YYYY-MM-DD.html`.

## Schedule daily at 7:00 AM

```bash
cp au.altaqwa.prayer-times-verify.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/au.altaqwa.prayer-times-verify.plist
# replaces the old report job:
launchctl unload ~/Library/LaunchAgents/au.altaqwa.prayer-times-report.plist
```

launchd runs it when the Mac is awake; if asleep at 7:00 it runs on wake.

## Cost

~40 pages/day through Claude Haiku ≈ 1–2 cents/day. Override with
`ANTHROPIC_MODEL` in `.env` if you want a stronger reader.

## When the report flags something

- **⚠️ Mismatch** — the masjid's website changed or the scraper mis-parses it.
  Fix the per-masjid parser in `backend/internal/scraper/` (see the `go-api` skill).
- **❓ Unreadable** — the site was down, JS-broken, or shows no times. Those masjids
  were *not verified* that day; recurring unreadables deserve investigation
  (dead URL in DB, site redesign).
