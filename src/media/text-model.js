// Text-модель поверх browser-ai-bridge: браузерный веб-чат (ChatGPT и др.)
// как OpenAI-совместимый бэкенд. Ключей нет — «ключом» служит живая
// залогиненная вкладка Chrome на стороне моста.

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8788/v1";
const REQUEST_TIMEOUT_MS = 300000; // веб-чат отвечает медленно — это осознанная цена
const MAX_RESPONSE_BYTES = 1024 * 1024;

function bridgeBaseUrl(env) {
  const configured = typeof env.HERMEST_BRIDGE_URL === "string" ? env.HERMEST_BRIDGE_URL.trim() : "";
  const url = configured || DEFAULT_BRIDGE_URL;
  if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/v1$/.test(url)) {
    throw new RangeError("HERMEST_BRIDGE_URL must point at a local /v1 bridge endpoint");
  }
  return url;
}

export async function describeBridgeAvailability({ env = process.env, fetchImpl = fetch } = {}) {
  let baseUrl;
  try {
    baseUrl = bridgeBaseUrl(env);
  } catch (error) {
    return { status: "missing", provider: "browser-bridge", reason: error.message };
  }
  try {
    const response = await fetchWithTimeout(fetchImpl, `${new URL(baseUrl).origin}/health`, {}, 5000);
    if (!response.ok) {
      return { status: "missing", provider: "browser-bridge", reason: `bridge health returned ${response.status}` };
    }
    return { status: "executable", provider: "browser-bridge" };
  } catch {
    return {
      status: "missing",
      provider: "browser-bridge",
      reason: "browser-ai-bridge is not running; start it in workspace/browser-ai-bridge (npm start)"
    };
  }
}

export function createBridgeTextModel({ env = process.env, fetchImpl = fetch } = {}) {
  const baseUrl = bridgeBaseUrl(env);
  const model = typeof env.HERMEST_BRIDGE_MODEL === "string" && env.HERMEST_BRIDGE_MODEL.trim()
    ? env.HERMEST_BRIDGE_MODEL.trim()
    : "chatgpt";
  return {
    provider: "browser-bridge",
    model,
    async complete({ system, prompt, signal } = {}) {
      const text = String(prompt ?? "").trim();
      if (!text) throw new RangeError("Text model prompt is required");
      const messages = [];
      if (system) messages.push({ role: "system", content: String(system) });
      messages.push({ role: "user", content: text });
      const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages }),
        signal
      }, REQUEST_TIMEOUT_MS);
      if (!response.ok) {
        throw new RangeError(`browser bridge completion failed with status ${response.status}`);
      }
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
        throw new RangeError("browser bridge response exceeds the allowed size");
      }
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        throw new RangeError("browser bridge response is not valid JSON");
      }
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new RangeError("browser bridge returned an empty completion");
      }
      return content;
    }
  };
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const upstreamSignal = options.signal;
  const onAbort = () => controller.abort();
  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort();
    else upstreamSignal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (upstreamSignal) upstreamSignal.removeEventListener("abort", onAbort);
  }
}
