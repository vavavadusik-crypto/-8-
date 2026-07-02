# Connectors

This document describes what must be connected before Hermest Board can publish automatically.

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

## Parser

Future backend job:

1. Receive board topic and media brief.
2. Search approved sources.
3. Extract links, facts, media candidates, and citations.
4. Store source metadata in the project.
5. Mark every asset as usable, restricted, or unknown.

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
