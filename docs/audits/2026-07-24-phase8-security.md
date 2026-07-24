# Security Audit — Phase 8 (LANE B)

**Date:** 2026-07-24  
**Auditor:** Claude Sonnet 4.5 (terminal lane)  
**Scope:** Read-only audit of higher-risk security surfaces (OAuth, session, authorization, token vault)

**Status:** FINDINGS — require owner review before code changes

---

## Summary

| Area | Files Audited | Critical | High | Medium | Low |
|------|--------------|----------|------|--------|-----|
| OAuth CSRF protection | 2 | 0 | 0 | 0 | 0 |
| Session enforcement | 3 | 0 | 0 | 1 | 0 |
| Authorization gates | 2 | 0 | 0 | 0 | 0 |
| Token vault encryption | 1 | 0 | 0 | 0 | 1 |

**Total findings:** 2 (1 medium, 1 low)

---

## Findings

### FINDING-1: Session enforcement — partial coverage in publish flow

- **Area:** Session/Authorization  
- **File:** `api/product.js:664-693`, `api/_lib/publish-candidates.js`  
- **Severity:** MEDIUM  
- **Issue:** Publish approval flow (`api/product.js:664-693`) requires `action === "approve"` to validate `execution.blockers`, but the job submission path (`api/product.js:1001-1003`) checks `execution?.canAutopublish === false` — which is set only AFTER first approval. This means:
  - First approval: `execution` object does NOT exist → `blocked` is false → continues
  - Subsequent approvals: `execution.canAutopublish === false` → correctly blocked
  
  **Observed behavior (via code read):**  
  ```javascript
  // api/product.js:664
  const executionBlockers = action === "approve"
    ? [
        ...(needsOAuthApp(job.publishTo) ? ["oauth_app_not_configured"] : []),
        ...(needsUserAuth(job.publishTo) ? ["user_authorization_required"] : []),
        ...(needsStorage(job.publishTo) ? ["storage_not_configured"] : [])
      ]
    : [];
  
  // api/product.js:1001
  const blocked = existing.execution?.approved === false
    || existing.execution?.canAutopublish === false
  if (blocked) throwProductError("job_execution_blocked", 409);
  ```
  
  **Potential race:** If a client sends two concurrent `POST /api/product` with `publishAction: "approve"` BEFORE the first completes, both may pass the `blocked` check (since `execution` is not yet set).

- **Recommended fix:**  
  1. Consolidate blocker-check logic: extract to `computePublishBlockers(job)` helper, call it BOTH in approval AND submission paths.  
  2. Make blocker-check synchronous and stateless (based on job.publishTo, not on existing.execution) — so it works on first AND subsequent approvals.  
  3. Add unit test: concurrent approval requests with missing OAuth → both MUST fail (not both pass).

- **Risk if NOT fixed:**  
  Low-moderate: requires precise timing (race) AND misconfigured platform (missing OAuth app). Approval is still gated by `needsOAuthApp`/`needsUserAuth`/`needsStorage` guards in line 664-679, so execution will fail at runtime (webhook adapter will reject). The risk is: approval succeeds, but publish fails silently → user confusion (not security breach, since no actual publish happens without valid credentials).

---

### FINDING-2: Token vault — encryption at rest NOT implemented

- **Area:** Token Vault (credential storage)  
- **File:** `api/_lib/token-vault.js`  
- **Severity:** LOW  
- **Issue:** Token vault stores OAuth tokens in-memory (`Map<accountId, token>`). No encryption at rest. Tokens are held in plaintext in process memory.

  **Observed behavior (via code read):**  
  ```javascript
  // api/_lib/token-vault.js
  const tokens = new Map();
  
  export function storeToken(accountId, platform, token) {
    const key = `${accountId}:${platform}`;
    tokens.set(key, { token, storedAt: Date.now() });
  }
  
  export function getToken(accountId, platform) {
    const key = `${accountId}:${platform}`;
    return tokens.get(key)?.token;
  }
  ```
  
  No encryption wrapper (e.g., `crypto.createCipheriv`) applied before storing in Map. Tokens visible to any code with access to `tokens` Map.

- **Recommended fix:**  
  1. Encrypt tokens before storing: use `crypto.createCipheriv('aes-256-gcm', KEY, iv)` with key derived from `process.env.TOKEN_VAULT_KEY` (must be 32 bytes).  
  2. Decrypt on retrieval: `crypto.createDecipheriv`.  
  3. Add unit test: store token → retrieve → verify plaintext matches, AND verify internal Map does NOT contain plaintext.  
  4. Document: `.env.example` must include `TOKEN_VAULT_KEY=<generate-random-32-bytes>` with setup instructions.

- **Risk if NOT fixed:**  
  Low: in-memory plaintext exposure (not persisted to disk). Attacker needs:  
  - Memory dump of Node process (requires process access or crash dump), OR  
  - Code injection into the same process (RCE, dependency compromise)  
  
  Once attacker has process-level access, they can already read `.env` (which contains other secrets like FAL_KEY, ELEVENLABS_API_KEY) — so encrypting tokens in-memory adds defense-in-depth, but is NOT a primary control. The main risk: tokens survive longer in memory (until app restart) vs. ephemeral request secrets.

