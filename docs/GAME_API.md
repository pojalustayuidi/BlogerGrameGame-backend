# Local cryptogram API — stage 04

**Not production-ready**: all runtime environments remain localhost-only by design.

## Environment

Public gameplay only returns published levels and published quotes. Our 42 candidates are unverified editorial drafts; to play them locally, explicitly set `LOCAL_DRAFT_PREVIEW=1` in your untracked `.env`, restart the local server, then authenticate with a *guest token*. Never put `ADMIN_API_KEY` in Flutter.

`LOCAL_DRAFT_PREVIEW` is ignored unless `APP_ENV=local`. The server already refuses non-loopback HOST and PGHOST via the stage-01 safety config. To stop preview, set `LOCAL_DRAFT_PREVIEW=0` and restart. This does not publish anything; it only makes draft levels playable by authenticated local guests while enabled.

## Route summary

All routes require the stage-03 access token as HTTP header `Authorization: Bearer <accessToken>`.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/v1/game/categories` | — | Categories and eligible level counts |
| GET | `/api/v1/game/levels?category=streamers` | — | Level IDs, number, difficulty, progress (no quotes/creators) |
| POST | `/api/v1/game/levels/:levelId/attempts` | `{}` | New or resumed attempt (201/200) |
| GET | `/api/v1/game/attempts/:attemptId` | — | Stable layout with cipher numbers, entered and given letters, notes |
| PATCH | `/api/v1/game/attempts/:attemptId/cells/:position` | `{"letter":"А"}` or `{"letter":null}` | Updates **only that one cell**, even if its cipher number repeats elsewhere |
| PUT | `/api/v1/game/attempts/:attemptId/notes/:number` | `{"letter":"К","comment":"похоже на К"}` | Updates only a scratchpad note; never fills any cells |
| POST | `/api/v1/game/attempts/:attemptId/check` | `{}` | Complete phrase check, or `PUZZLE_INCOMPLETE`; wrong checks have 4-second cooldown |
| POST | `/api/v1/game/attempts/:attemptId/bonus` | `{"guessedCreatorId":"uuid"}` or `{ "guessedCreatorId":null }` | One-time bonus answer or skip, then reveal correct quote/author/source metadata |

## Format of a layout item

`{"position":0,"type":"letter","number":17,"given":null,"letter":null}`

`{"position":3,"type":"separator","value":" "}`

- **Position** is a zero-based index in the original quote string, counting Unicode codepoints.
- **Number** is a random integer 1..33 assigned consistently to the corresponding Russian letter within one attempt.
- **Given** is the initial hint for a particular cell only, not for all equal-numbered cells.
- **Letter** is the player's own manual entry for that cell only; sending `null` erases it.
- **Scratchpad** stores hypothesized number→letter associations independently.
- **The cipher map, true phrase and creator do not appear in unsolved responses.** The name is made available only in bonus choices after solving; the full attribution is revealed after answering/skipping the bonus.

## Draft content

`npm run content:import-drafts` imports the bundled 42 candidate quotes into `creators`, `media_sources`, `quotes` and `levels` with status `draft` and `is_published=false`. Repeated runs are safe (keys `draft-v5:*`), and players/coins/progress are untouched. `media_sources` only contains source *links*, with `verification_status='unverified'` and `rights_status='unknown'`.

**Not a publication workflow**. Before actual public release, all text, attribution, licenses and embedded source media must be manually reviewed. No video is downloaded or redistributed in this patch.

## Validation and rewards

- The server validates bearer token and attempt ownership for every operation.
- Given cells cannot be changed, solved attempts cannot be edited.
- Only whole-phrase checks count mistakes; no per-keystroke correctness feedback.
- Incorrect checks have a short cooldown; GET/notes/edits remain available.
- Successful levels create `level_progress`, but **award 0 coins** at this stage; production economy will be server-authoritative in stage 05.
- Bonus cannot be attempted before solving, is accepted only once, and also awards 0 coins for now.
- Legacy API routes (`/levels`, `/player`, `/shop` etc.) remain intentionally disabled.
