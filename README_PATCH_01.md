# Patch 01 — security and local backend bootstrap

**This is an overlay for the original GitHub repository** `pojalustayuidi/BlogerGrameGame-backend`.
Do NOT download/use the old `BlogerGrame_Backend_Local_v0.1.zip` prototype. It is not needed.

## First run on Windows 11 (PowerShell)

1. Make sure Docker Desktop, Node.js 20+ and Git are installed.
2. Clone the original project and create a feature branch:

```powershell
git clone https://github.com/pojalustayuidi/BlogerGrameGame-backend.git
cd BlogerGrameGame-backend
git switch -c fix/01-security-local-bootstrap
```

3. Extract this ZIP. **Extract the ZIP directly into the root of `BlogerGrameGame-backend`, replacing same-name files.** The ZIP already has the correct project-relative paths. Do not extract into a nested directory.
4. Stop tracking committed third-party dependencies (without deleting local files):

```powershell
git rm -r --cached node_modules
```

5. Run local setup, server and smoke test in a second PowerShell window:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1
npm run dev
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-admin.ps1
```

- Server: `http://127.0.0.1:8085/health` (localhost only).
- PostgreSQL: `127.0.0.1:5433` (Docker volume, not your old cloud database).
- `.env` is ignored by Git; local setup generates an ADMIN_API_KEY.
- **Legacy game endpoints deliberately return 503**. This stage isolates the unsafe endpoints while we implement proper player authentication and migrated schema.
- Smoke test creates a temporary player, grants 500 coins and checks retry is idempotent.

## Commit & PR

```powershell
git status
git add -A
git commit -m "fix(security): isolate legacy API and bootstrap local backend"
git push -u origin fix/01-security-local-bootstrap
```

Then open a PR against `main`. Do not merge until you confirm the smoke test and review the diff. `package-lock.json` is generated/updated during `npm install`, so check it before commit.

## Security note

An old database password was hardcoded in public Git history. Rotate/revoke it independently. Replacing `db.js` and excluding `.env` do not remove historical exposure.

## Do not do yet

- Do not connect Flutter to these disabled legacy routes.
- Do not deploy this stage publicly.
- Do not upload video clips before verifying licensing.
- Do not reset Docker volumes (`docker compose down -v`) if you want to keep local data.
