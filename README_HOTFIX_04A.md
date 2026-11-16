# Hotfix 04A — migration checksums on Windows

The stage 04 import can fail with `Migration 002_guest_sessions.sql has changed since applying` after Windows checkout turns LF into CRLF. This hotfix allows line-ending-only variation (without changing database history), but **still rejects real SQL content edits**. It also enforces LF on migration files through `.gitattributes`.

## First: repair the Git branch safely

The stage 04 working files were applied while still on `feat/03-guest-auth`, then `feat/04-content-cryptogram` was created off the old history. Do not force-pull, delete your DB, or reset your data.

Run these from `D:\Bloger\BlogerGrameGame-backend` while currently on `feat/04-content-cryptogram`:

```powershell
git branch --show-current
git stash push -u -m "wip-stage04-before-rebase"
git fetch origin main
git branch -m feat/04-content-cryptogram feat/04-content-cryptogram-old-base
git switch -c feat/04-content-cryptogram origin/main
git stash apply "stash@{0}"
git status --short
```

The old branch and original stash are retained until successful verification. If any command reports a merge conflict, stop; do not use `--force`, `reset --hard`, or `stash drop`.

## Then apply this overlay

Unzip **contents** of `CipherArchive_Backend_Hotfix_04A.zip` at the backend project root (replacing `scripts/db-migrate.js` only). Do not replace `.env` and do not delete Docker volumes.

```powershell
npm test
npm run db:migrate
npm run db:migrate
npm run content:import-drafts
npm run content:import-drafts
npm run game:smoke
npm run auth:smoke
npm run db:status
npm audit
```

Expected: 001 and 002 are skipped, 003 is applied once, no duplicate quotes on the second import. For `npm test`, stage04 + this hotfix should report 34 tests (30 from stage04 + 4 here).

If 002 still fails, it is not just LF/CRLF; compare actual content of 002 with Git main and check stored checksum. Do not change stored checksums or edit an already-applied migration to force success.

To commit after all checks:

```powershell
git add -A
git diff --cached --check
git diff --cached --name-only
git commit -m "feat(game): add cryptogram engine and draft catalog"
git push -u origin feat/04-content-cryptogram
```
