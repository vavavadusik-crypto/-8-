const FTYP_SIGNATURE = Buffer.from([0x66, 0x74, 0x79, 0x70]); // 'ftyp'
const MIN_MP4_HEADER_BYTES = 12;
const MAX_BOX_SIZE_SCAN = 64;

export function assertVideoMagic(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < MIN_MP4_HEADER_BYTES) {
    throw new RangeError("Video clip is not a valid MP4 file (too short)");
  }

  // MP4 файлы начинаются с ISO base media box. Формат:
  // [4 bytes: box size] [4 bytes: box type] [payload...]
  // Первый или один из первых боксов должен быть 'ftyp' (file type).
  // Ищем 'ftyp' в первых 64 байтах (может быть 'free' или другой бокс перед ним).
  for (let offset = 0; offset + 8 <= bytes.length && offset < MAX_BOX_SIZE_SCAN; ) {
    const boxSize = bytes.readUInt32BE(offset);
    const boxType = bytes.subarray(offset + 4, offset + 8);

    if (boxType.equals(FTYP_SIGNATURE)) {
      // Нашли 'ftyp' — это валидный MP4
      return;
    }

    // Переходим к следующему боксу
    if (boxSize < 8 || boxSize > bytes.length - offset) {
      // Невалидный размер бокса — не MP4
      break;
    }
    offset += boxSize;
  }

  throw new RangeError("Video clip is not a valid MP4 file (no ftyp box found)");
}
