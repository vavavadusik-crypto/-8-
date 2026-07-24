# Security Audit — Phase 8 (LANE B)

**Date:** 2026-07-24
**Auditor:** Claude Opus 4.8 (orchestration lane)
**Scope:** Read-only audit of higher-risk security surfaces — OAuth CSRF, session/authorization enforcement, token-vault encryption at rest. No code changed.

**Status:** FINDINGS — require owner review before code changes.

> **⚠️ This document REPLACES an earlier version that was hallucinated.**
> The previous audit (committed under the terminal Sonnet lane) reviewed code
> that does **not exist** in the repository: it quoted a plaintext `const tokens = new Map()`
> token vault, a `randomBytes(32)` + `session.oauthState` OAuth design, and helpers
> `ensureSessionSync` / `requireWorkspaceId` / `getScopedWorkspaceId` — none of which
> are present. It concluded "VERIFIED SAFE" on the basis of that fiction and missed the
> real findings below. Every finding and every "verified" claim in this rewrite is
> anchored to a real `file:line` that was read on 2026-07-24. See the note in
> **Refuted prior findings** for the specifics.

---

## Summary

| Area | Files audited | Critical | High | Medium | Low |
|------|---------------|:--------:|:----:|:------:|:---:|
| OAuth CSRF (`state`) | oauth-state.js, connectors/start.js, connectors/callback.js | 0 | 0 | 1 | 0 |
| Session enforcement | session.js, product.js (cookie issue) | 0 | 0 | 1 | 0 |
| Authorization gates | auth.js, authorization.js, accounts.js, product.js | 0 | 0 | 1 | 1 |
| Token-vault encryption at rest | token-vault.js | 0 | 0 | 0 | 1 |

**Total findings:** 5 — **0 critical, 0 high, 3 medium, 2 low.**

---

## Findings

### M1 (MEDIUM) — OAuth `state` is not single-use and not bound to the browser session

- **File:** `api/_lib/oauth-state.js:12-70` (create/verify); consumed at `api/connectors/callback.js:5`.
- **Issue:** `state` is a **stateless HMAC-signed token** (`HMAC-SHA256(base64url(payload), secret)`), carrying `{provider, workspaceId, nonce, iat, exp}`. Verification checks signature, provider match, and expiry — but there is **no server-side nonce store and no consumption step**, so a captured `state` can be **replayed any number of times within its TTL** (clamped 60–3600 s, default 600 s). It is also **not bound to the initiating browser session** (no session-cookie / double-submit binding) — any party holding a validly signed `state` passes `verifyOAuthState`.
- **Failure scenario:** An attacker who observes a victim's `state` (referrer leak, shared proxy log, browser history) can drive the OAuth callback themselves within the TTL, or mount a login-CSRF once token exchange is wired.
- **Mitigating factor:** Token exchange is **not implemented** — `callback.js:28` returns `501 oauth_token_exchange_not_implemented`, so today there is no live sink. Severity is Medium (not High) because the vulnerable step does not yet perform any privileged action.
- **Recommended fix (before enabling token exchange):**
  1. Bind `state` to the browser session (store the nonce in the signed session cookie, or double-submit the nonce and compare on callback).
  2. Enforce single-use: persist issued nonces in a short-TTL store and **consume** on callback (reject a second use).
  3. Keep the existing HMAC + expiry as defense-in-depth.

### M2 (MEDIUM) — Session cookie `Secure` flag is set only on Vercel, not on self-host HTTPS

- **File:** `api/product.js:350-358` (`setSessionCookie` / `clearSessionCookie`).
- **Issue:** `const secure = process.env.VERCEL ? "; Secure" : "";` — the `Secure` attribute is gated **solely** on the `VERCEL` env var. AGPL self-host is the project's primary deployment target (Gate M7) and typically runs behind a reverse proxy terminating TLS. In that mode `VERCEL` is unset, so the `hermest_session` cookie is issued **without `Secure`** and can be transmitted over plaintext HTTP (downgrade, mixed-content, misconfigured proxy) and captured.
- **Failure scenario:** Self-host operator serves the app over HTTPS via nginx/Caddy; a single HTTP request (e.g. `http://host/`) or an SSL-strip position causes the browser to send the session cookie in cleartext → session hijack (the cookie is a bearer credential — see `session.js:77-79`).
- **Positive:** `HttpOnly` and `SameSite=Lax` are always set (good — Lax blocks cross-site POST cookie replay, a solid CSRF baseline; `HttpOnly` blocks XSS theft).
- **Recommended fix:** Set `Secure` whenever the effective request scheme is HTTPS — honor `X-Forwarded-Proto: https` from the trusted proxy, or add an explicit `HERMEST_FORCE_SECURE_COOKIES=1` flag documented for self-host TLS. Consider `SameSite=Strict` for the session cookie since no cross-site GET flow needs it.

