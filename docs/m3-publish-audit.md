# M3 Publishing Audit — Phase 3 Gate

Аудит текущей поверхности публикации до начала реализации Gate M3.

## Current Publishing Surface

### 1. Publish Candidate Contract (✅ Implemented)

**Location:** `api/_lib/publish-candidates.js`

**Schema:** `hermest.publish-candidate.v1`

**Key Functions:**
- `buildPublishCandidate(input)` — строит immutable, sealed publish candidate
- `assertCandidateApproval(candidate, expected)` — проверяет готовность к approval
- `getPublishProjectSnapshotSha256(projectRecord)` — SHA256 snapshot проекта
- `summarizeAssetRights(assets)` — агрегация прав на assets

**Candidate Structure:**
```javascript
{
  id: "cand_<40-char-sha256-prefix>",
  schema: "hermest.publish-candidate.v1",
  version: 1,
  digest: "<sha256>",
  status: "sealed",
  projectId, workspaceId, ownerUserId,
  project: { snapshotSha256, ... },
  recipe: { id, version, platform, width, height },
  platforms: ["youtube_video", "youtube_shorts", "instagram_reels", "tiktok"],
  artifacts: [{ name, type, bytes, sha256 }],
  manifestSha256: "<sha256>",
  rights: { status, assetIds },
  evidence: { status, verifier },
  approvable: boolean,
  approvalBlockers: [],
  canAutopublish: false,
  createdAt, updatedAt
}
```

**Supported Platforms:**
- `youtube_video`
- `youtube_shorts`
- `instagram_reels`
- `tiktok`

**Approval Blockers:**
- `asset_rights_not_cleared` — rights.status not in ["allowed", "owned", "generated"]
- `artifact_verification_required` — evidence.status !== "server_verified"

### 2. Connector Capabilities (✅ Implemented, OAuth ❌ Not Executable)

**Location:** `api/_lib/connector-capabilities.js`

**Schema:** `hermest.connector-capabilities.v1`

**Capabilities:**
```javascript
capability("publish.draft", true, [
  adapter("youtube-publish-v1", ["youtube"], false, ["server"], "oauth", 
    ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"]),
  adapter("tiktok-publish-v1", ["tiktok"], false, ["server"], "oauth",
    ["TIKTOK_CLIENT_ID", "TIKTOK_CLIENT_SECRET"]),
  adapter("instagram-publish-v1", ["instagram"], false, ["server"], "oauth",
    ["META_APP_ID", "META_APP_SECRET"])
])
```

**Adapter States:**
- `implemented: false` — адаптеры НЕ реализованы
- `configuration: "oauth"` — требуют OAuth
- `blockers: ["oauth_token_exchange_not_implemented", "adapter_not_implemented"]`

**Key Function:**
- `getConnectorCapabilityStatus(options)` — возвращает статус всех capabilities
- `planConnectorCapability(capabilityId, options)` — планирует capability execution

### 3. OAuth Flow (⚠️ Partial — State Only, No Token Exchange)

**Locations:**
- `api/_lib/oauth-state.js` — HMAC-signed state creation/verification
- `api/connectors/start.js` — генерация OAuth authorization URL
- `api/connectors/callback.js` — callback handler (только валидация state)

**Status:**
- ✅ `createOAuthState(payload)` — HMAC-подписанный state с nonce/exp
- ✅ `verifyOAuthState(state, options)` — timing-safe verification
- ✅ OAuth authorization URLs для YouTube/TikTok/Instagram
- ❌ Token exchange NOT implemented — callback возвращает 501:
  ```json
  {
    "ok": false,
    "error": "oauth_token_exchange_not_implemented",
    "note": "OAuth callback state validation passed. Token exchange still needs encrypted token storage and a user account model before public use."
  }
  ```

