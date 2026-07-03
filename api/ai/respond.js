import { readJson, requireMethods, sendJson } from "../_lib/http.js";

const DEFAULT_MODEL = "gpt-4.1-mini";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export default async function handler(request, response) {
  if (!requireMethods(request, response, ["POST"])) return;

  try {
    const body = await readJson(request);
    const provider = normalizeProvider(body.provider);
    if (provider !== "openai") {
      sendJson(response, 400, {
        ok: false,
        error: "unsupported_ai_provider",
        supportedProviders: ["openai"]
      });
      return;
    }

    const apiKey = extractApiKey(request.headers || {});
    if (!apiKey) {
      sendJson(response, 401, {
        ok: false,
        error: "api_key_required",
        note: "Send a user-owned OpenAI API key in the Authorization header."
      });
      return;
    }

    const prompt = String(body.prompt || "").trim();
    if (!prompt) {
      sendJson(response, 400, {
        ok: false,
        error: "prompt_required"
      });
      return;
    }

    const model = sanitizeModel(body.model) || DEFAULT_MODEL;
    const upstreamPayload = {
      model,
      input: buildInput(prompt, body.context)
    };
    const temperature = sanitizeNumber(body.temperature, 0, 2);
    if (temperature !== null) upstreamPayload.temperature = temperature;
    const maxOutputTokens = sanitizeInteger(body.maxOutputTokens, 64, 6000);
    if (maxOutputTokens !== null) upstreamPayload.max_output_tokens = maxOutputTokens;

    const upstream = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(upstreamPayload)
    });
    const text = await upstream.text();
    const data = parseJson(text);

    if (!upstream.ok) {
      sendJson(response, upstream.status || 502, {
        ok: false,
        error: "ai_provider_error",
        provider,
        providerStatus: upstream.status,
        message: sanitizeProviderMessage(data?.error?.message || data?.error || text)
      });
      return;
    }

    sendJson(response, 200, {
      ok: true,
      provider,
      model,
      text: extractOutputText(data),
      responseId: data?.id || "",
      usage: data?.usage || null
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: "ai_response_failed",
      message: sanitizeProviderMessage(error?.message || "unknown_error")
    });
  }
}

function normalizeProvider(provider) {
  return String(provider || "openai").trim().toLowerCase();
}

function extractApiKey(headers) {
  const authorization = headers.authorization || headers.Authorization || "";
  const match = String(authorization).match(/^Bearer\s+(.+)$/i);
  const value = match?.[1] || headers["x-openai-api-key"] || headers["X-OpenAI-API-Key"] || "";
  return String(value).trim();
}

function sanitizeModel(model) {
  const value = String(model || "").trim();
  if (!value || value.length > 96) return "";
  return /^[a-zA-Z0-9._:-]+$/.test(value) ? value : "";
}

function sanitizeNumber(value, min, max) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, number));
}

function sanitizeInteger(value, min, max) {
  const number = sanitizeNumber(value, min, max);
  return number === null ? null : Math.round(number);
}

function buildInput(prompt, context) {
  const cleanContext = String(context || "").trim();
  if (!cleanContext) return prompt;
  return [
    "Hermest Board context:",
    cleanContext,
    "",
    "User task:",
    prompt
  ].join("\n");
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch (_) {
    return {};
  }
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text.trim();
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") parts.push(content.text);
      if (typeof content?.output_text === "string") parts.push(content.output_text);
    }
  }
  return parts.join("\n").trim();
}

function sanitizeProviderMessage(message) {
  return String(message || "")
    .replace(/sk-proj-[a-zA-Z0-9_-]+/g, "[redacted_api_key]")
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted_api_key]")
    .slice(0, 1200);
}