### M3 (MEDIUM) — Non-Vercel auto-authentication bypasses per-record ownership (no tenant isolation without owner token / session secret)

- **File:** `api/_lib/auth.js:64-70` (`getRequestActor`) + `api/_lib/authorization.js:24-26` (`actorRequiresOwnership`).
- **Issue:** When `!process.env.VERCEL && !HERMEST_OWNER_TOKEN`, `getRequestActor` returns `{ authenticated: true, id: "local-dev", mode: "development" }` for **every** request. `actorRequiresOwnership` returns `true` **only** for `mode === "signed-session"`; therefore `development` (and `owner-token`) actors skip **all** per-workspace ownership filtering — `filterRecordsForActor` returns every record and `requireRecordAccess` always passes. This is correct and intended for a **single-user** self-host, but a **multi-tenant / shared** self-host deployment that does not set `HERMEST_OWNER_TOKEN` or `HERMEST_SESSION_SECRET` has **no isolation between workspaces**: any caller reads and writes every workspace's projects, assets, and publish candidates.
- **Failure scenario:** An operator exposes a self-host instance to multiple users expecting per-workspace separation, but never configures owner token or session secret → user B reads/edits user A's records.
- **Recommended fix:** Document the single-tenant assumption prominently in `DEPLOYMENT.md` / `SECURITY.md`; for any shared deployment require `HERMEST_OWNER_TOKEN` or account-auth (`HERMEST_ACCOUNT_AUTH=1` + `HERMEST_SESSION_SECRET`). Consider a `HERMEST_REQUIRE_AUTH=1` gate that removes the `development` auto-actor.
- **Positive:** On Vercel/durable-storage hosting the guard is stricter — `requireReadAccess`/`requireWriteAccess` (`auth.js:38-106`) block anonymous access and the storage guard blocks writes until auth is configured.

### L1 (LOW) — Token-vault key-derivation fallback uses a single SHA-256, not a slow KDF

- **File:** `api/_lib/token-vault.js:99-109` (`key()`).
- **Issue:** A 64-hex or 32-byte-base64 `HERMEST_TOKEN_ENCRYPTION_KEY` is used directly (good). But **any other string** falls through to `createHash("sha256").update(raw).digest()` — a single unsalted SHA-256 with no cost factor. A weak/short passphrase therefore yields a low-entropy AES-256-GCM key that is cheap to brute-force offline if an encrypted envelope leaks.
- **Recommended fix:** Reject non-conforming key material (require 32-byte hex/base64) **or** derive via `scrypt`/`argon2` with a fixed high-cost parameter. Document the "generate 32 random bytes" requirement in `.env.example`.
- **Positive:** The encryption itself is sound — AES-256-GCM, fresh random 12-byte IV per operation, auth tag persisted, `kid` tracked (`token-vault.js:25-58`).

### L2 (LOW) — `owner-token` / `development` actors' ownership exemption is undocumented

- **File:** `api/_lib/authorization.js:24-26`.
- **Issue:** `actorRequiresOwnership` intentionally exempts every mode except `signed-session`. This is correct for admin/bootstrap actors, but the exemption is implicit; a future privileged route added by another contributor could wrongly assume `requireRecordAccess` always enforces ownership.
- **Recommended fix:** Add a one-line comment at `authorization.js:24` stating the exemption is deliberate for admin/bootstrap/single-tenant modes, and note it in `SECURITY.md`.

---

## Verified SAFE (anchored to real code read on 2026-07-24)

### OAuth `state` cryptographic construction — ✔
`api/_lib/oauth-state.js` — nonce is `randomUUID()` (`:26`); signature is `HMAC-SHA256` (`:84-86`); comparison is **constant-time** `timingSafeEqual` on equal-length buffers (`:88-93`); strict 5-part format + prefix check (`:44-45`); expiry enforced and future-`iat` clock-skew rejected (`:63-64`); provider is allowlisted `^(youtube|tiktok|instagram)$` and bound (`:61-62`, `:103-106`). The construction is correct; the gap is single-use/session-binding (M1), not the crypto.

