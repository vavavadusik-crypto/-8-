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
    note: "Users should connect accounts through OAuth. They should not see owner secrets or paste platform app secrets into the browser."
  });
}
