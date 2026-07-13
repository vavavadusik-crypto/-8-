# Connectors

This document describes the Board-owned connector capability layer and what must still be connected before Hermest Board can publish.

## Capability Router

The descriptive provider source remains `public/api-provider-catalog.json`. The runtime planner in `api/_lib/connector-capabilities.js` maps Board capabilities to versioned adapters without copying provider metadata or exposing credential values.

Safe status endpoint:

```text
GET /api/product?route=connectors/capabilities
```

States are deliberately stricter than configuration:

- `working_adapter` — implemented for the reported runtime and needs no credential;
- `configured_adapter` — implemented and a non-secret configuration signal is present;
- `configured_but_adapter_missing` — credentials exist but no executable adapter exists;
- `oauth_skeleton` — signed state foundation exists, token exchange does not;
- `approval_required` — publish capability also needs an immutable candidate and exact human approval;
- `blocked` — no executable route.

Current executable routes are the no-key public research aggregate, Commons search and local Flite only in `local_media`. FAL, Replicate, Stability, ElevenLabs, Deepgram, AssemblyAI, object storage and social provider entries remain adapter targets. A key or OAuth app pair never makes those routes executable by itself.

Autopublishing remains disabled.

## TikTok

Needed:

- approved TikTok developer app;
- OAuth flow;
- content posting permission;
- backend endpoint for token exchange and upload;
- policy review for automated publishing.

Current frontend behavior:

- prepares platform-specific title, description, hashtags, and asset requirements;
- exports a publish pack JSON.

## OAuth Safety Baseline

Current backend behavior:

- connector start URLs require provider client ID, redirect URI, and an OAuth
  state signing secret;
- OAuth state is HMAC-signed and expires;
- callbacks reject missing or invalid state before token exchange;
- connector token vault storage encrypts access/refresh tokens server-side and
  redacts token material from API responses;
- callbacks still stop before token exchange because provider exchange,
  disconnect flows, final user accounts, and provider review are not complete.

Use `HERMEST_OAUTH_STATE_SECRET` for OAuth state signing. `HERMEST_SESSION_SECRET`
can act as a fallback in controlled environments, but production should keep a
dedicated state secret.

Use `HERMEST_TOKEN_ENCRYPTION_KEY` before any backend route stores connector
tokens. Without it, token writes are rejected before storage.

## YouTube Video And Shorts

Needed:

- Google Cloud project;
- YouTube Data API enabled;
- OAuth consent screen;
- upload scope;
- backend endpoint for token exchange and uploads;
- vertical 9:16 asset for Shorts.

Current frontend behavior:

- creates specs for long `16:9` YouTube video;
- creates specs for vertical `9:16` Shorts.

## Instagram Reels

Needed:

- Meta app;
- Instagram professional account;
- connected Facebook page;
- Graph API permissions for content publishing;
- backend endpoint for media container creation and publish.

Current frontend behavior:

- prepares Reels-ready title, description, hashtags, and asset requirements.

## Parser / Research

Current backend capability:

1. Receive a bounded research query.
2. Search the implemented no-key public adapters with per-source timeouts.
3. Return links, facts, media candidates and citations from successful sources.

Still missing:

1. Bind selected results to project/source records.
2. Run rights and quality review before using media or quotes.
3. Mark every asset as usable, restricted or unknown.

## Translator

Future backend job:

1. Receive script and target languages.
2. Create localized scripts, titles, descriptions, hashtags, and subtitles.
3. Preserve technical terms such as Hermest, agents, graph, roadmap, and publish pack.
4. Return warnings where translation may change meaning.

## Media Generator

Future backend job:

1. Receive media brief and board structure.
2. Generate or retrieve images, b-roll, covers, and vertical clips.
3. Store assets with prompts, model names, source URLs, rights status, and usage notes.
4. Return render-ready assets for video generation.