### Publish approval is fail-closed — ✔ (refutes the prior "race" finding)
`api/product.js:631-696` + `api/product.js:997-1005`. On `approve`, the job is written with `status: "blocked"`, `execution.canAutopublish: false` (hardcoded, **unconditional**), and a fixed blocker list `["durable_job_queue_not_implemented", "oauth_token_exchange_not_implemented", "provider_review_not_complete", "autopublishing_disabled"]`. `normalizeJobTransition` (`:1000-1003`) refuses any transition to `running`/`completed` while `approval.status !== "approved" || execution.canAutopublish === false || plan.blockers.length > 0`. Because `canAutopublish` is set to `false` on **every** approval in the same atomic `saveRecord`, autopublish can never occur and there is **no exploitable approval race**. Write path is gated by `requireWriteAccess` + `requireRecordAccess` (`:634,:640`).

### Token-vault encryption at rest — ✔ (implemented; refutes the prior "not implemented" finding)
`api/_lib/token-vault.js` — AES-256-GCM (`:3,:31`), random 12-byte IV per op (`:30`), auth tag stored (`:38`), authenticated decrypt with tag verification (`:53-58`), fail-closed `501` when the key is absent (`requireTokenVault`, `:14-23`), and secrets stripped on output (`redactConnector`/`sanitizeConnectorMetadata`, `:61-97`). The only gap is key-material strength on the fallback path (L1).

### Privileged routes are gated — ✔
Writes to projects/assets/publish-candidates/jobs require `requireWriteAccess` and then `requireRecordAccess` (`api/product.js:370,393,426,466,634`); reads use `requireReadAccess` + `filterRecordsForActor` (`:364,382,420,455`). Owner-token compare is constant-time (`auth.js:143-148`).

### Account credentials — ✔
`api/_lib/accounts.js` — `scrypt` password hashing with 16-byte random salt (`:120-129`), constant-time verify (`:131-138`), length policy 10–200 (`:157-168`), email validation (`:140-150`).

### Session token verification — ✔
`api/_lib/session.js` — HMAC-SHA256 signed token, constant-time signature compare (`:91-96`), strict format/prefix (`:52`), expiry + future-`iat` guard (`:65-68`), id allowlist regex (`:106-109`). (Transport hardening is the `Secure` gap, M2.)

---

## Refuted prior findings (from the hallucinated version)

| Prior claim | Reality (code read 2026-07-24) |
|-------------|--------------------------------|
| "FINDING-2: token vault stores plaintext in `const tokens = new Map()`, no encryption" | **False.** `token-vault.js` implements AES-256-GCM with random IV + auth tag. No such `Map` exists. |
| "OAuth uses `randomBytes(32).hex` + `session.oauthState` + `delete session.oauthState` (single-use, session-bound) → VERIFIED SAFE" | **False.** OAuth uses a stateless HMAC token with **no** session binding and **no** single-use — that is the real gap (M1). The quoted code does not exist. |
| "FINDING-1: publish approval race (`execution` unset on first approval)" | **False.** `execution.canAutopublish` is set to `false` unconditionally on every approval; autopublish is universally disabled (fail-closed). No race. |
| "`ensureSessionSync` / `requireWorkspaceId` / `getScopedWorkspaceId` verified" | **False.** None of these functions exist. Real helpers are `readSignedSession`, `requireRecordAccess`, `filterRecordsForActor`, `canAccessRecord`. |
| "connectors/start.js:17 calls `ensureSessionSync`" | **False.** `connectors/start.js` performs no session call; it builds an OAuth start URL. |

---

## Next steps (owner action required — no code changed by this audit)

1. **M1** — before wiring OAuth token exchange, add session-binding + single-use to `state`. (LANE A, additive, with test.)
2. **M2** — set `Secure` on the session cookie for self-host HTTPS (`X-Forwarded-Proto` or a config flag). (LANE A, additive, with test.) — lowest-effort, highest-value.
3. **M3** — document the single-tenant assumption and require auth for shared self-host; optional `HERMEST_REQUIRE_AUTH` gate. (Docs + optional LANE A.)
4. **L1** — enforce 32-byte key material or KDF-derive in `token-vault.key()`. (LANE A, additive.)
5. **L2** — document the ownership exemption at `authorization.js:24`. (Docs.)

---

## Methodology

- Static read-only review; no dynamic testing; **no files changed**.
- Files read: `api/_lib/{oauth-state,session,accounts,auth,authorization,token-vault,http,storage}.js`, `api/connectors/{start,callback}.js`, `api/product.js` (auth + publish-approval paths).
- Every finding and every "verified" row cites a `file:line` confirmed present in the repo on 2026-07-24.
- Out of scope (covered in LANE A): SSRF, secret redaction, spawn safety, dependency audit, bundle leak.
