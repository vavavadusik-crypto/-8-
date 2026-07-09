# Security Policy

## Supported version

Use the latest deployment and the latest commit on `main`.

## Secrets policy

Do not commit `.env`, Vercel tokens, OAuth client secrets, provider API keys,
owner tokens, session secrets, connector tokens, database URLs, or user export
data.

This project intentionally uses BYOK-style settings. Users should add their own
API keys through local settings or server environment variables, not through
committed files.

## Production safety

Autopublishing and connector writes must stay guarded by:

- explicit user authentication;
- signed OAuth state;
- encrypted token storage;
- human approval before publish jobs;
- configured backend storage and audit logs.

If a secret is committed accidentally, revoke it in the provider dashboard,
rotate it, and remove it from the repository before the next release.

## Reporting a security issue

Report security issues privately to the maintainer first. Include redacted
logs, affected endpoint, expected behavior, and reproduction steps.
