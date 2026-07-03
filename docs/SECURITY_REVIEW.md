# Security Review

Date: 2026-07-03
Version reviewed: 0.2.0 alpha

This review is the current production security baseline for Hermest Board. It is
not a final launch certification.

## Current Posture

Hermest Board is safe enough for public alpha viewing and demos where users do
not enter private customer data. It is not ready for production writes,
autopublishing, paid users, or private workspace data.

The most important current control is intentional write blocking on public
Vercel deployments. Project writes must stay disabled until durable storage,
real authentication, authorization, encrypted connector token storage, and human
publishing approval are implemented.

## Implemented Controls

- Public production writes are blocked unless server storage is explicitly and
  safely configured.
- Optional demo storage is guarded by `HERMEST_OWNER_TOKEN`.
- Temporary demo-storage reads on public Vercel are also guarded by
  `HERMEST_OWNER_TOKEN` when demo storage is enabled.
- Platform connector routes are skeletons only; they do not publish content.
- Agent planning is dry-run only and returns blockers before execution.
- Asset metadata rejects rights-status values outside the durable schema enum.
- Security headers are configured in `vercel.json`:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` restricting camera, microphone, geolocation, and display capture.
  - baseline `Content-Security-Policy`
  - `Cross-Origin-Opener-Policy: same-origin`
- Local secret audit tooling exists for operator-provided credential files.
- CI runs validation, API smoke tests, production build, and render smoke tests.
- A live verification script checks production health, storage guards, agent
  blockers, source download availability, and security headers.
- A product preflight route reports readiness gates and blocker names without
  exposing secret values.
- Storage now has an explicit adapter boundary; durable adapters still remain
  disabled until auth and authorization are implemented.
- Project records include future ownership metadata, but it is bootstrap
  metadata only and must not be treated as final authorization.
- `session/current` exposes only bootstrap actor metadata; it is not final
  per-user authentication.
- Signed session token verification exists, but token issuance and full
  per-user authorization are still intentionally blocked.
- Project, asset, job, and audit routes enforce bootstrap `workspaceId` checks
  for signed-session actors; this does not yet cover the full future workspace
  membership model.

## Known Limitations

### High

- No real user authentication or session model exists yet.
- No durable production database is connected yet.
- No final workspace membership or role model exists for user-owned projects.
  Current signed-session authorization is only a bootstrap `workspaceId` guard.
- No encrypted storage exists for OAuth refresh/access tokens.
- Autopublishing is intentionally not executable yet.
- Existing owner-token guard is only a bootstrap control, not real multi-user security.
- `DATABASE_URL`, `POSTGRES_URL`, or blob-token env presence is detected and
  reported, but it intentionally does not enable production writes until an
  adapter, authentication, and authorization are implemented.

### Medium

- Current CSP allows `'unsafe-inline'` for scripts and styles because the alpha
  app is still a static frontend with inline-friendly behavior. Tighten this
  once the frontend is split into nonce/hash-safe assets.
- API rate limiting and abuse controls are not implemented.
- Audit logging is a local/demo contract until durable storage is attached.
- Upload/media validation is not production-grade yet.
- OAuth routes need state validation, callback verification, token encryption,
  disconnect flows, and provider-specific scope review.

### Low

- Repository name is operationally confusing and should be renamed later if the
  owner wants a cleaner public product identity.
- Vercel Hobby function limits require the combined product API route to stay
  compact until the hosting plan or architecture changes.

## Required Before Production Writes

Do not enable public project writes until all of the following are complete:

1. Durable database adapter is implemented and deployed.
2. Authentication is implemented with a real provider or signed session system.
3. Every project, asset, job, and audit record has owner/workspace ownership.
4. Every read/write route enforces authorization.
5. Secrets and OAuth tokens are encrypted server-side.
6. OAuth providers are configured with state checks and callback validation.
7. API rate limits or equivalent abuse controls are active.
8. Live verification covers authorized and unauthorized paths.

## Required Before Autopublishing

Do not allow the agent to post to TikTok, YouTube, Shorts, or Instagram until:

1. User-owned OAuth connections are implemented.
2. Publishing tokens never reach the browser.
3. Generated media passes copyright/source policy checks.
4. Every publishing action requires human review and approval.
5. Jobs are durable, auditable, retry-safe, and cancellable.
6. The user can disconnect accounts and revoke access.
7. Provider policy limits, rate limits, and error handling are documented.

## Verification

Local full check:

```bash
npm run check
```

Production live check after deployment:

```bash
npm run verify:live
```

The live check should pass only after the latest Vercel deployment is active.
