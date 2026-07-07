import zlib from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = new Uint32Array(256).map((_value, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  return pb <= pc ? up : upLeft;
}

function isWhiteQrPixel(r: number, g: number, b: number, a: number): boolean {
  return a > 0 && r >= 245 && g >= 245 && b >= 245;
}

function bytesPerPixelForColorType(colorType: number): number {
  if (colorType === 0 || colorType === 3) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  return 0;
}

function decodePngRows(inflated: Buffer, width: number, height: number, bytesPerPixel: number): Buffer {
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset + x];
      const left = x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[(y - 1) * stride + x - bytesPerPixel] : 0;
      if (filter === 0) pixels[y * stride + x] = raw;
      else if (filter === 1) pixels[y * stride + x] = (raw + left) & 0xff;
      else if (filter === 2) pixels[y * stride + x] = (raw + up) & 0xff;
      else if (filter === 3) pixels[y * stride + x] = (raw + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) pixels[y * stride + x] = (raw + paethPredictor(left, up, upLeft)) & 0xff;
      else throw new Error("不支持的 PNG filter");
    }
    inputOffset += stride;
  }
  return pixels;
}

function encodePngRows(rgba: Buffer, width: number, height: number): Buffer {
  const stride = width * 4;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (stride + 1);
    rows[rowOffset] = 0;
    rgba.copy(rows, rowOffset + 1, y * stride, y * stride + stride);
  }
  return rows;
}

export function makeQrPngWhitePixelsTransparent(input: Buffer): Buffer {
  if (!input.subarray(0, 8).equals(PNG_SIGNATURE)) return input;

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let transparency: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  const idatChunks: Buffer<ArrayBufferLike>[] = [];
  let offset = 8;
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = input.subarray(dataStart, dataStart + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      transparency = data;
    }
    offset = dataStart + length + 4;
  }

  const sourceBytesPerPixel = bytesPerPixelForColorType(colorType);
  if (!width || !height || bitDepth !== 8 || interlace !== 0 || !sourceBytesPerPixel) return input;
  const sourcePixels = decodePngRows(zlib.inflateSync(Buffer.concat(idatChunks)), width, height, sourceBytesPerPixel);
  const rgba = Buffer.alloc(width * height * 4);
  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < sourcePixels.length; sourceIndex += sourceBytesPerPixel, targetIndex += 4) {
    let r = sourcePixels[sourceIndex];
    let g = colorType === 0 ? r : sourcePixels[sourceIndex + 1];
    let b = colorType === 0 ? r : sourcePixels[sourceIndex + 2];
    let a = 255;
    if (colorType === 3) {
      const paletteIndex = sourcePixels[sourceIndex];
      const paletteOffset = paletteIndex * 3;
      if (paletteOffset + 2 >= palette.length) return input;
      r = palette[paletteOffset];
      g = palette[paletteOffset + 1];
      b = palette[paletteOffset + 2];
      a = transparency[paletteIndex] ?? 255;
    } else if (colorType === 4) {
      a = sourcePixels[sourceIndex + 1];
    } else if (colorType === 6) {
      a = sourcePixels[sourceIndex + 3];
    }
    rgba[targetIndex] = r;
    rgba[targetIndex + 1] = g;
    rgba[targetIndex + 2] = b;
    rgba[targetIndex + 3] = isWhiteQrPixel(r, g, b, a) ? 0 : a;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(encodePngRows(rgba, width, height));
  return Buffer.concat([PNG_SIGNATURE, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}
