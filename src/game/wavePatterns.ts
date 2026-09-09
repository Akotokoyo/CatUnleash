import { MAX_PUG_STRENGTH } from "./constants";
import { game } from "./state";
import type { PickupType } from "./types";

/**
 * Griglia verticale: ogni riga è una corsia (L/C/R), ogni colonna è un tick (onda).
 *
 * . vuoto   O ostacolo   C gatto   T tonno
 * M topo (forza random)   1/2/3 topo a forza fissa
 *
 * Esempio:
 * L . C .
 * C . . M
 * R T . .
 */

export interface WaveSpawn {
  type: PickupType;
  strength: number;
}

export interface WavePattern {
  name: string;
  difficulty: 1 | 2 | 3;
  ticks: (WaveSpawn | null)[][]; // [tick][lane 0..2]
}

const LANE_ROWS = ["L", "C", "R"] as const;

function cellToSpawn(symbol: string): WaveSpawn | null {
  switch (symbol) {
    case ".":
      return null;
    case "O":
      return { type: "obstacle", strength: 0 };
    case "T":
      return { type: "tuna", strength: 0 };
    case "C":
      return { type: "milk", strength: 0 };
    case "M":
      return { type: "mouse", strength: -1 };
    case "1":
    case "2":
    case "3":
      return { type: "mouse", strength: Number(symbol) };
    default:
      throw new Error(`Simbolo wave sconosciuto: ${symbol}`);
  }
}

function isTickFair(tick: (WaveSpawn | null)[]): boolean {
  const hasObstacle = tick.some((cell) => cell?.type === "obstacle");
  if (!hasObstacle) return true;
  const occupied = tick.filter((cell) => cell !== null).length;
  return occupied <= 2;
}

export function parseVerticalPattern(
  name: string,
  difficulty: 1 | 2 | 3,
  layout: string,
): WavePattern {
  const rows = new Map<string, string[]>();
  for (const line of layout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [lane, ...cells] = trimmed.split(/\s+/);
    if (!LANE_ROWS.includes(lane as (typeof LANE_ROWS)[number])) {
      throw new Error(`Pattern "${name}": riga corsia non valida "${lane}"`);
    }
    rows.set(lane, cells);
  }

  for (const lane of LANE_ROWS) {
    if (!rows.has(lane)) throw new Error(`Pattern "${name}": manca la riga ${lane}`);
  }

  const widths = LANE_ROWS.map((lane) => rows.get(lane)!.length);
  if (widths[0] !== widths[1] || widths[1] !== widths[2]) {
    throw new Error(`Pattern "${name}": le righe hanno lunghezze diverse`);
  }

  const tickCount = widths[0];
  const ticks: (WaveSpawn | null)[][] = [];
  for (let tick = 0; tick < tickCount; tick += 1) {
    const column: (WaveSpawn | null)[] = LANE_ROWS.map((lane) => cellToSpawn(rows.get(lane)![tick]));
    if (!isTickFair(column)) {
      throw new Error(`Pattern "${name}": tick ${tick} blocca tutte le corsie`);
    }
    ticks.push(column);
  }

  return { name, difficulty, ticks };
}


//LCR = lane, column, row
//C,M,O,T = cat, mouse (dog), obstacle, tuna

export const WAVE_PATTERNS: WavePattern[] = [
  parseVerticalPattern("intro", 1, `
L C . .
C . T .
R . . T
`),
  parseVerticalPattern("tuna_sinistra", 1, `
L T . .
C . M .
R . T .
`),
  parseVerticalPattern("recovery", 1, `
L C . M
C . C .
R . M .
`),
  parseVerticalPattern("scelta", 2, `
L C T M
C T . M
R . M .
`),
  parseVerticalPattern("doppio_topo", 2, `
L M M .
C M . M
R . M .
`),
  parseVerticalPattern("pressione", 2, `
L . O M
C O M .
R M . M
`),
  parseVerticalPattern("ostacolo_avviso", 3, `
L T . O
C M O .
R T M .
`),
  parseVerticalPattern("corridoio", 3, `
L M O M
C M . O
R . M .
`),
  parseVerticalPattern("premio_stretto", 3, `
L T O M
C C . .
R T M .
`),
];

function maxDifficultyForLevel(level: number): 1 | 2 | 3 {
  if (level <= 1) return 1;
  if (level <= 3) return 2;
  return 3;
}

function randomStrength(): number {
  return 1 + Math.floor(Math.random() * MAX_PUG_STRENGTH);
}

let activePattern: WavePattern | undefined;
let tickIndex = 0;
const recentPatternNames: string[] = [];

function pickNextPattern(): WavePattern {
  const maxDifficulty = maxDifficultyForLevel(game.level);
  const pool = WAVE_PATTERNS.filter(
    (pattern) =>
      pattern.difficulty <= maxDifficulty &&
      !recentPatternNames.includes(pattern.name),
  );
  const candidates = pool.length > 0
    ? pool
    : WAVE_PATTERNS.filter((pattern) => pattern.difficulty <= maxDifficulty);
  const pattern = candidates[Math.floor(Math.random() * candidates.length)];
  recentPatternNames.push(pattern.name);
  if (recentPatternNames.length > 3) recentPatternNames.shift();
  return pattern;
}

export function resetWaveSequencer(): void {
  activePattern = undefined;
  tickIndex = 0;
  recentPatternNames.length = 0;
}

function resolveTick(tick: (WaveSpawn | null)[]): (WaveSpawn | null)[] {
  return tick.map((cell) => {
    if (!cell || cell.type !== "mouse" || cell.strength >= 0) return cell;
    return { ...cell, strength: randomStrength() };
  });
}

function tickHasContent(tick: (WaveSpawn | null)[]): boolean {
  return tick.some((cell) => cell !== null);
}

export function nextWaveTick(): (WaveSpawn | null)[] {
  for (let guard = 0; guard < 16; guard += 1) {
    if (!activePattern || tickIndex >= activePattern.ticks.length) {
      activePattern = pickNextPattern();
      tickIndex = 0;
    }
    const tick = activePattern.ticks[tickIndex];
    tickIndex += 1;
    const resolved = resolveTick(tick);
    if (tickHasContent(resolved)) return resolved;
  }
  return [{ type: "mouse", strength: randomStrength() }, null, null];
}
