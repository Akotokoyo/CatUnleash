import type * as THREE from "three";
import type { TranslationKey } from "../i18n";

export type RunState = "menu" | "running" | "gameover";
export type PickupType = "milk" | "tuna" | "mouse" | "obstacle";

export interface RunnerObject {
  mesh: THREE.Group;
  type: PickupType;
  lane: number;
  strength: number;
  phase: number;
  pickupCatId?: CatId;
  resolved?: boolean;
}

export interface RunSave {
  version: 1;
  laneIndex: number;
  catCount: number;
  distance: number;
  killScore: number;
  pugsScared: number;
  tunaCount: number;
  extraLives: number;
  level: number;
  spawnTravel: number;
  nextSpawn: number;
  runTime: number;
  environmentIndex: number;
}

export interface EnvironmentTransition {
  oldSky: THREE.Group;
  newSky: THREE.Group;
  fromBackground: THREE.Color;
  toBackground: THREE.Color;
  fromFog: THREE.Color;
  toFog: THREE.Color;
  fromSun: THREE.Color;
  toSun: THREE.Color;
  elapsed: number;
  duration: number;
}

export interface FlyParticle {
  el: HTMLDivElement;
  kind: "pug" | "tuna";
  t: number;
  delay: number;
  duration: number;
  fromX: number;
  fromY: number;
  viaX: number;
  viaY: number;
  toX: number;
  toY: number;
  arc: number;
  phaseSplit: number;
  centerBurstDone: boolean;
  trailTimer: number;
  onComplete?: () => void;
}

export interface TrailParticle {
  el: HTMLDivElement;
  t: number;
  duration: number;
  x: number;
  y: number;
}

export interface BurstParticle {
  el: HTMLDivElement;
  t: number;
  duration: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface FlashParticle {
  el: HTMLDivElement;
  t: number;
  duration: number;
  x: number;
  y: number;
}

export const CAT_IDS = ["orange", "maxwell", "paralized", "tuxedo", "barong"] as const;
export type CatId = (typeof CAT_IDS)[number];
export type CatFacing = "left" | "center" | "right";

export interface ThemeSpriteSet {
  cats: Partial<Record<CatId, THREE.Texture>>;
  catFront: Partial<Record<CatId, THREE.Texture>>;
  pugIdle: THREE.Texture;
  pugBark: THREE.Texture;
}

export type ScreenMode = "menu" | "hud" | "gameover";

export interface PendingLevelToast {
  level: number;
  worldKey: TranslationKey;
}
