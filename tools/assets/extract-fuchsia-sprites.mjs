#!/usr/bin/env node
/**
 * Estrae sprite da un foglio con sfondo chroma (default #ff00ff).
 * Accetta PNG veri e JPEG con estensione .png; stima il colore sfondo dagli angoli.
 *
 * Uso:
 *   node tools/assets/extract-fuchsia-sprites.mjs input.png --out out-dir --names a.png,b.png
 *   node tools/assets/extract-fuchsia-sprites.mjs input.png --size 256 --out out-dir
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import {
  DEFAULT_KEY,
  detectBackgroundKey,
  readSheetImage,
} from './sheet-image.mjs';

const DEFAULT_SIZE = 100;
const DEFAULT_TOLERANCE = 48;
const DEFAULT_MIN_AREA = 500;

/**
 * @param {string} inputPath
 * @param {{
 *   size?: number,
 *   outDir?: string,
 *   names?: string[],
 *   tolerance?: number,
 *   minArea?: number,
 *   key?: { r: number, g: number, b: number },
 *   detectKey?: boolean,
 * }} [opts]
 * @returns {{
 *   files: string[],
 *   boxes: {x:number,y:number,w:number,h:number,area:number}[],
 *   key: { r: number, g: number, b: number },
 *   keySpread: number,
 *   sourceFormat: 'png' | 'jpeg',
 * }}
 */
export function extractFuchsiaSprites(inputPath, opts = {}) {
  const size = opts.size ?? DEFAULT_SIZE;
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const minArea = opts.minArea ?? DEFAULT_MIN_AREA;
  const detectKey = opts.detectKey ?? true;
  const outDir = opts.outDir ?? join(dirname(inputPath), basename(inputPath, '.png') + '_sprites');

  const { png: src, format: sourceFormat } = readSheetImage(inputPath);
  const { width, height, data } = src;

  let key = opts.key ?? DEFAULT_KEY;
  let keySpread = 0;

  if (detectKey && !opts.key) {
    const detected = detectBackgroundKey(src);
    key = detected.key;
    keySpread = detected.spread;
  }

  const mask = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    mask[i] = isKey(data[o], data[o + 1], data[o + 2], key, tolerance) ? 0 : 1;
  }

  let components = connectedComponents(mask, width, height, minArea);
  if (components.length) {
    const maxArea = Math.max(...components.map((c) => c.area));
    components = components.filter((c) => c.area >= maxArea * 0.05);
  }
  // ordine lettura: top→bottom, left→right (stessa riga se cy vicini)
  components.sort((a, b) => {
    const cyA = a.y + a.h / 2;
    const cyB = b.y + b.h / 2;
    if (Math.abs(cyA - cyB) > Math.min(a.h, b.h) * 0.45) return cyA - cyB;
    return a.x - b.x;
  });

  mkdirSync(outDir, { recursive: true });
  const files = [];
  const boxes = [];

  for (let i = 0; i < components.length; i++) {
    const c = components[i];
    boxes.push({ x: c.x, y: c.y, w: c.w, h: c.h, area: c.area });

    const cropped = cropWithKeyAlpha(data, width, c, key, tolerance);
    const square = fitInSquare(cropped, size);

    const name = opts.names?.[i] ?? `${String(i + 1).padStart(2, '0')}.png`;
    const outPath = join(outDir, name);
    writeFileSync(outPath, PNG.sync.write(square));
    files.push(outPath);
  }

  return { files, boxes, key, keySpread, sourceFormat };
}

function isKey(r, g, b, key, tolerance) {
  return (
    Math.abs(r - key.r) <= tolerance &&
    Math.abs(g - key.g) <= tolerance &&
    Math.abs(b - key.b) <= tolerance
  );
}

function isMagentaKey(key) {
  return key.r > 80 && key.b > 80 && key.g < key.r * 0.6 && key.g < key.b * 0.6;
}

/** Key duro: dentro tolerance → trasparente; altrimenti opaco + despill verso il key. */
function keyedRgba(r, g, b, a, key, tolerance) {
  if (a === 0 || isKey(r, g, b, key, tolerance)) return [0, 0, 0, 0];

  if (isMagentaKey(key)) {
    const spill = Math.max(0, Math.min(r, b) - g);
    r = Math.max(0, r - spill);
    b = Math.max(0, b - spill);
  }

  return [r, g, b, 255];
}

function connectedComponents(mask, width, height, minArea) {
  const visited = new Uint8Array(width * height);
  const out = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i] || visited[i]) continue;

      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let area = 0;
      const stack = [i];
      visited[i] = 1;

      while (stack.length) {
        const cur = stack.pop();
        const cx = cur % width;
        const cy = (cur / width) | 0;
        area++;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;

        if (cx > 0) push(cur - 1);
        if (cx + 1 < width) push(cur + 1);
        if (cy > 0) push(cur - width);
        if (cy + 1 < height) push(cur + width);
      }

      if (area >= minArea) {
        out.push({
          x: minX,
          y: minY,
          w: maxX - minX + 1,
          h: maxY - minY + 1,
          area,
        });
      }

      function push(ni) {
        if (!visited[ni] && mask[ni]) {
          visited[ni] = 1;
          stack.push(ni);
        }
      }
    }
  }

  return out;
}