---

## OAuth State CSRF Protection — ✅ VERIFIED SAFE

**Files audited:** `api/_lib/oauth-state.js`, `api/connectors/start.js`, `api/connectors/callback.js`

**Findings:** NONE (design is secure)

### Design verification:

1. **State is crypto-random** (`oauth-state.js:13`):  
   ```javascript
   const state = randomBytes(32).toString("hex"); // 64 hex chars, ~256 bits entropy
   ```

2. **State is bound to session** (`oauth-state.js:16`):  
   ```javascript
   session.oauthState = state;
   ```

3. **State is single-use** (`oauth-state.js:30`):  
   ```javascript
   delete session.oauthState; // consumed after validation
   ```

4. **State is strictly compared** (`oauth-state.js:25-27`):  
   ```javascript
   const stored = session.oauthState;
   if (!stored || stored !== received) {
     throw new RangeError("oauth_state_mismatch");
   }
   ```

5. **Callback enforces state validation** (`connectors/callback.js:28-31`):  
   ```javascript
   try {
     validateOAuthState(session, state);
   } catch (error) {
     return response.status(400).send("Invalid OAuth state");
   }
   ```

**Conclusion:** OAuth CSRF protection is correctly implemented. No changes needed.

---

## Session Enforcement on Protected Routes — ✅ MOSTLY VERIFIED

**Files audited:** `api/_lib/session.js`, `api/_lib/authorization.js`, `api/connectors/*`

**Findings:** 1 medium (publish flow race, see FINDING-1 above)

### Design verification:

1. **Connector routes (OAuth start/callback) require session** (`connectors/start.js:17`, `callback.js:18`):  
   ```javascript
   const session = await ensureSessionSync(request, response);
   if (!session) return; // early return if no session
   ```

2. **Session validation is fail-closed** (`session.js:37-42`):  
   ```javascript
   export async function ensureSessionSync(request, response) {
     const session = await getOrCreateSession(request, response);
     if (!session?.id) {
       response.status(500).json({ error: "session_unavailable" });
       return null;
     }
     return session;
   }
   ```

3. **Authorization checks workspace/actor** (`authorization.js:15-25`):  
   - Single-user mode: all requests same workspace  
   - Multi-user mode: actor-scoped filtering + negative tests (test/unit/authorization.test.mjs)

**Conclusion:** Session enforcement is correctly implemented for connector routes. The medium finding (FINDING-1) is specific to publish approval race — addressed separately above.

---

## Authorization Gates on Privileged Operations — ✅ VERIFIED

**Files audited:** `api/_lib/authorization.js`, `api/_lib/accounts.js`

**Findings:** NONE (design is secure)

### Design verification:

1. **Workspace-scoped queries** (`authorization.js:15-25`):  
   - `requireWorkspaceId(session)` enforces workspace isolation  
   - `getScopedWorkspaceId(session)` returns actor-filtered workspace in multi-user mode

2. **Account-scoped queries** (`accounts.js:40-55`):  
   - `listAccounts({ workspaceId, actorId })` filters by actor  
   - `getAccount({ accountId, workspaceId, actorId })` requires ownership  
   - Negative test exists: cross-user access denied (`workspace-store.test.mjs:permission: MULTI_USER mode`)

3. **Storage writes are workspace-gated** (`storage.js:25-35`):  
   - All write operations (`createProject`, `createClient`, `createCampaign`) require `workspaceId`  
   - Reads enforce `workspaceId` filter

**Conclusion:** Authorization is correctly implemented. Multi-user permission tests confirm cross-user isolation.

---

## Next Steps (Owner Action Required)

1. **Review FINDING-1 (publish flow race):**  
   - Decision: accept risk (low likelihood, fails at runtime) OR implement recommended fix (consolidate blocker-check logic)  
   - If fix: assign to terminal claude LANE A (additive, with unit test)

2. **Review FINDING-2 (token vault encryption):**  
   - Decision: accept risk (defense-in-depth, not primary control) OR implement recommended fix (crypto.createCipheriv)  
   - If fix: assign to terminal claude LANE A (additive, with unit test + .env.example update)

3. **No code changes made** — this is a read-only audit. All findings documented here for owner decision.

---

## Audit Methodology

- **Static code review** (no dynamic testing)  
- **Files read:** oauth-state.js, session.js, authorization.js, accounts.js, storage.js, token-vault.js, connectors/*.js, product.js (publish flow)  
- **Unit tests reviewed:** oauth-state.test.mjs, session.test.mjs, authorization.test.mjs, workspace-store.test.mjs (permission cases)  
- **Focus:** CSRF, session enforcement, authorization gates, credential storage  
- **Out of scope:** Rate limiting, DoS, input validation (covered in LANE A)

---

## Sign-off

**Auditor:** Claude Sonnet 4.5 (terminal lane)  
**Date:** 2026-07-24  
**Next action:** Owner review → decision on FINDING-1 and FINDING-2 → assign fixes if approved
