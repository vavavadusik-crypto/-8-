const PROVIDERS = {
  youtube: {
    clientIdEnv: "YOUTUBE_CLIENT_ID",
    redirectEnv: "YOUTUBE_REDIRECT_URI",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scope: "https://www.googleapis.com/auth/youtube.upload",
    extra: {
      access_type: "offline",
      prompt: "consent"
    }
  },
  tiktok: {
    clientIdEnv: "TIKTOK_CLIENT_ID",
    redirectEnv: "TIKTOK_REDIRECT_URI",
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    scope: "video.upload,video.publish"
  },
  instagram: {
    clientIdEnv: "META_APP_ID",
    redirectEnv: "META_REDIRECT_URI",
    authUrl: "https://www.facebook.com/v20.0/dialog/oauth",
    scope: "instagram_basic,instagram_content_publish,pages_show_list"
  }
};

export default function handler(request, response) {
  const provider = String(request.query?.provider || "").trim();
  const config = PROVIDERS[provider];

  if (!config) {
    response.status(400).json({ ok: false, error: "unknown_provider", providers: Object.keys(PROVIDERS) });
    return;
  }

  const clientId = process.env[config.clientIdEnv];
  const redirectUri = process.env[config.redirectEnv];

  if (!clientId || !redirectUri) {
    response.status(501).json({
      ok: false,
      error: "connector_not_configured",
      provider,
      missing: [!clientId && config.clientIdEnv, !redirectUri && config.redirectEnv].filter(Boolean),
      note: "This endpoint builds a per-user OAuth start URL after server-side connector env vars are configured."
    });
    return;
  }

  const state = crypto.randomUUID();
  const url = new URL(config.authUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);
  for (const [key, value] of Object.entries(config.extra || {})) url.searchParams.set(key, value);

  response.status(200).json({
    ok: true,
    provider,
    authUrl: url.toString(),
    state,
    note: "Token exchange and token storage are intentionally not implemented yet. They need database-backed sessions."
  });
}
