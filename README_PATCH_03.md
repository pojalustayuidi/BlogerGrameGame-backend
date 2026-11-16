# CipherArchive Backend — Patch 03: Guest Auth

**Overlay for** `pojalustayuidi/BlogerGrameGame-backend` **after PR #2 merged**.

## Before applying on Windows (PowerShell)

```powershell
cd D:\Bloger\BlogerGrameGame-backend
git switch main
git pull origin main
git switch -c feat/03-guest-auth
```

If branch already exists, use `git switch feat/03-guest-auth` rather than `switch -c`. Confirm working tree is clean **before** extracting. Extract this ZIP into the repository root with replacement of same-name files. The package-lock and existing `.env` are intentionally untouched.

## Run

```powershell
docker compose up -d
powershell -ExecutionPolicy Bypass -File .\scripts\backup-local.ps1
npm ci
npm run db:migrate
npm run db:migrate
npm test
npm run auth:smoke
npm run db:status
npm audit
```

Expected first migrate `[applied] 002_guest_sessions.sql`; second `[skip]`. If `002` was previously applied, both will skip (normal). `auth:smoke` makes one guest and removes it after testing. It also checks that the old access and refresh credentials no longer work after rotation and logout. No actual quotes are inserted or published.

## Git

```powershell
git add -A
git diff --cached --check
git commit -m "feat(auth): add local guest sessions and token rotation"
git push -u origin feat/03-guest-auth
```

Create a PR to `main`; wait for GitHub Actions tests. Read `docs/GUEST_AUTH.md` for API and security limitations. Do not put any tokens or old database credentials in screenshots or chat logs.
