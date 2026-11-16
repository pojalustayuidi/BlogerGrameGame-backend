# Stage 02 — database model

Architecture: modular monolith, PostgreSQL 17. These tables are **data foundation** only; the old unsafe endpoints remain disabled until authenticated services are written.

## Modules/tables

| Module | Tables | Responsibility |
| --- | --- | --- |
| players | `players` (from stage 01) | Local player identity and test balances |
| catalog | `categories`, `creators`, `creator_categories` | Three themes; creators can belong to several themes |
| content | `media_sources`, `quotes`, `levels` | Manually curated, verified quotes with source URL and timeline; separate publishing state |
| puzzle | `puzzle_attempts`, `puzzle_cells`, `puzzle_notes`, `level_progress` | Stable encrypted mapping, **individual** cell drafts, hints as personal notes, completions |
| bonus | `bonus_answers` | Separate optional "Who said it?" stage |
| Case 404 | `cases`, `case_steps`, `case_progress` | Sequence of levels plus investigation progress |
| internal | `schema_migrations`, `admin_grants` | Migration history; stage 01 testing grants |

## Cryptogram invariant

A quote is stored as plain text on the server, but **must never be sent to anonymous clients** before completion. A single attempt has one stable cipher mapping (`cipher_map` JSONB). The next gameplay branch will validate that each distinct letter maps to a distinct number.

`puzzle_cells` has a primary key `(attempt_id, cell_position)`; it does **not** have a uniqueness constraint on `cipher_number`. Multiple positions may have the number 8, but editing one cell never updates the other. `given_letter` represents an initial clue; `entered_letter` is a separate, editable player draft field. `puzzle_notes` stores hypotheses like "8 = С?" without filling any cells. Until explicit check, the server must not reveal whether draft letters are right or wrong.

Use zero-based *Unicode code-point position* when generating letter cells, and send punctuation/spacing as public layout metadata from the gameplay service. This is a future feature; the current migration does not generate puzzles. Attempt numbers/mappings are generated once at attempt creation, never rerandomized when reopening.

## Safety and content policy

- `quotes.status='draft'` is default. Only verified/curated content should become published. Database constraint requires a source for published quotes; service must additionally verify source ownership and status.
- `media_sources` records a real `https://` link, timestamp, verification/rights states. The schema **does not authorize downloading, hosting or embedding external videos**.
- No real/invented quote is seeded by default. `npm run db:seed` creates only categories.
- Only admin reads quote text and creator before the bonus stage; public API must return cipher cells only. Auth and access enforcement come in later branches.
- `case_steps` references existing levels; a case does not replace the cryptogram engine.

## Commands, Windows PowerShell

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup-local.ps1
npm run db:migrate
npm run db:migrate
npm run db:seed
npm run db:smoke
npm run db:status
npm test
```

The migrator: discovers ordered SQL files, checks SHA-256 hashes, serializes concurrent runs via a PostgreSQL advisory transaction lock, and applies each migration in its own transaction. Repeated runs skip; modified applied migrations fail intentionally. Future changes must go in `002_*.sql`, not edits to `001_game_foundation.sql`.

**Never use** `docker compose down -v` when keeping existing database contents. Existing stage-01 `players` and `admin_grants` are retained. The integration smoke test creates temporary rows then always rolls back.

## What is not in stage 02

No guest sessions/tokens yet; no public endpoints for puzzles, unlocking, editing cells, or bonuses; no video hosting; no real author/quote library yet. These are separate Git branches.
