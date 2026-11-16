# Stage 03 — Guest authentication (LOCAL ONLY)

This is a **local development** API, not a production-ready internet deployment. The existing app binds to `127.0.0.1`. Do not expose it over the internet or place behind a public proxy without TLS, a proper shared rate limiter, monitoring, credentials rotation and threat review.

## Endpoints

| Method | Endpoint | Input | Success |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/guest` | `{}` | 201: `player`, `accessToken`, `refreshToken`, `expiresIn`, `refreshExpiresIn`, `tokenType` |
| GET | `/api/v1/auth/me` | `Authorization: Bearer <accessToken>` | 200: `{player}` |
| POST | `/api/v1/auth/refresh` | `{ "refreshToken": "..." }` | 200: newly rotated access **and refresh** tokens |
| POST | `/api/v1/auth/logout` | `Authorization: Bearer <accessToken>` | 204, revokes session |

Guest creation accepts **no** client-specified ID or balance. Sessions hold only SHA-256 hashes of generated, 256-bit opaque tokens. A refresh atomically invalidates the previous access and refresh tokens; the second use of an old refresh token returns 401. Access lasts 15 minutes; refresh lasts 30 days and rotates on each successful refresh. Logout invalidates both tokens of that session. Authentication never trusts a client-provided `playerId`.

Response example (token placeholders **not** real tokens):

```json
{
  "tokenType": "Bearer",
  "accessToken": "<opaque_access_token>",
  "refreshToken": "<opaque_refresh_token>",
  "expiresIn": 900,
  "refreshExpiresIn": 2592000,
  "player": {"id":"<uuid>","coins":30,"lives":5,"hints":2,"isGuest":true,"createdAt":"<date>"}
}
```

## Client expectations

- Store tokens in OS secure storage (Android Keystore-backed or platform equivalent). Never log tokens or put them in analytics, URLs, screenshots or Git.
- Save the **new** refresh token when refreshing; the previous refresh token stops working immediately.
- Guest-only accounts have **no recovery mechanism** if their refresh token is lost or the app is uninstalled; account linking will be a later feature.
- A new guest is created on first launch only. Subsequent launches should use the saved refresh token.
- Never use the admin API from the mobile client. Game APIs will independently authorize ownership in future stages.

## Running

1. Run `npm run db:migrate` after applying patch 03; use `npm run db:status` to verify migration 002.
2. `npm test` runs pure unit tests. `npm run auth:smoke` starts its own temporary local HTTP server, exercises guest/me/refresh/logout + negative tests, and removes only the newly created test player afterward. Stop other local testing only if it conflicts with resources; the smoke server picks a free port.
3. `npm audit` should remain clean. The legacy game routes stay off (503).

HTTP responses intentionally never include original quote solutions. The 42 draft quotes have **not** been imported to the DB. Protect server access token hashes as sensitive authentication material even though they cannot be directly used as bearer credentials.
