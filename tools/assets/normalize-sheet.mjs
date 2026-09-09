#!/usr/bin/env node
/**
 * Converte fogli JPEG (anche con estensione .png) in PNG vero.
 * Stampa anche il colore sfondo stimato dagli angoli (blocchi 16×16).
 *
 * Uso:
 *   node tools/assets/normalize-sheet.mjs input.png
 *   node tools/assets/normalize-sheet.mjs input.png -o output.png
 */
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSheet } from './sheet-image.mjs';

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const argv = process.argv.slice(2);
  let inputArg;
  let outputArg;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--out') outputArg = argv[++i];
    else if (a.startsWith('-')) {
      console.error(`Flag sconosciuto: ${a}`);
      process.exit(1);
    } else if (!inputArg) inputArg = a;
    else {
      console.error(`Argomento inatteso: ${a}`);
      process.exit(1);
    }
  }

  if (!inputArg) {
    console.error('Usage: normalize-sheet.mjs <input.png|jpeg> [-o output.png]');
    process.exit(1);
  }

  const inputPath = isAbsolute(inputArg) ? inputArg : resolve(process.cwd(), inputArg);
  const outputPath = outputArg
    ? (isAbsolute(outputArg) ? outputArg : resolve(process.cwd(), outputArg))
    : undefined;

  const result = normalizeSheet(inputPath, outputPath);
  const { r, g, b } = result.key;
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

  console.log(`format=${result.format} → ${result.outputPath}`);
  console.log(`key rgb(${r},${g},${b}) ${hex} spread=${result.spread.toFixed(1)}`);
  if (result.spread > 40) {
    console.warn('warn: angoli molto diversi — controlla il foglio o usa --key in extract');
  }
}
