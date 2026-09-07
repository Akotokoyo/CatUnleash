import * as THREE from "three";
import { CityAudio } from "../audio";
import type { EnvironmentTheme } from "../environments";
import { LANES } from "./constants";
import { canvas } from "./dom";
import type {
  EnvironmentTransition,
  PendingLevelToast,
  RunnerObject,
  RunState,
  ThemeSpriteSet,
} from "./types";
import type { CatId } from "./types";

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x86c9ef);
scene.fog = new THREE.Fog(0x86c9ef, 48, 125);

export const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 180);
camera.position.set(0, 7.7, 13);
camera.lookAt(0, 1.2, -10);

export const sun = new THREE.DirectionalLight(0xffe7a1, 3.1);
sun.position.set(-12, 22, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -12;
scene.add(sun, new THREE.HemisphereLight(0xd8efff, 0x3e4248, 1.9));

export const world = new THREE.Group();
export const trackRoot = new THREE.Group();
export const decorRoot = new THREE.Group();
export const objectRoot = new THREE.Group();
export const playerRoot = new THREE.Group();
world.add(trackRoot, decorRoot, objectRoot, playerRoot);
scene.add(world);

export const skyRoot = new THREE.Group();
scene.add(skyRoot);

export const audio = new CityAudio();
export const timer = new THREE.Timer();
timer.connect(document);

export const trackTiles: THREE.Group[] = [];
export const decorTiles: THREE.Group[] = [];
export const objects: RunnerObject[] = [];
export const tmpWorldPos = new THREE.Vector3();

export const catFrames: Partial<Record<CatId, THREE.Texture>> = {};
export const catFrontTextures: Partial<Record<CatId, THREE.Texture>> = {};
export const themeSpriteCache = new Map<EnvironmentTheme["id"], ThemeSpriteSet>();
export const textureLoader = new THREE.TextureLoader();

export const textures = {
  pugIdle: undefined as THREE.Texture | undefined,
  pugBark: undefined as THREE.Texture | undefined,
};

export const game = {
  runState: "menu" as RunState,
  laneIndex: 1,
  targetX: LANES[1],
  catCount: 1,
  distance: 0,
  killScore: 0,
  pugsScared: 0,
  tunaCount: 0,
  extraLives: 0,
  level: 1,
  spawnTravel: 0,
  nextSpawn: 25,
  elapsed: 0,
  runTime: 0,
  stridePhase: 0,
  invulnerableUntil: 0,
  swipeStartX: 0,
  environmentIndex: 0,
  transitionTargetIndex: undefined as number | undefined,
  transitionTilesRemaining: 0,
  environmentTransition: undefined as EnvironmentTransition | undefined,
  pendingThemeApply: undefined as EnvironmentTheme["id"] | undefined,
  pendingLevelToast: undefined as PendingLevelToast | undefined,
  postTransitionSpawnReady: false,
  saveTimer: 0,
};
