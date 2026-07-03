export default function handler(_request, response) {
  response.status(200).json({
    ok: true,
    userVisibleFields: [
      {
        key: "displayName",
        label: "Display name",
        secret: false
      },
      {
        key: "preferredLanguages",
        label: "Publishing languages",
        secret: false
      },
      {
        key: "youtubeChannel",
        label: "YouTube channel",
        secret: false
      },
      {
        key: "tiktokAccount",
        label: "TikTok account",
        secret: false
      },
      {
        key: "instagramAccount",
        label: "Instagram professional account",
        secret: false
      },
      {
        key: "openaiApiKey",
        label: "User-owned OpenAI API key for BYOK AI requests",
        secret: true,
        browserOnly: true
      },
      {
        key: "personalApiKeys",
        label: "Optional user-owned API keys for parser/media/translation/workflow modules",
        secret: true,
        browserOnly: true
      }
    ],
    hiddenServerSideSecrets: [
      "YOUTUBE_CLIENT_SECRET",
      "TIKTOK_CLIENT_SECRET",
      "META_APP_SECRET",
      "OPENAI_API_KEY",
      "DATABASE_URL",
      "BLOB_READ_WRITE_TOKEN"
    ],
    note: "Users should connect platform accounts through OAuth. Alpha BYOK keys are user-owned browser settings; owner secrets and platform app secrets must stay hidden server-side."
  });
}
