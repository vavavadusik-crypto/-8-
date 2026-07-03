import { getOAuthStateStatus } from "../_lib/oauth-state.js";
import { getTokenVaultStatus } from "../_lib/token-vault.js";

export default function handler(_request, response) {
  response.status(200).json({
    ok: true,
    oauth: getOAuthStateStatus(),
    tokenVault: getTokenVaultStatus(),
    connectors: {
      tiktok: Boolean(process.env.TIKTOK_CLIENT_ID),
      youtube: Boolean(process.env.YOUTUBE_CLIENT_ID),
      instagram: Boolean(process.env.META_APP_ID),
      openai: Boolean(process.env.OPENAI_API_KEY)
    },
    publishingEnabled: Boolean(
      process.env.TIKTOK_CLIENT_ID ||
      process.env.YOUTUBE_CLIENT_ID ||
      process.env.META_APP_ID
    )
  });
}
