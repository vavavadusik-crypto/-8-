import { readJson, requireMethods, sendJson } from "../_lib/http.js";

const AI_PROVIDERS = {
  openai: {
    label: "OpenAI",
    mode: "responses",
    url: "https://api.openai.com/v1/responses",
    defaultModel: "gpt-4.1-mini"
  },
  groq: {
    label: "Groq",
    mode: "chat_completions",
    url: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "llama-3.3-70b-versatile"
  },
  mistral: {
    label: "Mistral AI",
    mode: "chat_completions",
    url: "https://api.mistral.ai/v1/chat/completions",
    defaultModel: "mistral-small-latest"
  },
  openrouter: {
    label: "OpenRouter",
    mode: "chat_completions",
    url: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "openai/gpt-4.1-mini"
  },
  deepseek: {
    label: "DeepSeek",
    mode: "chat_completions",
    url: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-chat"
  },
  together: {
    label: "Together AI",
    mode: "chat_completions",
    url: "https://api.together.xyz/v1/chat/completions",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo"
  }
};

export default async function handler(request, response) {
  if (!requireMethods(request, response, ["POST"])) return;

  try {
    const body = await readJson(request);
    const provider = normalizeProvider(body.provider);
    const providerConfig = AI_PROVIDERS[provider];
    if (!providerConfig) {
      sendJson(response, 400, {
        ok: false,
        error: "unsupported_ai_provider",
        supportedProviders: Object.keys(AI_PROVIDERS)
      });
      return;
    }

    const apiKey = extractApiKey(request.headers || {});
    if (!apiKey) {
      sendJson(response, 401, {
        ok: false,
        error: "api_key_required",
        note: `Send a user-owned ${providerConfig.label} API key in the Authorization header.`
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

    const model = sanitizeModel(body.model) || providerConfig.defaultModel;
    const upstreamPayload = buildUpstreamPayload(providerConfig, model, prompt, body.context);
    const temperature = sanitizeNumber(body.temperature, 0, 2);
    if (temperature !== null) upstreamPayload.temperature = temperature;
    const maxOutputTokens = sanitizeInteger(body.maxOutputTokens, 64, 6000);
    if (maxOutputTokens !== null) {
      if (providerConfig.mode === "responses") upstreamPayload.max_output_tokens = maxOutputTokens;
      else upstreamPayload.max_tokens = maxOutputTokens;
    }

    const upstream = await fetch(providerConfig.url, {
      method: "POST",
      headers: providerHeaders(provider, apiKey),
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
      providerLabel: providerConfig.label,
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

function providerHeaders(provider, apiKey) {
  const headers = {
    "authorization": `Bearer ${apiKey}`,
    "content-type": "application/json"
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://hermest-board.vercel.app";
    headers["X-Title"] = "Hermest Board";
  }
  return headers;
}

function buildUpstreamPayload(providerConfig, model, prompt, context) {
  const input = buildInput(prompt, context);
  if (providerConfig.mode === "responses") {
    return { model, input };
  }
  return {
    model,
    messages: [
      {
        role: "system",
        content: "You are an AI assistant inside Hermest Board. Be concise, structured, and practical."
      },
      {
        role: "user",
        content: input
      }
    ]
  };
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
  const chatText = data?.choices?.[0]?.message?.content;
  if (typeof chatText === "string") return chatText.trim();
  if (Array.isArray(chatText)) {
    return chatText.map(part => typeof part === "string" ? part : part?.text || "").filter(Boolean).join("\n").trim();
  }
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