function cropWithKeyAlpha(data, srcW, box, key, tolerance) {
  const png = new PNG({ width: box.w, height: box.h });
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const si = ((box.y + y) * srcW + (box.x + x)) * 4;
      const di = (y * box.w + x) * 4;
      const [r, g, b, a] = keyedRgba(
        data[si],
        data[si + 1],
        data[si + 2],
        data[si + 3],
        key,
        tolerance,
      );
      png.data[di] = r;
      png.data[di + 1] = g;
      png.data[di + 2] = b;
      png.data[di + 3] = a;
    }
  }
  return png;
}

/** Scala (max lato = size) e centra in canvas size×size trasparente. */
function fitInSquare(src, size) {
  const scale = Math.min(size / src.width, size / src.height);
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));
  const ox = Math.floor((size - dw) / 2);
  const oy = Math.floor((size - dh) / 2);

  const out = new PNG({ width: size, height: size });
  out.data.fill(0);

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = ((x + 0.5) / scale) - 0.5;
      const sy = ((y + 0.5) / scale) - 0.5;
      const [r, g, b, a] = sampleBilinear(src, sx, sy);
      const di = ((oy + y) * size + (ox + x)) * 4;
      out.data[di] = r;
      out.data[di + 1] = g;
      out.data[di + 2] = b;
      out.data[di + 3] = a;
    }
  }
  return out;
}

function sampleBilinear(src, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = x - x0;
  const fy = y - y0;

  const c00 = sampleClamp(src, x0, y0);
  const c10 = sampleClamp(src, x1, y0);
  const c01 = sampleClamp(src, x0, y1);
  const c11 = sampleClamp(src, x1, y1);

  const p00 = premult(c00);
  const p10 = premult(c10);
  const p01 = premult(c01);
  const p11 = premult(c11);

  const out = [0, 0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const top = p00[k] * (1 - fx) + p10[k] * fx;
    const bot = p01[k] * (1 - fx) + p11[k] * fx;
    out[k] = top * (1 - fy) + bot * fy;
  }

  const a = out[3];
  if (a < 1e-6) return [0, 0, 0, 0];
  return [
    Math.round((out[0] * 255) / a),
    Math.round((out[1] * 255) / a),
    Math.round((out[2] * 255) / a),
    Math.round(a),
  ];
}

function premult([r, g, b, a]) {
  const f = a / 255;
  return [r * f, g * f, b * f, a];
}

function sampleClamp(src, x, y) {
  if (x < 0 || y < 0 || x >= src.width || y >= src.height) return [0, 0, 0, 0];
  const i = (y * src.width + x) * 4;
  return [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]];
}

function parseKey(value) {
  const parts = value.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    throw new Error(`--key richiede r,g,b (0-255), ricevuto: ${value}`);
  }
  return { r: parts[0], g: parts[1], b: parts[2] };
}

function formatKey(key) {
  const hex = `#${[key.r, key.g, key.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  return `rgb(${key.r},${key.g},${key.b}) ${hex}`;
}

// --- CLI ---
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const argv = process.argv.slice(2);
  const positional = [];
  const flags = { detectKey: true };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--size') flags.size = Number(argv[++i]);
    else if (a === '--out') flags.out = argv[++i];
    else if (a === '--names') flags.names = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--tolerance') flags.tolerance = Number(argv[++i]);
    else if (a === '--min-area') flags.minArea = Number(argv[++i]);
    else if (a === '--key') flags.key = parseKey(argv[++i]);
    else if (a === '--no-detect-key') flags.detectKey = false;
    else if (a.startsWith('-')) {
      console.error(`Flag sconosciuto: ${a}`);
      process.exit(1);
    } else positional.push(a);
  }

  const inputArg = positional[0];
  if (!inputArg) {
    console.error(
      'Usage: extract-fuchsia-sprites.mjs <input.png> [--size 100] [--out dir] [--names a.png,b.png] [--key r,g,b] [--no-detect-key]',
    );
    process.exit(1);
  }

  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const inputPath = isAbsolute(inputArg) ? inputArg : resolve(process.cwd(), inputArg);
  const outDir = flags.out
    ? (isAbsolute(flags.out) ? flags.out : resolve(process.cwd(), flags.out))
    : undefined;

  const result = extractFuchsiaSprites(inputPath, {
    size: flags.size,
    outDir,
    names: flags.names,
    tolerance: flags.tolerance,
    minArea: flags.minArea,
    key: flags.key,
    detectKey: flags.detectKey,
  });

  console.log(
    `source=${result.sourceFormat} key=${formatKey(result.key)} spread=${result.keySpread.toFixed(1)}`,
  );
  if (result.keySpread > 40) {
    console.warn('warn: angoli molto diversi — controlla il foglio');
  }

  console.log(`# ${result.files.length} sprite → ${result.files[0] ? dirname(result.files[0]) : outDir}`);
  for (let i = 0; i < result.files.length; i++) {
    const b = result.boxes[i];
    const rel = result.files[i].replace(root + '\\', '').replace(root + '/', '');
    console.log(`${rel}  bbox=${b.w}x${b.h}@${b.x},${b.y} area=${b.area}`);
  }
}
