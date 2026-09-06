import * as THREE from "three";
import { ENVIRONMENTS } from "../environments";
import { LANES, SAVE_KEY } from "./constants";
import { ui } from "./dom";
import { game } from "./state";
import type { RunSave } from "./types";

export function readSave(): RunSave | undefined {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return undefined;
    const save = JSON.parse(raw) as RunSave;
    if (save.version !== 1) return undefined;
    return save;
  } catch {
    return undefined;
  }
}

export function writeSave(): void {
  if (game.runState !== "running") return;
  const save: RunSave = {
    version: 1,
    laneIndex: game.laneIndex,
    catCount: game.catCount,
    distance: game.distance,
    killScore: game.killScore,
    pugsScared: game.pugsScared,
    tunaCount: game.tunaCount,
    extraLives: game.extraLives,
    level: game.level,
    spawnTravel: game.spawnTravel,
    nextSpawn: game.nextSpawn,
    runTime: game.runTime,
    environmentIndex: game.environmentIndex,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  updateMenuSaveState();
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
  updateMenuSaveState();
}

function isCheckpointSave(save: RunSave): boolean {
  return save.distance > 2
    || save.runTime > 1.5
    || save.catCount > 1
    || save.killScore > 0
    || save.tunaCount > 0
    || save.extraLives > 0
    || save.pugsScared > 0;
}

export function hasSave(): boolean {
  const save = readSave();
  return save !== undefined && isCheckpointSave(save);
}

export function updateMenuSaveState(): void {
  ui.continueRun.disabled = !hasSave();
}

export function applySave(save: RunSave): void {
  game.laneIndex = THREE.MathUtils.clamp(save.laneIndex, 0, LANES.length - 1);
  game.targetX = LANES[game.laneIndex];
  game.catCount = Math.max(1, save.catCount);
  game.distance = Math.max(0, save.distance);
  game.killScore = Math.max(0, save.killScore);
  game.pugsScared = Math.max(0, save.pugsScared);
  game.tunaCount = THREE.MathUtils.clamp(save.tunaCount, 0, 20);
  game.extraLives = Math.max(0, save.extraLives);
  game.runTime = Math.max(0, save.runTime);
  game.level = Math.max(1, Math.floor(game.distance / 250) + 1);
  game.environmentIndex = (game.level - 1) % ENVIRONMENTS.length;
  game.spawnTravel = Math.max(0, save.spawnTravel);
  game.nextSpawn = Math.max(1, save.nextSpawn);
  game.stridePhase = 0;
  game.invulnerableUntil = 0;
  game.saveTimer = 0;
}
