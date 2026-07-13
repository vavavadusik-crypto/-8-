const RASTER_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif|avif);base64,[a-z0-9+/]+={0,2}$/i;
const SVG_DATA_URL = /^data:image\/svg\+xml(?:;charset=[^;,]+)?,/i;
const MAX_INLINE_IMAGE_LENGTH = 900000;

export function normalizeCardImageUrl(value) {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  if (!candidate) return "";

  if (RASTER_DATA_URL.test(candidate)) return candidate;
  if (SVG_DATA_URL.test(candidate)) return normalizeSvgDataUrl(candidate);

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.href;
  } catch (_) {
    return "";
  }
}

function normalizeSvgDataUrl(candidate) {
  if (candidate.length > MAX_INLINE_IMAGE_LENGTH) return "";
  const comma = candidate.indexOf(",");
  if (comma < 0) return "";

  let svg;
  try {
    svg = decodeURIComponent(candidate.slice(comma + 1));
  } catch (_) {
    return "";
  }

  if (!/^\s*<svg\b/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) return "";
  if (/<\s*(?:script|foreignObject|iframe|object|embed|image|use)\b/i.test(svg)) return "";
  if (/\bon[a-z]+\s*=|javascript:|data:text\/html|@import|expression\s*\(/i.test(svg)) return "";
  if (/url\s*\(\s*["']?(?!#)/i.test(svg)) return "";
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) return "";
  return candidate;
}

export function renderCardImage(container, value) {
  const document = container?.ownerDocument;
  if (!document || typeof container.replaceChildren !== "function") {
    throw new TypeError("renderCardImage requires a DOM container");
  }

  const safeUrl = normalizeCardImageUrl(value);
  if (safeUrl) {
    const image = document.createElement("img");
    image.src = safeUrl;
    image.alt = "";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    container.replaceChildren(image);
    return true;
  }

  const placeholder = document.createElement("div");
  placeholder.className = "media-placeholder";
  const icon = document.createElement("span");
  icon.textContent = "▧";
  const label = document.createElement("span");
  label.textContent = "добавить фото";
  placeholder.replaceChildren(icon, label);
  container.replaceChildren(placeholder);
  return false;
}
