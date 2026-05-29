# Prayer Times App — Claude Instructions

## Git Workflow (MANDATORY)

**Never work directly on `master`. Always use feature/fix branches and PRs.**

### Before touching any code:
1. `git checkout master && git pull`
2. `git checkout -b <type>/<description>`
   - `fix/` for bug fixes (e.g. `fix/notification-race-condition`)
   - `feat/` for new features (e.g. `feat/find-masjid-screen`)
   - `chore/` for config, deps, version bumps

### When done:
3. `git add <specific files>` — never `git add .`
4. `git commit -m "type(scope): description"`
5. `git push -u origin <branch>`
6. `gh pr create` with a summary and test plan
7. Merge the PR before building

### Builds:
- Only build from `master` after a PR is merged
- Version lives in `mobile/app.config.js` (not `app.json` — it's overridden)
- Bump version in `app.config.js` on every build
- Submit with `eas submit --platform ios --latest --non-interactive`

### One PR per logical change:
- Don't mix notification fixes with UI changes
- Don't mix backend changes with mobile changes
- Keep PRs small and focused

## Project Structure

- `mobile/` — React Native / Expo app
- `backend/` — Go API server
- `mobile/src/services/notifications.ts` — notification scheduling
- `mobile/src/services/backgroundTasks.ts` — 12:30 AM daily refresh
- `mobile/src/screens/PrayerTimesScreen.tsx` — main prayer times UI
- `mobile/app.config.js` — **authoritative version source** (not app.json)
- `mobile/eas.json` — EAS build config (`appVersionSource: local`)

## Key Rules

- Prayer time accuracy is stable — don't touch `backend/internal/scraper/scraper.go` without a specific reason
- Always check `mobile/app.config.js` for the current version before bumping
- `daily_refresh` notifications must stay silent (no banner, no sound) — see `setNotificationHandler` in `notifications.ts`
- The `isSchedulingNotificationsRef` mutex in `PrayerTimesScreen` must not be removed
