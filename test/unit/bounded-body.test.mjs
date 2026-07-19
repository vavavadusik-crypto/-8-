import assert from "node:assert/strict";
import test from "node:test";

import { readBoundedBytes, readBoundedJson } from "../../src/media/bounded-body.js";

function streamedResponse(chunks, { status = 200 } = {}) {
  let served = 0;
  return {
    response: {
      ok: status >= 200 && status < 300,
      status,
      body: (async function* stream() {
        for (const chunk of chunks) {
          served += 1;
          yield chunk;
        }
      })()
    },
    servedChunks: () => served
  };
}

test("readBoundedBytes aborts an oversized stream before consuming it fully", async () => {
  const chunk = Buffer.alloc(600, 1);
  const { response, servedChunks } = streamedResponse([chunk, chunk, chunk, chunk]);
  await assert.rejects(readBoundedBytes(response, 1000, "test payload"), /exceeds the allowed size/);
  assert.equal(servedChunks(), 2);
});

test("readBoundedBytes returns concatenated bytes within the limit", async () => {
  const { response } = streamedResponse([Buffer.from([1, 2]), Buffer.from([3])]);
  const bytes = await readBoundedBytes(response, 10, "test payload");
  assert.deepEqual(bytes, Buffer.from([1, 2, 3]));
});

test("readBoundedBytes falls back to arrayBuffer for bodies without a stream and still enforces the limit", async () => {
  const big = Buffer.alloc(64, 2);
  const response = {
    ok: true,
    status: 200,
    arrayBuffer: async () => big.buffer.slice(big.byteOffset, big.byteOffset + big.byteLength)
  };
  await assert.rejects(readBoundedBytes(response, 10, "fallback payload"), /exceeds the allowed size/);
  const small = { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([7]).buffer };
  assert.deepEqual(await readBoundedBytes(small, 10, "fallback payload"), Buffer.from([7]));
});

test("readBoundedJson parses within the limit and fails closed on junk", async () => {
  const { response } = streamedResponse([Buffer.from('{"ok":true}')]);
  assert.deepEqual(await readBoundedJson(response, 100, "test json"), { ok: true });
  const junk = streamedResponse([Buffer.from("not-json")]);
  await assert.rejects(readBoundedJson(junk.response, 100, "test json"), /not valid JSON/);
  const oversized = streamedResponse([Buffer.alloc(200, 65)]);
  await assert.rejects(readBoundedJson(oversized.response, 100, "test json"), /exceeds the allowed size/);
});
