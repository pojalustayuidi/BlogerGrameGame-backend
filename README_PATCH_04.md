# Patch 04 — Cryptogram engine and 42 draft candidates

Overlay patch for the current `main` of `pojalustayuidi/BlogerGrameGame-backend` **after PR #3 was merged**. No source changes to already-applied migrations 001 / 002.

## Apply on Windows (PowerShell)

1. Finish/merge PR #3; make sure the working tree is clean.
2. `git switch main` then `git pull --ff-only origin main` and `git switch -c feat/04-content-cryptogram`. If the branch already exists, switch to it instead; do not force checkout.
3. Extract **the contents of the ZIP** into the repository root, replacing same-name files. The ZIP has paths relative to repo root. Never touch `.env`, your backups or Docker volumes.
4. Run:

```powershell
	docker compose up -d
	powershell -ExecutionPolicy Bypass -File .\scripts\backup-local.ps1
	npm ci
	npm run db:migrate
	npm run db:migrate
	npm run db:seed
	npm run content:import-drafts
	npm run content:import-drafts
	npm test
	npm run game:smoke
	npm run auth:smoke
	npm run db:status
	npm audit
```

`db:migrate` should apply `003_content_playtest.sql` once and skip it the second time. `content:import-drafts` should report 22 streamers, 8 bloggers and 12 tiktokers, on either run. `game:smoke` starts its own temporary localhost backend, plays through a level, checks independence of matching-number cells, intentionally checks a wrong solution, completes the puzzle, answers the bonus and removes **only** its temporary guest/player progress. It does **not** delete existing players or the imported draft catalog.

## Optional local manual API playtest

- Set `LOCAL_DRAFT_PREVIEW=1` in `.env` (not the tracked `.env.example`) and restart `npm run dev`. With the flag off, draft levels will not appear in the standard API.
- Call `POST http://127.0.0.1:8085/api/v1/auth/guest` with JSON `{}`. Keep `accessToken` locally; **do not commit or share tokens**.
- Call `GET http://127.0.0.1:8085/api/v1/game/levels?category=streamers` with `Authorization: Bearer <token>`; then `POST /api/v1/game/levels/<id>/attempts` with `{}`.
- See `docs/GAME_API.md` for endpoints. **Never put a local admin key into the Flutter app.**

## Commit / PR

```powershell
  git status --short
  git add -A
  git diff --cached --check
  git diff --cached --name-only
  git commit -m "feat(game): add cryptogram engine and local draft catalog"
  git push -u origin feat/04-content-cryptogram
```

PR target `main`. GitHub Actions tests migration 003, repeat import, 42 draft quotes and the full HTTP+PostgreSQL smoke playthrough. This is still a local-only development backend, not deployable to the internet.

## Scope intentionally deferred

- Monetized coins, lives, shop, paid hints, idempotent rewards (stage 05).
- Connecting and polishing Flutter UI (stage 06).
- Publishing unverified quotes, redistributing YouTube clips, production deployment (later stages).
