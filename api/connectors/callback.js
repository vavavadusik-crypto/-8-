import { verifyOAuthState } from "../_lib/oauth-state.js";

export default function handler(request, response) {
  const provider = String(request.query?.provider || "").trim();
  const verification = verifyOAuthState(request.query?.state, { provider });
  if (!verification.ok) {
    response.status(verification.status || 400).json({
      ok: false,
      error: verification.error,
      provider: provider || null,
      hasCode: Boolean(request.query?.code),
      note: "OAuth callback requires a valid signed state before token exchange can run."
    });
    return;
  }

  if (!request.query?.code) {
    response.status(400).json({
      ok: false,
      error: "oauth_code_missing",
      provider: verification.payload.provider,
      stateValid: true,
      note: "OAuth callback received a valid state but no provider authorization code."
    });
    return;
  }

  response.status(501).json({
    ok: false,
    error: "oauth_token_exchange_not_implemented",
    provider: verification.payload.provider,
    stateValid: true,
    hasCode: true,
    note: "OAuth callback state validation passed. Token exchange still needs encrypted token storage and a user account model before public use."
  });
}
