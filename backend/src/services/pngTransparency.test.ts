import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";
import { makeQrPngWhitePixelsTransparent } from "./pngTransparency";

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

function createIndexedPng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(3, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const palette = Buffer.from([255, 255, 255, 0, 0, 0, 230, 20, 120]);
  const rows = Buffer.from([0, 0, 1, 2]);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("PLTE", palette),
    pngChunk("IDAT", zlib.deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function readRgbaPixels(buffer: Buffer): Buffer {
  const idatChunks: Buffer[] = [];
  let width = 0;
  let height = 0;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = buffer.subarray(dataStart, dataStart + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8);
      assert.equal(data[9], 6);
    }
    if (type === "IDAT") idatChunks.push(data);
    offset = dataStart + length + 4;
  }
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(width * height * 4);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    assert.equal(inflated[inputOffset], 0);
    inputOffset += 1;
    inflated.copy(pixels, y * stride, inputOffset, inputOffset + stride);
    inputOffset += stride;
  }
  return pixels;
}

test("makeQrPngWhitePixelsTransparent removes opaque white QR background only", () => {
  const source = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAMAAAABCAIAAACUgoPjAAAAEklEQVR4nGP4//8/AwPDM5EKABtEBHAMTmOfAAAAAElFTkSuQmCC",
    "base64"
  );
  const result = makeQrPngWhitePixelsTransparent(source);
  const pixels = readRgbaPixels(result);

  assert.deepEqual([...pixels.subarray(0, 4)], [255, 255, 255, 0]);
  assert.deepEqual([...pixels.subarray(4, 8)], [0, 0, 0, 255]);
  assert.deepEqual([...pixels.subarray(8, 12)], [230, 20, 120, 255]);
});

test("makeQrPngWhitePixelsTransparent supports indexed QR PNGs", () => {
  const result = makeQrPngWhitePixelsTransparent(createIndexedPng());
  const pixels = readRgbaPixels(result);

  assert.deepEqual([...pixels.subarray(0, 4)], [255, 255, 255, 0]);
  assert.deepEqual([...pixels.subarray(4, 8)], [0, 0, 0, 255]);
  assert.deepEqual([...pixels.subarray(8, 12)], [230, 20, 120, 255]);
});
