import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertVideoMagic } from "../../src/media/video-validation.js";

describe("video-validation — MP4 magic-byte check", () => {
  it("accepts valid MP4 ftyp box", () => {
    const validMp4 = Buffer.from([
      0x00, 0x00, 0x00, 0x20, // box size (32 bytes)
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x69, 0x73, 0x6f, 0x6d, // major_brand: 'isom'
      0x00, 0x00, 0x02, 0x00, // minor_version
      0x69, 0x73, 0x6f, 0x6d, // compatible_brands[0]: 'isom'
      0x69, 0x73, 0x6f, 0x32, // compatible_brands[1]: 'iso2'
      0x61, 0x76, 0x63, 0x31, // compatible_brands[2]: 'avc1'
      0x6d, 0x70, 0x34, 0x31  // compatible_brands[3]: 'mp41'
    ]);
    assert.doesNotThrow(() => assertVideoMagic(validMp4), "valid MP4 passes");
  });

  it("accepts MP4 with small leading box", () => {
    const mp4WithLeadingBox = Buffer.from([
      0x00, 0x00, 0x00, 0x08, // first box size (8 bytes)
      0x66, 0x72, 0x65, 0x65, // 'free' box
      0x00, 0x00, 0x00, 0x18, // second box size (24 bytes)
      0x66, 0x74, 0x79, 0x70, // 'ftyp' — MP4 signature
      0x69, 0x73, 0x6f, 0x6d,
      0x00, 0x00, 0x02, 0x00,
      0x69, 0x73, 0x6f, 0x6d
    ]);
    assert.doesNotThrow(() => assertVideoMagic(mp4WithLeadingBox), "MP4 with leading box passes");
  });

  it("rejects non-MP4 bytes (PNG)", () => {
    const pngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ]);
    assert.throws(
      () => assertVideoMagic(pngBytes),
      /not a valid MP4/i,
      "PNG bytes rejected"
    );
  });

  it("rejects non-MP4 bytes (JPEG)", () => {
    const jpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46
    ]);
    assert.throws(
      () => assertVideoMagic(jpegBytes),
      /not a valid MP4/i,
      "JPEG bytes rejected"
    );
  });

  it("rejects too-short buffer", () => {
    const shortBytes = Buffer.from([0x00, 0x00]);
    assert.throws(
      () => assertVideoMagic(shortBytes),
      /not a valid MP4/i,
      "short buffer rejected"
    );
  });

  it("rejects empty buffer", () => {
    const emptyBytes = Buffer.alloc(0);
    assert.throws(
      () => assertVideoMagic(emptyBytes),
      /not a valid MP4/i,
      "empty buffer rejected"
    );
  });

  it("rejects buffer with ftyp at wrong offset", () => {
    const wrongOffset = Buffer.from([
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x66, 0x74, 0x79, 0x70 // 'ftyp' at offset 8 without valid box size
    ]);
    assert.throws(
      () => assertVideoMagic(wrongOffset),
      /not a valid MP4/i,
      "ftyp at wrong offset rejected"
    );
  });

  it("accepts large ftyp box size", () => {
    const largeFtyp = Buffer.from([
      0x00, 0x00, 0x01, 0x00, // box size = 256 bytes
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x69, 0x73, 0x6f, 0x6d,
      0x00, 0x00, 0x02, 0x00
    ]);
    assert.doesNotThrow(() => assertVideoMagic(largeFtyp), "large ftyp box passes");
  });
});
