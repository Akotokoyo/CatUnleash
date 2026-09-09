import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

export const DEFAULT_KEY = { r: 255, g: 0, b: 255 };
export const CORNER_BLOCK_SIZE = 16;

/** @param {Buffer} buf */
export function isJpegBuffer(buf) {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/** @param {Buffer} buf */
export function isPngBuffer(buf) {
  return (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

/**
 * @param {string} inputPath
 * @returns {{ png: PNG, format: 'png' | 'jpeg' }}
 */
export function readSheetImage(inputPath) {
  const buf = readFileSync(inputPath);

  if (isPngBuffer(buf)) {
    return { png: PNG.sync.read(buf), format: 'png' };
  }

  if (isJpegBuffer(buf)) {
    const decoded = jpeg.decode(buf, { useTArray: true });
    const png = new PNG({ width: decoded.width, height: decoded.height });
    png.data = Buffer.from(decoded.data);
    return { png, format: 'jpeg' };
  }

  throw new Error(`Formato non supportato: ${inputPath} (atteso PNG o JPEG)`);
}

/**
 * Media RGB su un blocco quadrato.
 * @param {PNG} png
 * @param {number} x
 * @param {number} y
 * @param {number} size
 */
export function meanRgbBlock(png, x, y, size) {
  const bw = Math.min(size, png.width - x);
  const bh = Math.min(size, png.height - y);
  if (bw <= 0 || bh <= 0) {
    throw new Error(`Blocco angolo fuori canvas: x=${x} y=${y} size=${size}`);
  }

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;

  for (let py = y; py < y + bh; py++) {
    for (let px = x; px < x + bw; px++) {
      const i = (py * png.width + px) * 4;
      r += png.data[i];
      g += png.data[i + 1];
      b += png.data[i + 2];
      n++;
    }
  }

  return {
    r: Math.round(r / n),
    g: Math.round(g / n),
    b: Math.round(b / n),
  };
}

/** @param {{ r: number, g: number, b: number }} a @param {{ r: number, g: number, b: number }} b */
export function rgbDistance(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Stima il colore chroma dagli angoli (blocchi 16×16).
 * @param {PNG} png
 * @param {number} [blockSize]
 */
export function detectBackgroundKey(png, blockSize = CORNER_BLOCK_SIZE) {
  const bw = Math.min(blockSize, png.width);
  const bh = Math.min(blockSize, png.height);

  const corners = [
    { name: 'tl', ...meanRgbBlock(png, 0, 0, blockSize) },
    { name: 'tr', ...meanRgbBlock(png, png.width - bw, 0, blockSize) },
    { name: 'bl', ...meanRgbBlock(png, 0, png.height - bh, blockSize) },
    { name: 'br', ...meanRgbBlock(png, png.width - bw, png.height - bh, blockSize) },
  ];

  const key = {
    r: Math.round(corners.reduce((s, c) => s + c.r, 0) / corners.length),
    g: Math.round(corners.reduce((s, c) => s + c.g, 0) / corners.length),
    b: Math.round(corners.reduce((s, c) => s + c.b, 0) / corners.length),
  };

  let spread = 0;
  for (let i = 0; i < corners.length; i++) {
    for (let j = i + 1; j < corners.length; j++) {
      spread = Math.max(spread, rgbDistance(corners[i], corners[j]));
    }
  }

  return { key, corners, spread };
}

/** @param {PNG} png @param {string} outputPath */
export function writePng(png, outputPath) {
  writeFileSync(outputPath, PNG.sync.write(png));
}

/**
 * @param {string} inputPath
 * @param {string} [outputPath]
 * @returns {{ outputPath: string, format: 'png' | 'jpeg', key: { r: number, g: number, b: number }, spread: number }}
 */
export function normalizeSheet(inputPath, outputPath) {
  const { png, format } = readSheetImage(inputPath);
  const out =
    outputPath ??
    join(dirname(inputPath), `${basename(inputPath).replace(/\.(png|jpe?g)$/i, '')}_normalized.png`);

  writePng(png, out);
  const { key, spread } = detectBackgroundKey(png);

  return { outputPath: out, format, key, spread };
}
