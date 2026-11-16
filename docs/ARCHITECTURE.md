# Architecture Decision — local-first cryptogram game

Decision: **modular monolith**, Node.js LTS + Express + PostgreSQL.

Stage 01 only protects the old repository from public unsafe operations, connects to local database and enables authenticated development admin operations. It is intentionally **not a playable game server**.

Future modules (each in its own branch/PR): `auth`, `players`, `content`, `puzzles`, `cases`, `economy`, `admin`, `media`. Modules should split HTTP routes from services and database repositories. The server authoritatively owns rewards and solutions; never trust submitted reward/coins from the mobile app.

## Correct cryptogram UX (fixed requirement)

- Each unique letter maps to one randomized number **within one saved attempt**. Same number represents the same correct letter.
- User **manually enters each cell**. Entering the letter in one cell **must not autofill** any other cell, even if the numbers match.
- Repeated numbers can be highlighted and guessed mappings saved in a separate notepad, but not automatically populated.
- Guesses can be corrected and erased. Never mark single tentative inputs correct/incorrect instantly unless player explicitly requests a check.
- Original quote and author are not returned by public API before completion.
- After cryptogram completion there is a separate optional `Who said it?` stage, then attribution and an original-source link.
- `Case 404` special event: connected cryptograms/clues leading to a reveal; initial v1 can have one curated case, not 30 invented cases.

## Release discipline

1. `fix/01-security-local-bootstrap` — remove hardcoded secret; protect admin; disable unsafe legacy routes; local-only DB.
2. `chore/02-db-migrations` — migration scripts, stable schema, seed/backup.
3. `feat/03-guest-auth` — secure guest session, roles, token refresh.
4. `feat/04-content-puzzles` — categories, curated levels, valid cryptogram generator, manual cell state.
5. `feat/05-economy-admin` — server-authoritative coins, hints, purchases and local QA actions.
6. `feat/06-cases-and-media` — Case 404, attribution, verified media source links.
7. `test/07-integration-and-release` — integration tests, README, OpenAPI.

Protect `main`; create a fresh branch from updated `main` for each feature, test, create PR, then merge. No real secrets or copied external media in the repository. Rotate the credential previously exposed in `db.js`: replacing the file does not invalidate the leaked credential or remove it from Git history.
