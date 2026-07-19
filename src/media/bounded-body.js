// Provider responses must never be fully materialized before the size check:
// a hostile or broken upstream could otherwise exhaust memory. The stream is
// aborted as soon as the accumulated size crosses the limit; mock responses
// without a body stream fall back to arrayBuffer with the same enforced limit.
export async function readBoundedBytes(response, limit, label) {
  const body = response?.body;
  if (body && typeof body[Symbol.asyncIterator] === "function") {
    const chunks = [];
    let total = 0;
    for await (const chunk of body) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.length;
      if (total > limit) throw new RangeError(`${label} exceeds the allowed size`);
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > limit) throw new RangeError(`${label} exceeds the allowed size`);
  return bytes;
}

export async function readBoundedJson(response, limit, label) {
  const bytes = await readBoundedBytes(response, limit, label);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new RangeError(`${label} is not valid JSON`);
  }
}
