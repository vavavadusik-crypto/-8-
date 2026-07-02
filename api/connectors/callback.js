export default function handler(request, response) {
  response.status(501).json({
    ok: false,
    error: "oauth_callback_not_implemented",
    provider: request.query?.provider || null,
    hasCode: Boolean(request.query?.code),
    note: "OAuth callback needs server-side sessions, token exchange, encrypted token storage, and a user account model before public use."
  });
}