**Required ENV:**
- `HERMEST_OAUTH_STATE_SECRET` или `HERMEST_SESSION_SECRET` — для HMAC
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_REDIRECT_URI`
- `TIKTOK_CLIENT_ID`, `TIKTOK_REDIRECT_URI`
- `META_APP_ID`, `META_REDIRECT_URI`

### 4. Token Vault (✅ Encrypted Storage Skeleton)

**Location:** `api/_lib/token-vault.js`

**Features:**
- `encryptSecret(plaintext)` — AES-256-GCM encryption
- `decryptSecret(ciphertext, kid)` — decryption
- `requireTokenVault()` — проверка `HERMEST_ENCRYPTION_KEY_BASE64`
- `redactConnector(connector)` — удаляет encrypted secrets из response

**Storage:**
- Connectors stored in `storage.json` → `connectors` array
- Fields: `encryptedAccessToken`, `encryptedRefreshToken`, `tokenKeyId`
- Metadata: `provider`, `accountLabel`, `scopes`, `status`, `tokenExpiresAt`

### 5. Publish Pack Validation (✅ Schema Check Only)

**Location:** `api/publish-pack/validate.js`

**Schema:** `hermest.publish.pack.v1`

**Required Fields:**
- `schema`, `title`, `platforms`, `languages`, `script`, `mediaBrief`

**Response:**
```json
{
  "ok": true/false,
  "missing": [],
  "publishable": false,
  "note": "Validation only. Real platform publishing requires OAuth connectors and explicit approval workflow."
}
```

### 6. Product API Routes (✅ CRUD for Candidates/Jobs/Connectors)

**Routes:**
- `GET /api/product/publish-candidates` — list candidates
- `POST /api/product/publish-candidates` — create candidate (metadata_only evidence)
- `GET /api/product/publish-candidates/:id` — get candidate by ID
- `GET /api/product/jobs` — list jobs
- `POST /api/product/jobs` — create job (binds candidate + approval flow)
- `POST /api/product/jobs/:id/approval` — approve/reject job
- `GET /api/product/connectors` — list connectors
- `POST /api/product/connectors` — store encrypted OAuth tokens
- `GET /api/product/connectors/:id` — get connector
- `DELETE /api/product/connectors/:id` — delete connector
- `GET /api/product/connectors/capabilities` — capability status

**Approval Flow:**
1. Create publishCandidate (sealed, immutable, digest-verified)
2. Create job with `candidateId`
3. POST `/jobs/:id/approval` with `{ action: "approve", candidate: { id, digest, version } }`
4. Job transitions to `"blocked_after_approval"` status with blockers:
   - `"autopublish_blocked_pending_platform_adapters"`
   - `"explicit_human_approval_required"`

**Blockers:** Нет исполнения публикации — только approval workflow.

### 7. Candidate Persistence (✅ Worker-Verified Path)

**Location:** `src/local-media/candidate-persistence.js`

**Function:** `createLocalVerifiedCandidatePersister({ ... })`

**Evidence:**
```javascript
{
  status: "server_verified",
  verifier: "local-media-worker-r1"
}
```

**Process:**
1. Validate verifiedRender from local-media worker
2. Check project snapshot SHA256 match
3. Build candidate with worker evidence
4. Save to `publishCandidates` storage
5. Append audit event `publish_candidate.worker_verified`

### 8. Storage Model

**Location:** `api/_lib/storage.js`

**Collections:**
- `publishCandidates` — sealed candidates
- `jobs` — approval/execution jobs
- `connectors` — encrypted OAuth tokens
- `audit` — immutable audit log

**Persistence:** JSON file (`storage.json`)

---

## Missing Pieces for Gate M3

### 1. ❌ General Publishing Contract

**Required:**
- Adapter interface: `{ platform, capabilities, validate(candidate), requiresAuth, costClass, publish(candidate, options) }`
- Receipt schema: `{ platform, remoteId?, status, timestamp, url?, sanitizedError? }`
- Idempotency key contract
- Retry policy (safe vs unsafe errors)
- Rate limit (429) handling
- AbortSignal cancellation support

**Location:** NEW → `src/publishing/publish-contract.js`

### 2. ❌ Webhook/Export Adapter (Safe Test Adapter)

**Required:**
- No OAuth dependency
- POST publish-pack или signed manifest to user-configured URL
- Real receipt generation
- Idempotent via key
- Retry only on 5xx/network errors with exponential backoff
- Rate limit (429) backoff
- AbortSignal cancellation
- Unit tests against MOCK http endpoint (no real network)

**Location:** NEW → `src/publishing/adapters/webhook-export.js`

### 3. ❌ Platform Adapters (Production Config + Honest Status)

**YouTube / YouTube Shorts:**
- OAuth PKCE/state/redirect validation
- Encrypted token storage OR system-keyring integration
- Platform validation: aspect ratio (16:9 vs 9:16), duration, size, title, description, tags, thumbnail, privacy
- Status: `"needs_oauth_app"` / `"blocked_platform_review"` when credentials absent
- Integration tests through official sandbox/mock boundaries

**TikTok:**
- Same as YouTube

**Instagram Reels:**
- Same as YouTube, plus Meta Business Account requirements

**Location:** NEW → `src/publishing/adapters/{youtube,tiktok,instagram}.js`

### 4. ❌ Receipt Persistence

**Required:**
- Immutable receipt storage with provenance
- Manifest hashing (reuse candidate-persistence patterns)
- Sanitized (NO secrets/tokens in receipt/log/manifest)
- Queryable by candidateId

**Location:** NEW → extension of `api/_lib/storage.js` or `src/publishing/receipt-storage.js`

### 5. ❌ Frontend-Facing Status Contract

**Required:**
```typescript
interface PlatformStatus {
  platform: "youtube_video" | "youtube_shorts" | "tiktok" | "instagram_reels";
  available: boolean;
  mode: "draft" | "live" | "unavailable";
  requiresAuth: boolean;
  statusReason: string; // "needs_oauth_app", "blocked_platform_review", "ready", etc.
}
```

**Location:** NEW → expose via `GET /api/product/publishing/platforms` or integrate into `/connectors/capabilities`

### 6. ⚠️ OAuth Token Exchange

**Status:** Skeleton exists, token exchange NOT implemented

**Blockers:**
- Needs database-backed sessions (not just signed cookies)
- Needs refresh token rotation logic
- Needs platform-specific error handling

**Location:** Extend `api/connectors/callback.js`

---

## Security Checklist

✅ OAuth state HMAC-signed with `HERMEST_OAUTH_STATE_SECRET`
✅ Timing-safe state comparison (`timingSafeEqual`)
✅ Secrets encrypted with AES-256-GCM (`HERMEST_ENCRYPTION_KEY_BASE64`)
✅ No secrets in logs/responses (redacted via `redactConnector`)
✅ Immutable candidates (digest-verified, sealed)
✅ Authorization checks (`requireRecordAccess`, ownership validation)
✅ Safe path validation (no `..` in artifact names)
❌ Webhook adapter MUST validate URLs (no SSRF — localhost/private IPs forbidden)
❌ Platform adapters MUST sanitize ALL errors (no token leaks)
❌ Receipt storage MUST strip secrets before persisting

---

## Frontend-Facing Contract (REQUIRED OUTPUT)

**Endpoint:** `GET /api/product/publishing/platforms`

**Response:**
```json
{
  "ok": true,
  "platforms": [
    {
      "platform": "youtube_video",
      "available": false,
      "mode": "unavailable",
      "requiresAuth": true,
      "statusReason": "needs_oauth_app",
      "capabilities": {
        "maxDuration": 43200,
        "aspectRatios": ["16:9"],
        "formats": ["mp4"],
        "maxSize": 137438953472
      }
    },
    {
      "platform": "webhook_export",
      "available": true,
      "mode": "draft",
      "requiresAuth": false,
      "statusReason": "ready",
      "capabilities": {
        "acceptsManifest": true,
        "acceptsPublishPack": true
      }
    }
  ],
  "note": "Draft mode is default. Live publishing requires explicit confirm flag per publish call."
}
```

**Field Definitions:**
- `platform` — platform ID (same as `candidate.platforms`)
- `available` — can this adapter execute now?
- `mode` — `"draft"` (safe preview), `"live"` (real publish), `"unavailable"`
- `requiresAuth` — does this need OAuth?
- `statusReason` — human-readable blocker: `"ready"`, `"needs_oauth_app"`, `"blocked_platform_review"`, `"credentials_missing"`, `"adapter_not_implemented"`
- `capabilities` — platform constraints (validation rules)

---

## Test Strategy

### Unit Tests (npm run test:unit)
- [ ] Publish contract interface validation
- [ ] Webhook adapter: idempotency, retry, rate-limit, cancellation
- [ ] Receipt schema validation
- [ ] Platform validation rules (aspect ratio, duration, size)
- [ ] OAuth state creation/verification (already exists in tests?)
- [ ] Token vault encryption/decryption (already exists)

### Integration Tests
- [ ] Webhook adapter → mock HTTP endpoint (no real network)
- [ ] Full publish flow: candidate → approve → publish → receipt
- [ ] Platform adapters → official sandbox/mock (NOT production stubs)

### Smoke Tests
- [ ] `npm run check` green
- [ ] Create candidate via API
- [ ] Publish via webhook adapter to local mock endpoint
- [ ] Assert valid sanitized receipt

---

## Implementation Order (TDD)

1. **Publish contract** (`src/publishing/publish-contract.js`) — interface + tests
2. **Webhook adapter** (`src/publishing/adapters/webhook-export.js`) — working adapter + tests
3. **Receipt storage** (`src/publishing/receipt-storage.js`) — persistence + tests
4. **Platform validation rules** (YouTube/TikTok/Instagram constraints) — no execution, just validation + tests
5. **Frontend status endpoint** (`GET /api/product/publishing/platforms`) — expose contract
6. **Smoke test** — candidate → webhook publish → receipt verification

---

## Blockers

### Real Blockers (Cannot Implement Without External Action)
- **YouTube/TikTok/Instagram OAuth apps** — need real client ID/secret from Google/ByteDance/Meta
- **Platform API sandbox access** — need developer accounts + app review approval

### Honest Status Response (NO FAKE SUCCESS)
When credentials absent or platform review pending, adapters MUST return:
```json
{
  "ok": false,
  "error": "needs_oauth_app",
  "platform": "youtube_video",
  "statusReason": "Client ID and Secret not configured. Register OAuth app at https://console.cloud.google.com/",
  "canPublish": false
}
```

**NEVER return fake success or pretend to publish when credentials missing.**

---

## Summary

**Current State:**
- ✅ Publish candidate contract (sealed, immutable, digest-verified)
- ✅ OAuth state signing (HMAC-verified, timing-safe)
- ✅ Token vault (AES-256-GCM encrypted storage)
- ✅ Connector capabilities planning (YouTube/TikTok/Instagram registered)
- ✅ Approval workflow (jobs + candidate binding)
- ⚠️ OAuth token exchange (skeleton exists, NOT executable)
- ❌ Platform publish adapters (NOT implemented)
- ❌ Webhook/export adapter (NOT implemented)
- ❌ Receipt persistence (NOT implemented)
- ❌ Frontend status contract (NOT exposed)

**Gate M3 Goal:**
- ✅ publish-pack stays working
- ✅ General publishing contract defined
- ✅ ONE fully working, safely-testable adapter (webhook/export)
- ⚠️ Social adapters (YouTube/TikTok/Instagram) have production-ready config path + HONEST status
- ❌ NO fake success — real blockers documented

**Next Steps:** Implement in TDD order above.
