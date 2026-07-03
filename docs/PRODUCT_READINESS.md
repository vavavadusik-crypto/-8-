# Product Readiness

## Current Status

Stage: alpha deploy-ready product prototype with backend API contracts.

The app is strong enough for:

- demos;
- user testing;
- explaining the product direction;
- recording concept videos;
- validating whether the board workflow feels useful.

It is not yet ready for:

- real autonomous publishing;
- paid customer accounts;
- team collaboration;
- storing private production data on public hosting;
- platform OAuth flows.

## Done

- Interactive board;
- movable cards;
- card images;
- script generation;
- browser voiceover;
- browser recording;
- plan and roadmap fields;
- publish pack generation;
- platform/tool selection;
- JSON export;
- Vite production build;
- Vercel, Netlify, Docker, and static hosting configs;
- minimal Vercel API skeleton;
- project, asset, job, audit, storage status, and agent-plan API contracts;
- safe local JSON storage fallback;
- production guard that blocks unsafe public Vercel writes without durable storage;
- bootstrap owner-token write guard for temporary demo storage;
- API smoke checks for product routes and guards;
- basic smoke validation.

## Required Before Beta

- durable project storage outside `localStorage`;
- user accounts;
- OAuth connector backend;
- server-side secrets;
- asset storage;
- job queue;
- publish approval workflow;
- real parser, translator, and media generation workers;
- error reporting;
- usage analytics;
- automated browser tests.

## Beta Gate

The next hard gate is choosing and connecting a durable storage/auth stack. Until
that is done, the public site should be treated as a demo and recording tool, not
as a private multi-user SaaS.

## Required Before Paid Launch

- billing;
- customer onboarding;
- terms/privacy pages;
- data retention controls;
- content rights checks;
- platform policy compliance;
- backups;
- monitoring and alerting;
- abuse prevention;
- rate limiting;
- support workflow.
