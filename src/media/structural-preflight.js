const DEFAULT_LIMITS = Object.freeze({
  maxDepth: 64,
  maxNodes: 20000,
  maxArrayLength: 1000,
  maxObjectKeys: 500,
  maxKeyBytes: 512,
  maxTotalStringBytes: 1572864
});
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function validateJsonStructure(root, limits = {}) {
  const policy = normalizeLimits(limits);
  const stack = [{ value: root, depth: 0, label: "$" }];
  const seen = new WeakSet();
  let nodes = 0;
  let stringBytes = 0;

  while (stack.length > 0) {
    const { value, depth, label } = stack.pop();
    nodes += 1;
    if (nodes > policy.maxNodes) {
      throw new RangeError(`Board structure exceeds maximum node count ${policy.maxNodes}`);
    }
    if (depth > policy.maxDepth) {
      throw new RangeError(`Board structure exceeds maximum depth ${policy.maxDepth}`);
    }

    if (value === null || typeof value === "boolean") continue;
    if (typeof value === "string") {
      stringBytes += Buffer.byteLength(value, "utf8");
      if (stringBytes > policy.maxTotalStringBytes) {
        throw new RangeError(`Board strings exceed ${policy.maxTotalStringBytes} bytes`);
      }
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new TypeError(`Board contains a non-finite number at ${label}`);
      continue;
    }
    if (typeof value !== "object") {
      throw new TypeError(`Board contains unsupported ${typeof value} value at ${label}`);
    }
    if (seen.has(value)) throw new TypeError("Board structure contains a cycle or shared object reference");
    seen.add(value);

    if (Array.isArray(value)) {
      if (value.length > policy.maxArrayLength) {
        throw new RangeError(`Board array exceeds maximum length ${policy.maxArrayLength}`);
      }
      for (let index = value.length - 1; index >= 0; index -= 1) {
        if (!(index in value)) throw new TypeError(`Board contains a sparse array at ${label}`);
        stack.push({ value: value[index], depth: depth + 1, label: `${label}[${index}]` });
      }
      continue;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`Board contains a non-plain object at ${label}`);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError(`Board contains symbol keys at ${label}`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors);
    if (keys.length > policy.maxObjectKeys) {
      throw new RangeError(`Board object exceeds maximum key count ${policy.maxObjectKeys}`);
    }
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      const descriptor = descriptors[key];
      if (FORBIDDEN_KEYS.has(key)) throw new TypeError(`Board contains forbidden key ${key}`);
      if (Buffer.byteLength(key, "utf8") > policy.maxKeyBytes) {
        throw new RangeError(`Board key exceeds ${policy.maxKeyBytes} bytes`);
      }
      if (descriptor.get || descriptor.set) {
        throw new TypeError(`Board contains an accessor property at ${label}.${key}`);
      }
      stack.push({ value: descriptor.value, depth: depth + 1, label: `${label}.${key}` });
    }
  }

  return {
    nodes,
    stringBytes,
    maxDepth: policy.maxDepth
  };
}

function normalizeLimits(overrides) {
  const source = overrides && typeof overrides === "object" ? overrides : {};
  return Object.fromEntries(Object.entries(DEFAULT_LIMITS).map(([key, fallback]) => {
    const value = Number(source[key] ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${key} must be a positive integer`);
    return [key, value];
  }));
}
