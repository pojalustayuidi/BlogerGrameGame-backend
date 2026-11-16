# Patch 02 — database foundation (overlay)

Target repository: `https://github.com/pojalustayuidi/BlogerGrameGame-backend`.
Requires **PR #1 merged into `main`** (confirmed 2026-11-16), Windows, Node.js 20+, Docker Desktop and the local `.env` from stage 01.

## Installation — existing local project

1. Update `main` and create the new branch **before** copying any patch files:

```powershell
cd D:\Bloger\BlogerGrameGame-backend
git switch main
git pull origin main
git switch -c chore/02-db-migrations
```

2. Extract the **contents** of this ZIP into the existing backend root and overwrite only same-named files. The ZIP has correct project-relative paths. Do not delete the repository or `.env`.
3. Start Docker Desktop and run:

```powershell
docker compose up -d
powershell -ExecutionPolicy Bypass -File .\scripts\backup-local.ps1
npm run db:migrate
npm run db:migrate
npm run db:seed
npm run db:smoke
npm run db:status
npm test
npm audit --omit=dev
```

Expected: first migrate `[applied]`, second `[skip]`; 3 categories; integration smoke `PASS` several times, and no changes to existing stage-01 player. `backups/` stays local and ignored by Git. Do not delete Docker volumes.

4. Commit and push after verifying output:

```powershell
git status --short
git add -A
git diff --cached --check
git diff --cached --name-only
git commit -m "chore(db): add versioned game schema and migration tests"
git push -u origin chore/02-db-migrations
```

Create a pull request from `chore/02-db-migrations` into `main`; GitHub Actions should run tests with PostgreSQL 17.

## Current scope

This patch creates tables/migrations, curated **empty** content schema, 3 category records, smoke tests, backup script and CI. **No API endpoint is activated.** Old unsafe endpoints still intentionally respond 503. Stage 03 adds authentication and player sessions; stage 04 adds cryptogram generator, manual cell saves, and checking.

Read `docs/DATABASE.md` for the full database model and invariants. **Do not store secrets or real external videos in git**.
