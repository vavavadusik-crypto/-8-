export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const pack = typeof request.body === "object" && request.body ? request.body : {};
  const missing = [];

  if (pack.schema !== "hermest.publish.pack.v1") missing.push("schema");
  if (!pack.title) missing.push("title");
  if (!Array.isArray(pack.platforms)) missing.push("platforms");
  if (!Array.isArray(pack.languages)) missing.push("languages");
  if (!pack.script) missing.push("script");
  if (!pack.mediaBrief) missing.push("mediaBrief");

  response.status(missing.length ? 422 : 200).json({
    ok: missing.length === 0,
    missing,
    publishable: false,
    note: "Validation only. Real platform publishing requires OAuth connectors and explicit approval workflow."
  });
}
