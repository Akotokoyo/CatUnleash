// Background kill: MainActivity.onStop (finishAndRemoveTask + killProcess).
// App.exitApp() da solo non basta su Android (processo/audio restano vivi).

import * as THREE from "three";
import "./style.css";
import { CityAudio } from "./audio";
import {
  ENVIRONMENTS,
  getEnvironment,
  makeEnvironmentDecor,
  makeEnvironmentSky,
  makeEnvironmentTrack,
  type EnvironmentTheme,
} from "./environments";
import { translate, type Language, type TranslationKey } from "./i18n";

type RunState = "menu" | "running" | "gameover";
type PickupType = "milk" | "tuna" | "mouse" | "obstacle";

interface RunnerObject {
  mesh: THREE.Group;
  type: PickupType;
  lane: number;
  strength: number;
  phase: number;
  pickupCatId?: CatId;
  resolved?: boolean;
}

interface RunSave {
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

interface EnvironmentTransition {
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

interface FlyParticle {
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

interface TrailParticle {
  el: HTMLDivElement;
  t: number;
  duration: number;
  x: number;
  y: number;
}

interface BurstParticle {
  el: HTMLDivElement;
  t: number;
  duration: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface FlashParticle {
  el: HTMLDivElement;
  t: number;
  duration: number;
  x: number;
  y: number;
}

const LANES = [-2.7, 0, 2.7];
const TRACK_LENGTH = 14;
const TRACK_TILES = 10;
const ENVIRONMENT_TRANSITION_DURATION = 14;
const ENVIRONMENT_TRANSITION_TILES = TRACK_TILES + 4;
const PLAYER_Z = 3;
const gold = new THREE.MeshStandardMaterial({ color: 0xe8b83f, roughness: 0.42, metalness: 0.35 });
const terracotta = new THREE.MeshStandardMaterial({ color: 0xac4f2d, roughness: 0.82 });
const cream = new THREE.MeshStandardMaterial({ color: 0xf7e3a6, roughness: 0.72 });
const obsidian = new THREE.MeshStandardMaterial({ color: 0x13201e, roughness: 0.35, metalness: 0.25 });
const MAX_PUG_STRENGTH = 3;
const MAX_EXTRA_LIVES = 5;
const CAT_IDS = ["orange", "maxwell", "paralized", "tuxedo", "barong"] as const;
type ThemeId = EnvironmentTheme["id"];
type CatId = (typeof CAT_IDS)[number];
type CatFacing = "left" | "center" | "right";
interface ThemeSpriteSet {
  cats: Partial<Record<CatId, THREE.Texture>>;
  catFront: Partial<Record<CatId, THREE.Texture>>;
  pugIdle: THREE.Texture;
  pugBark: THREE.Texture;
}
const MAX_PACK_SIZE = 5;
const SAVE_KEY = "catunleash_run_v1";
const SAVE_INTERVAL = 1;
const CAT_SPRITE_HEIGHT = 1.60;
const CAT_PICKUP_SPRITE_HEIGHT = 1.35;
const CAT_FACING_THRESHOLD = 0.12;
const PACK_LANE_SPREAD = 0.34;
const PACK_ROW_DEPTH = 0.68;
let pugIdleTexture: THREE.Texture;
let pugBarkTexture: THREE.Texture;
const catFrames: Partial<Record<CatId, THREE.Texture>> = {};
const catFrontTextures: Partial<Record<CatId, THREE.Texture>> = {};
const themeSpriteCache = new Map<ThemeId, ThemeSpriteSet>();
const textureLoader = new THREE.TextureLoader();

const canvas = mustElement<HTMLCanvasElement>("game");

const ui = {
  menu: mustElement("menu"),
  gameover: mustElement("gameover"),
  hud: mustElement("hud"),
  continueRun: mustElement<HTMLButtonElement>("continue-run"),
  newRun: mustElement<HTMLButtonElement>("new-run"),
  restart: mustElement<HTMLButtonElement>("restart"),
  sound: mustElement<HTMLButtonElement>("sound"),
  language: mustElement<HTMLSelectElement>("language"),
  score: mustElement("score"),
  cats: mustElement("cats"),
  mice: mustElement("mice"),
  speed: mustElement("speed"),
  tuna: mustElement("tuna"),
  lives: mustElement("lives"),
  finalScore: mustElement("final-score"),
  finalDistance: mustElement("final-distance"),
  finalMice: mustElement("final-mice"),
  toast: mustElement("toast"),
};

const flyLayer = mustElement("fly-layer");
const flyParticles: FlyParticle[] = [];
const flyTrails: TrailParticle[] = [];
const flyBursts: BurstParticle[] = [];
const flyFlashes: FlashParticle[] = [];
const tmpWorldPos = new THREE.Vector3();
let tunaFlyImageUrl = "";

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x86c9ef);
scene.fog = new THREE.Fog(0x86c9ef, 48, 125);

const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 180);
camera.position.set(0, 7.7, 13);
camera.lookAt(0, 1.2, -10);

const sun = new THREE.DirectionalLight(0xffe7a1, 3.1);
sun.position.set(-12, 22, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -12;
scene.add(sun, new THREE.HemisphereLight(0xd8efff, 0x3e4248, 1.9));

const world = new THREE.Group();
const trackRoot = new THREE.Group();
const decorRoot = new THREE.Group();
const objectRoot = new THREE.Group();
const playerRoot = new THREE.Group();
world.add(trackRoot, decorRoot, objectRoot, playerRoot);
scene.add(world);
const skyRoot = new THREE.Group();
scene.add(skyRoot);

const audio = new CityAudio();
const timer = new THREE.Timer();
timer.connect(document);
const trackTiles: THREE.Group[] = [];
const decorTiles: THREE.Group[] = [];
const objects: RunnerObject[] = [];

let state: RunState = "menu";
let laneIndex = 1;
let targetX = LANES[laneIndex];
let catCount = 1;
let distance = 0;
let killScore = 0;
let pugsScared = 0;
let tunaCount = 0;
let extraLives = 0;
let level = 1;
let spawnTravel = 0;
let nextSpawn = 25;
let elapsed = 0;
let runTime = 0;
let stridePhase = 0;
let invulnerableUntil = 0;
let swipeStartX = 0;
let toastTimer = 0;
let environmentIndex = 0;
let transitionTilesRemaining = 0;
let environmentTransition: EnvironmentTransition | undefined;
let pendingThemeApply: ThemeId | undefined;
let pendingLevelToast: { level: number; worldKey: TranslationKey } | undefined;
let postTransitionSpawnReady = false;
let language: Language = "en";
let saveTimer = 0;

void bootstrap();

async function bootstrap(): Promise<void> {
  try {
    await loadAllThemeSprites();
    setEnvironment(0);
    rebuildPack();
    tunaFlyImageUrl = buildTunaFlyImageUrl();
    applyLanguage();
    bindControls();
    updateMenuSaveState();
    resize();
    renderer.setAnimationLoop(update);
    showScreen("menu");
  } finally {
    document.body.classList.remove("loading");
  }
}

function mustElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento #${id} non trovato`);
  return element as T;
}

async function loadTexture(path: string): Promise<THREE.Texture> {
  const texture = await textureLoader.loadAsync(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

async function loadTextureWithFallback(primary: string, fallback: string): Promise<THREE.Texture> {
  try {
    return await loadTexture(primary);
  } catch {
    return await loadTexture(fallback);
  }
}

function themedCatPath(themeId: ThemeId, file: string): string {
  return `/assets/cats/${themeId}/${file}`;
}

function fallbackCatPath(file: string): string {
  return `/assets/cats/${file}`;
}

function themedPugPath(themeId: ThemeId, file: string): string {
  return `/assets/pugs/${themeId}/${file}`;
}

function fallbackPugPath(file: string): string {
  return `/assets/pugs/${file}`;
}

async function loadThemeSprites(themeId: ThemeId): Promise<ThemeSpriteSet> {
  const cats: Partial<Record<CatId, THREE.Texture>> = {};
  const catFront: Partial<Record<CatId, THREE.Texture>> = {};
  await Promise.all(
    CAT_IDS.map(async (id) => {
      const [center, front] = await Promise.all([
        loadTextureWithFallback(themedCatPath(themeId, `${id}_center.png`), fallbackCatPath(`${id}_center.png`)),
        loadTextureWithFallback(themedCatPath(themeId, `${id}_front.png`), fallbackCatPath(`${id}_front.png`)),
      ]);
      cats[id] = center;
      catFront[id] = front;
    }),
  );
  const [pugIdle, pugBark] = await Promise.all([
    loadTextureWithFallback(themedPugPath(themeId, "carlino_meme.png"), fallbackPugPath("carlino_meme.png")),
    loadTextureWithFallback(themedPugPath(themeId, "carlino_bark.png"), fallbackPugPath("carlino_bark.png")),
  ]);
  return { cats, catFront, pugIdle, pugBark };
}

async function loadAllThemeSprites(): Promise<void> {
  const sets = await Promise.all(
    ENVIRONMENTS.map(async (theme) => [theme.id, await loadThemeSprites(theme.id)] as const),
  );
  for (const [themeId, sprites] of sets) themeSpriteCache.set(themeId, sprites);
}

function applyThemeSprites(themeId: ThemeId): void {
  const set = themeSpriteCache.get(themeId);
  if (!set) return;
  for (const id of CAT_IDS) {
    catFrames[id] = set.cats[id];
    catFrontTextures[id] = set.catFront[id];
  }
  pugIdleTexture = set.pugIdle;
  pugBarkTexture = set.pugBark;
  refreshThemedSpritesInScene();
}

function refreshThemedSpritesInScene(): void {
  rebuildPack();
  for (const object of objects) {
    if (object.type === "milk" && object.pickupCatId) {
      const texture = catFrontTextures[object.pickupCatId];
      if (!texture) continue;
      const sprite = object.mesh.children[0];
      if (!(sprite instanceof THREE.Sprite)) continue;
      const material = sprite.material as THREE.SpriteMaterial;
      material.map = texture;
      applyPickupSpriteScale(sprite, texture);
      material.needsUpdate = true;
    }
    if (object.type === "mouse") {
      object.mesh.userData.pugMood = undefined;
      syncPugPackMood(object);
    }
  }
}

function t(key: TranslationKey, values: Record<string, string | number> = {}): string {
  return translate(language, key, values);
}

function applyLanguage(): void {
  document.documentElement.lang = language;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n as TranslationKey | undefined;
    if (key) element.textContent = t(key);
  });
  ui.sound.setAttribute("aria-label", t("sound.label"));
  updateMenuSaveState();
}

function readSave(): RunSave | undefined {
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

function writeSave(): void {
  if (state !== "running") return;
  const save: RunSave = {
    version: 1,
    laneIndex,
    catCount,
    distance,
    killScore,
    pugsScared,
    tunaCount,
    extraLives,
    level,
    spawnTravel,
    nextSpawn,
    runTime,
    environmentIndex,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  updateMenuSaveState();
}

function clearSave(): void {
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

function hasSave(): boolean {
  const save = readSave();
  return save !== undefined && isCheckpointSave(save);
}

function updateMenuSaveState(): void {
  ui.continueRun.disabled = !hasSave();
}

type ScreenMode = "menu" | "hud" | "gameover";

function showScreen(mode: ScreenMode): void {
  ui.menu.classList.toggle("hidden", mode !== "menu");
  ui.hud.classList.toggle("hidden", mode !== "hud");
  ui.gameover.classList.toggle("hidden", mode !== "gameover");
  canvas.style.pointerEvents = mode === "hud" ? "auto" : "none";
}

function applySave(save: RunSave): void {
  laneIndex = THREE.MathUtils.clamp(save.laneIndex, 0, LANES.length - 1);
  targetX = LANES[laneIndex];
  catCount = Math.max(1, save.catCount);
  distance = Math.max(0, save.distance);
  killScore = Math.max(0, save.killScore);
  pugsScared = Math.max(0, save.pugsScared);
  tunaCount = THREE.MathUtils.clamp(save.tunaCount, 0, 20);
  extraLives = Math.max(0, save.extraLives);
  runTime = Math.max(0, save.runTime);
  level = Math.max(1, Math.floor(distance / 250) + 1);
  environmentIndex = (level - 1) % ENVIRONMENTS.length;
  spawnTravel = Math.max(0, save.spawnTravel);
  nextSpawn = Math.max(1, save.nextSpawn);
  stridePhase = 0;
  invulnerableUntil = 0;
  saveTimer = 0;
}

function currentSpeedFactor(): number {
  const speed = 12 * Math.min(7, Math.pow(1 + runTime / 45, 1.25));
  return speed / 12;
}

function refreshRunHud(): void {
  ui.score.textContent = String(scoreValue());
  ui.cats.textContent = String(catCount);
  ui.speed.textContent = `${currentSpeedFactor().toFixed(1)}×`;
  updateResourceHud();
}

function setEnvironment(index: number): void {
  environmentIndex = index % ENVIRONMENTS.length;
  environmentTransition = undefined;
  transitionTilesRemaining = 0;
  pendingThemeApply = undefined;
  pendingLevelToast = undefined;
  postTransitionSpawnReady = false;
  const theme = getEnvironment(environmentIndex);
  disposeGroup(trackRoot);
  disposeGroup(decorRoot);
  disposeGroup(skyRoot);
  trackRoot.clear();
  decorRoot.clear();
  skyRoot.clear();
  trackTiles.length = 0;
  decorTiles.length = 0;
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.fog, theme.id === "space" ? 58 : 48, theme.id === "space" ? 145 : 125);
  sun.color.set(theme.sun);
  sun.intensity = theme.id === "space" || theme.id === "dimension" ? 1.8 : 3.1;
  skyRoot.add(makeEnvironmentSky(environmentIndex));

  for (let i = 0; i < TRACK_TILES; i += 1) {
    const tile = makeEnvironmentTrack(environmentIndex, TRACK_LENGTH);
    tile.position.z = PLAYER_Z - i * TRACK_LENGTH;
    trackTiles.push(tile);
    trackRoot.add(tile);

    const decor = makeEnvironmentDecor(environmentIndex, i);
    decor.position.z = PLAYER_Z - i * TRACK_LENGTH;
    decorTiles.push(decor);
    decorRoot.add(decor);
  }
  applyThemeSprites(theme.id);
}

function beginEnvironmentTransition(index: number): void {
  const nextIndex = index % ENVIRONMENTS.length;
  if (nextIndex === environmentIndex) return;
  const theme = getEnvironment(nextIndex);
  const oldSky = skyRoot.children[0] as THREE.Group;
  const newSky = makeEnvironmentSky(nextIndex);
  setGroupOpacity(newSky, 0);
  skyRoot.add(newSky);
  environmentTransition = {
    oldSky,
    newSky,
    fromBackground: (scene.background as THREE.Color).clone(),
    toBackground: new THREE.Color(theme.sky),
    fromFog: scene.fog instanceof THREE.Fog ? scene.fog.color.clone() : new THREE.Color(theme.fog),
    toFog: new THREE.Color(theme.fog),
    fromSun: sun.color.clone(),
    toSun: new THREE.Color(theme.sun),
    elapsed: 0,
    duration: ENVIRONMENT_TRANSITION_DURATION,
  };
  environmentIndex = nextIndex;
  pendingThemeApply = theme.id;
  transitionTilesRemaining = ENVIRONMENT_TRANSITION_TILES;
  postTransitionSpawnReady = true;
}

function isEnvironmentTransitionActive(): boolean {
  return environmentTransition !== undefined || transitionTilesRemaining > 0;
}

function canSpawnWaves(): boolean {
  if (!isEnvironmentTransitionActive()) return true;
  return pendingThemeApply === undefined;
}

function getWorldChangeLineZ(): number | undefined {
  let frontier = -Infinity;
  for (const tile of trackTiles) {
    if (!tile.userData.newTheme) continue;
    frontier = Math.max(frontier, tile.position.z + TRACK_LENGTH * 0.5);
  }
  return frontier === -Infinity ? undefined : frontier;
}

function tryApplyThemeAtWorldLine(): void {
  if (!pendingThemeApply) return;
  const lineZ = getWorldChangeLineZ();
  const crossed = lineZ !== undefined && lineZ >= PLAYER_Z;
  if (!crossed && transitionTilesRemaining > 0) return;
  const center = playerScreenCenter();
  applyThemeSprites(pendingThemeApply);
  pendingThemeApply = undefined;
  spawnLevelTransitionBurst(center.x, center.y);
  if (pendingLevelToast) {
    showToast(t("toast.level", {
      level: pendingLevelToast.level,
      world: t(pendingLevelToast.worldKey),
    }));
    pendingLevelToast = undefined;
    audio.victory();
  }
  if (postTransitionSpawnReady) {
    postTransitionSpawnReady = false;
    spawnTravel = Math.max(spawnTravel, nextSpawn);
  }
}

function playerScreenCenter(): { x: number; y: number } {
  playerRoot.getWorldPosition(tmpWorldPos);
  tmpWorldPos.y += 0.95;
  return worldToScreen(tmpWorldPos);
}

function updateEnvironmentTransition(delta: number): void {
  const transition = environmentTransition;
  if (!transition) return;
  transition.elapsed += delta;
  const progress = THREE.MathUtils.smoothstep(
    Math.min(1, transition.elapsed / transition.duration),
    0,
    1,
  );
  (scene.background as THREE.Color).lerpColors(transition.fromBackground, transition.toBackground, progress);
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.lerpColors(transition.fromFog, transition.toFog, progress);
  }
  sun.color.lerpColors(transition.fromSun, transition.toSun, progress);
  setGroupOpacity(transition.oldSky, 1 - progress);
  setGroupOpacity(transition.newSky, progress);
  if (progress < 1) return;
  skyRoot.remove(transition.oldSky);
  disposeGroup(transition.oldSky);
  setGroupOpacity(transition.newSky, 1);
  environmentTransition = undefined;
}

function setGroupOpacity(group: THREE.Group, factor: number): void {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const item of materials) {
      const baseOpacity = typeof item.userData.baseOpacity === "number"
        ? item.userData.baseOpacity
        : item.opacity;
      item.userData.baseOpacity = baseOpacity;
      item.opacity = baseOpacity * factor;
      item.transparent = factor < 1 || baseOpacity < 1;
      item.needsUpdate = true;
    }
  });
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const item of materials) item.dispose();
  });
}

function applyCatSpriteScale(sprite: THREE.Sprite, texture: THREE.Texture, flipX = 1): void {
  const image = texture.image as { width: number; height: number };
  const aspect = image.width > 0 && image.height > 0 ? image.width / image.height : 1;
  sprite.scale.set(CAT_SPRITE_HEIGHT * aspect * flipX, CAT_SPRITE_HEIGHT, 1);
}

function makeCatSprite(texture: THREE.Texture, flipX = 1): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  applyCatSpriteScale(sprite, texture, flipX);
  sprite.center.set(0.5, 0);
  return sprite;
}

function setCatFacing(sprite: THREE.Sprite, texture: THREE.Texture, facing: CatFacing): void {
  const material = sprite.material as THREE.SpriteMaterial;
  const flipX = facing === "right" ? -1 : 1;
  material.map = texture;
  applyCatSpriteScale(sprite, texture, flipX);
  material.needsUpdate = true;
}

function catFacingFromLane(dx: number): CatFacing {
  if (dx < -CAT_FACING_THRESHOLD) return "left";
  if (dx > CAT_FACING_THRESHOLD) return "right";
  if (laneIndex === 0) return "left";
  if (laneIndex === 2) return "right";
  return "center";
}

function makeMemeCat(catId: CatId): THREE.Group {
  const texture = catFrames[catId];
  if (!texture) throw new Error(`Texture gatto mancante: ${catId}`);
  const cat = new THREE.Group();
  cat.add(makeCatSprite(texture));
  cat.userData.catId = catId;
  return cat;
}

function rebuildPack(): void {
  playerRoot.clear();
  const shown = Math.min(catCount, MAX_PACK_SIZE);
  for (let i = 0; i < shown; i += 1) {
    const catId = CAT_IDS[i % CAT_IDS.length];
    const cat = makeMemeCat(catId);
    let baseScale = 1;
    if (i === 0) {
      baseScale = 0.96;
      cat.position.set(0, 0.22, 0);
    } else {
      const row = Math.ceil(i / 2);
      const side = i % 2 === 0 ? 1 : -1;
      baseScale = Math.max(0.58, 0.76 - row * 0.03);
      cat.position.set(side * Math.min(row, 2) * PACK_LANE_SPREAD, 0.16, row * PACK_ROW_DEPTH);
    }
    cat.userData.phase = i * 0.7;
    cat.userData.baseScale = baseScale;
    cat.scale.setScalar(baseScale);
    playerRoot.add(cat);
  }
  playerRoot.position.z = PLAYER_Z;
  ui.cats.textContent = String(catCount);
}

function packIsFull(): boolean {
  return catCount >= MAX_PACK_SIZE;
}

function randomPickupCatId(): CatId {
  return CAT_IDS[Math.floor(Math.random() * CAT_IDS.length)];
}

function applyPickupSpriteScale(sprite: THREE.Sprite, texture: THREE.Texture): void {
  const image = texture.image as { width: number; height: number };
  const aspect = image.width > 0 && image.height > 0 ? image.width / image.height : 1;
  sprite.scale.set(CAT_PICKUP_SPRITE_HEIGHT * aspect, CAT_PICKUP_SPRITE_HEIGHT, 1);
}

function makeCatPickup(catId: CatId): THREE.Group {
  const texture = catFrontTextures[catId];
  if (!texture) throw new Error(`Texture pickup gatto mancante: ${catId}`);
  const group = new THREE.Group();
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  applyPickupSpriteScale(sprite, texture);
  sprite.center.set(0.5, 0);
  group.add(sprite);
  group.userData.pickupCatId = catId;
  return group;
}

function spawnCatPickup(lane: number): void {
  if (packIsFull()) return;
  const catId = randomPickupCatId();
  const mesh = makeCatPickup(catId);
  mesh.position.set(LANES[lane], 0.3, -86 - Math.random() * 4);
  objectRoot.add(mesh);
  objects.push({
    mesh,
    type: "milk",
    lane,
    strength: 0,
    phase: Math.random() * Math.PI * 2,
    pickupCatId: catId,
  });
}

function makeTuna(): THREE.Group {
  const group = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.55, 18), terracotta);
  can.position.y = 0.53;
  can.castShadow = true;
  group.add(can);
  for (const y of [0.24, 0.82]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.055, 7, 18), gold);
    rim.position.y = y;
    rim.rotation.x = Math.PI / 2;
    group.add(rim);
  }
  const fish = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.48, 3), cream);
  fish.position.set(0, 0.54, -0.49);
  fish.rotation.z = Math.PI / 2;
  group.add(fish);
  return group;
}

function buildTunaFlyImageUrl(): string {
  const size = 128;
  const offscreen = document.createElement("canvas");
  offscreen.width = size;
  offscreen.height = size;
  const miniRenderer = new THREE.WebGLRenderer({ canvas: offscreen, alpha: true, antialias: true });
  miniRenderer.setSize(size, size, false);
  miniRenderer.outputColorSpace = THREE.SRGBColorSpace;
  const miniScene = new THREE.Scene();
  const miniCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
  miniCamera.position.set(0.15, 1.05, 2.35);
  miniCamera.lookAt(0, 0.55, 0);
  const tuna = makeTuna();
  tuna.rotation.y = -0.45;
  miniScene.add(tuna);
  miniScene.add(new THREE.HemisphereLight(0xfff2cf, 0x4a4038, 1.7));
  const key = new THREE.DirectionalLight(0xfff0c8, 1.35);
  key.position.set(2.4, 3.6, 2.8);
  miniScene.add(key);
  miniRenderer.render(miniScene, miniCamera);
  const url = offscreen.toDataURL("image/png");
  miniRenderer.dispose();
  return url;
}

function makeObstacle(): THREE.Group {
  const group = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xf06a32, roughness: 0.68 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f1dc, roughness: 0.72 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 0.38), orange);
  bar.position.y = 1.15;
  bar.castShadow = true;
  group.add(bar);
  for (const x of [-0.65, 0, 0.65]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.77, 0.4), white);
    stripe.position.set(x, 1.15, -0.02);
    stripe.rotation.z = -0.35;
    group.add(stripe);
  }
  for (const x of [-0.82, 0.82]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.4, 0.22), obsidian);
    leg.position.set(x, 0.58, 0);
    group.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.55), obsidian);
    foot.position.set(x, 0.1, 0);
    group.add(foot);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xffd43b, emissive: 0xff8a00, emissiveIntensity: 1.6 }),
    );
    beacon.position.set(x, 1.68, 0);
    group.add(beacon);
  }
  return group;
}

function makePugSprite(texture: THREE.Texture, flipX = 1): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  sprite.scale.set(1.725 * flipX, 1.725, 1);
  sprite.center.set(0.5, 0);
  return sprite;
}

function setPugPackTexture(group: THREE.Group, texture: THREE.Texture): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Sprite) || !child.userData.pugSprite) return;
    const material = child.material as THREE.SpriteMaterial;
    material.map = texture;
    material.needsUpdate = true;
  });
}

function setPugPackFlip(group: THREE.Group, flipX: 1 | -1): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Sprite) || !child.userData.pugSprite) return;
    child.scale.x = 1.725 * flipX;
    child.scale.y = 1.725;
  });
}

function makeMousePack(strength: number): THREE.Group {
  const group = new THREE.Group();
  const count = Math.min(strength, MAX_PUG_STRENGTH);
  for (let i = 0; i < count; i += 1) {
    const pug = makePugSprite(pugIdleTexture);
    pug.userData.pugSprite = true;
    pug.position.set((i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.55, 0.55, Math.floor(i / 2) * 0.65);
    group.add(pug);
  }
  return group;
}

function pugsInMajority(strength: number): boolean {
  return strength >= catCount;
}

function syncPugPackMood(object: RunnerObject): void {
  if (object.type !== "mouse" || object.resolved) return;
  const mood = pugsInMajority(object.strength) ? "bark" : "idle";
  if (object.mesh.userData.pugMood === mood) return;
  object.mesh.userData.pugMood = mood;
  setPugPackTexture(object.mesh, mood === "bark" ? pugBarkTexture : pugIdleTexture);
  setPugPackFlip(object.mesh, 1);
}

function spawnWave(): void {
  const laneOrder = [0, 1, 2].sort(() => Math.random() - 0.5);
  const roll = Math.random();
  if (roll < 0.22) {
    spawnCatPickup(laneOrder[0]);
    spawnObject("mouse", laneOrder[1], randomStrength());
  } else if (roll < 0.52) {
    spawnObject("tuna", laneOrder[0], 0);
    spawnObject("mouse", laneOrder[1], randomStrength());
  } else if (roll < 0.72) {
    spawnObject("mouse", laneOrder[0], randomStrength());
    spawnObject("mouse", laneOrder[1], randomStrength());
  } else if (roll < 0.88) {
    spawnObject("mouse", laneOrder[0], randomStrength());
  } else {
    spawnObject("obstacle", laneOrder[0], 0);
    spawnObject("mouse", laneOrder[1], randomStrength());
  }
}

function spawnObject(type: PickupType, lane: number, strength: number): void {
  if (type === "milk") {
    spawnCatPickup(lane);
    return;
  }
  const mesh =
    type === "tuna"
      ? makeTuna()
      : type === "obstacle"
        ? makeObstacle()
        : makeMousePack(strength);
  mesh.position.set(LANES[lane], 0.3, -86 - Math.random() * 4);
  objectRoot.add(mesh);
  const runner: RunnerObject = { mesh, type, lane, strength, phase: Math.random() * Math.PI * 2 };
  objects.push(runner);
  if (type === "mouse") syncPugPackMood(runner);
}

function randomStrength(): number {
  return 1 + Math.floor(Math.random() * MAX_PUG_STRENGTH);
}

function startRunFromZero(): void {
  clearObjects();
  clearSave();
  state = "running";
  laneIndex = 1;
  targetX = LANES[laneIndex];
  catCount = 1;
  distance = 0;
  killScore = 0;
  pugsScared = 0;
  tunaCount = 0;
  extraLives = 0;
  level = 1;
  spawnTravel = 0;
  nextSpawn = 20;
  runTime = 0;
  stridePhase = 0;
  invulnerableUntil = 0;
  saveTimer = 0;
  pendingThemeApply = undefined;
  pendingLevelToast = undefined;
  postTransitionSpawnReady = false;
  setEnvironment(0);
  rebuildPack();
  playerRoot.position.x = targetX;
  showScreen("hud");
  audio.start();
  refreshRunHud();
  showToast(t("toast.run"));
}

function continueRun(): void {
  const save = readSave();
  if (!save || !isCheckpointSave(save)) {
    startRunFromZero();
    return;
  }
  clearObjects();
  applySave(save);
  state = "running";
  setEnvironment(environmentIndex);
  rebuildPack();
  playerRoot.position.x = targetX;
  refreshRunHud();
  showScreen("hud");
  audio.start();
  showToast(t("toast.continue"));
  writeSave();
}


function endRun(): void {
  state = "gameover";
  clearSave();
  audio.hit();
  ui.finalScore.textContent = String(scoreValue());
  ui.finalDistance.textContent = `${Math.floor(distance)}m`;
  ui.finalMice.textContent = String(pugsScared);
  showScreen("gameover");
}

function scoreValue(): number {
  return Math.floor(distance * 10 + killScore);
}

function clearObjects(): void {
  for (const object of objects) objectRoot.remove(object.mesh);
  objects.length = 0;
  clearFlyFx();
}

function clearFlyFx(): void {
  for (const particle of flyParticles) particle.el.remove();
  for (const particle of flyTrails) particle.el.remove();
  for (const particle of flyBursts) particle.el.remove();
  for (const particle of flyFlashes) particle.el.remove();
  flyParticles.length = 0;
  flyTrails.length = 0;
  flyBursts.length = 0;
  flyFlashes.length = 0;
}

function shiftLane(direction: number): void {
  if (state !== "running") return;
  laneIndex = THREE.MathUtils.clamp(laneIndex + direction, 0, LANES.length - 1);
  targetX = LANES[laneIndex];
}

function bindControls(): void {
  ui.continueRun.addEventListener("click", (event) => {
    event.preventDefault();
    continueRun();
  });
  ui.newRun.addEventListener("click", (event) => {
    event.preventDefault();
    startRunFromZero();
  });
  ui.restart.addEventListener("click", (event) => {
    event.preventDefault();
    startRunFromZero();
  });
  ui.language.addEventListener("change", () => {
    language = ui.language.value as Language;
    applyLanguage();
  });
  ui.sound.addEventListener("click", () => {
    const muted = audio.toggle();
    ui.sound.textContent = muted ? "×" : "♪";
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") shiftLane(-1);
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") shiftLane(1);
    if ((event.key === " " || event.key === "Enter") && state !== "running") {
      if (hasSave()) continueRun();
      else startRunFromZero();
    }
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "running") return;
    swipeStartX = event.clientX;
  });
  canvas.addEventListener("pointerup", (event) => {
    if (state !== "running") return;
    const delta = event.clientX - swipeStartX;
    if (Math.abs(delta) > 24) shiftLane(delta > 0 ? 1 : -1);
    else shiftLane(event.clientX < window.innerWidth / 2 ? -1 : 1);
  });
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") writeSave();
  });
  window.addEventListener("pagehide", writeSave);
  window.addEventListener("blur", writeSave);
  new ResizeObserver(resize).observe(canvas);
}

function resize(): void {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const pixelRatio = Math.min(Math.max(window.devicePixelRatio, 2), 3);
  const targetWidth = Math.floor(width * pixelRatio);
  const targetHeight = Math.floor(height * pixelRatio);
  if (
    canvas.width === targetWidth &&
    canvas.height === targetHeight &&
    renderer.getPixelRatio() === pixelRatio
  ) {
    return;
  }
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.fov = THREE.MathUtils.clamp(54 + (height / Math.max(width, 1) - 1.7) * 6, 52, 67);
  camera.updateProjectionMatrix();
}

function update(): void {
  resize();
  timer.update();
  const delta = Math.min(timer.getDelta(), 0.05);
  elapsed += delta;
  updateEnvironmentTransition(delta);
  updateFlyParticles(delta);

  if (state === "running") {
    runTime += delta;
    const speed = 12 * Math.min(7, Math.pow(1 + runTime / 45, 1.25));
    const travel = speed * delta;
    stridePhase += delta * speed * 0.34;
    distance += travel * 0.34;
    spawnTravel += travel;
    moveWorld(travel);
    updatePack(delta);
    updateObjects(travel, delta);
    if (spawnTravel >= nextSpawn && canSpawnWaves()) {
      spawnTravel = 0;
      nextSpawn = THREE.MathUtils.randFloat(21, 29);
      spawnWave();
    }
    tryApplyThemeAtWorldLine();
    const nextLevel = Math.floor(distance / 250) + 1;
    if (nextLevel > level) {
      level = nextLevel;
      beginEnvironmentTransition(level - 1);
      pendingLevelToast = {
        level,
        worldKey: getEnvironment(environmentIndex).nameKey,
      };
    }
    ui.score.textContent = String(scoreValue());
    ui.speed.textContent = `${currentSpeedFactor().toFixed(1)}×`;
    saveTimer += delta;
    if (saveTimer >= SAVE_INTERVAL) {
      saveTimer = 0;
      writeSave();
    }
  } else {
    moveWorld(2.3 * delta);
    stridePhase += delta * 2.3 * 0.34;
    playerRoot.position.x = Math.sin(elapsed * 0.65) * 0.22;
    updatePack(delta);
  }

  camera.position.x += (playerRoot.position.x * 0.16 - camera.position.x) * Math.min(1, delta * 2.8);
  renderer.render(scene, camera);
}

function moveWorld(travel: number): void {
  for (let index = 0; index < trackTiles.length; index += 1) {
    const tile = trackTiles[index];
    const decor = decorTiles[index];
    tile.position.z += travel;
    decor.position.z += travel;
    if (tile.position.z <= PLAYER_Z + TRACK_LENGTH) continue;
    const wrappedZ = tile.position.z - TRACK_LENGTH * TRACK_TILES;
    if (transitionTilesRemaining > 0) {
      trackRoot.remove(tile);
      decorRoot.remove(decor);
      disposeGroup(tile);
      disposeGroup(decor);
      const nextTile = makeEnvironmentTrack(environmentIndex, TRACK_LENGTH);
      const nextDecor = makeEnvironmentDecor(environmentIndex, index);
      nextTile.userData.newTheme = true;
      nextDecor.userData.newTheme = true;
      nextTile.position.z = wrappedZ;
      nextDecor.position.z = wrappedZ;
      trackTiles[index] = nextTile;
      decorTiles[index] = nextDecor;
      trackRoot.add(nextTile);
      decorRoot.add(nextDecor);
      transitionTilesRemaining -= 1;
    } else {
      tile.position.z = wrappedZ;
      decor.position.z = wrappedZ;
    }
  }
  const theme = getEnvironment(environmentIndex);
  const baseIntensity = theme.id === "space" || theme.id === "dimension" ? 1.8 : 2.9;
  sun.intensity = baseIntensity + Math.sin(elapsed * 0.35) * 0.2;
  decorRoot.rotation.z = Math.sin(elapsed * 0.18) * 0.0015;
}

function updatePack(delta: number): void {
  playerRoot.position.x += (targetX - playerRoot.position.x) * Math.min(1, delta * 11);
  const dx = targetX - playerRoot.position.x;
  const facing = catFacingFromLane(dx);
  playerRoot.children.forEach((cat) => {
    const catId = cat.userData.catId as CatId;
    const texture = catFrames[catId];
    const sprite = cat.children[0];
    if (texture && sprite instanceof THREE.Sprite) {
      setCatFacing(sprite, texture, facing);
    }
    const phase = Number(cat.userData.phase ?? 0);
    const baseScale = Number(cat.userData.baseScale ?? 1);
    const stride = Math.sin(stridePhase + phase);
    cat.position.y = 0.42 + Math.abs(stride) * 0.14;
    cat.rotation.z = stride * 0.06;
    cat.rotation.y = 0;
    const stretch = 1 + stride * 0.06;
    const squash = 1 - Math.abs(stride) * 0.04;
    cat.scale.set(baseScale * stretch, baseScale * squash, baseScale);
  });
}

function updateObjects(travel: number, delta: number): void {
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    const object = objects[i];
    const previousZ = object.mesh.position.z;
    object.mesh.position.z += travel;
    if (object.type !== "obstacle" && object.type !== "mouse" && object.type !== "milk") {
      object.mesh.rotation.y += delta * 2.2;
    }
    object.mesh.position.y = 0.3 + Math.sin(elapsed * 3.2 + object.phase) * 0.12;
    if (object.type === "mouse") {
      syncPugPackMood(object);
    }

    const closeZ =
      Math.abs(object.mesh.position.z - PLAYER_Z) < 1.25 ||
      (previousZ < PLAYER_Z && object.mesh.position.z > PLAYER_Z);
    if (closeZ && object.lane === laneIndex && runTime < invulnerableUntil) {
      objectRoot.remove(object.mesh);
      objects.splice(i, 1);
    } else if (closeZ && object.lane === laneIndex && !object.resolved) {
      if (collect(object)) {
        objectRoot.remove(object.mesh);
        objects.splice(i, 1);
      }
    } else if (object.mesh.position.z > PLAYER_Z + 9) {
      objectRoot.remove(object.mesh);
      objects.splice(i, 1);
    }
  }
}

function collect(object: RunnerObject): boolean {
  if (object.type === "milk") {
    if (packIsFull()) return true;
    catCount += 1;
    killScore += 25;
    rebuildPack();
    audio.pickup(true);
    showToast(t("toast.cat"));
    return true;
  }
  if (object.type === "tuna") {
    object.mesh.getWorldPosition(tmpWorldPos);
    tmpWorldPos.y += 0.65;
    spawnFlyIcon(tmpWorldPos, ui.tuna, "tuna", 0, applyTunaPickup);
    return true;
  }
  if (object.type === "obstacle") {
    showToast(t("toast.barrier"));
    loseLife();
    return true;
  }

  if (catCount > object.strength) {
    catCount -= 1;
    rebuildPack();
    if (catCount <= 0) {
      catCount = 0;
      ui.cats.textContent = "0";
      endRun();
      return true;
    }
    killScore += object.strength * 85;
    audio.victory();
    showToast(t("toast.flee", { score: object.strength * 85, count: object.strength }));
    object.mesh.getWorldPosition(tmpWorldPos);
    tmpWorldPos.y += 0.65;
    launchScaredFly(tmpWorldPos, object.strength);
    return true;
  }

  audio.hit();
  showToast(t("toast.bark"));
  loseLife();
  return true;
}

function loseLife(): void {
  if (extraLives <= 0) {
    catCount = 0;
    ui.cats.textContent = "0";
    endRun();
    return;
  }
  extraLives -= 1;
  catCount = Math.max(1, catCount);
  invulnerableUntil = runTime + 2;
  rebuildPack();
  updateResourceHud();
  audio.victory();
  showToast(t("toast.lifeUsed"));
}

function updateResourceHud(): void {
  ui.mice.textContent = String(pugsScared);
  ui.tuna.textContent = `${tunaCount}/20`;
  ui.lives.textContent = String(extraLives);
}

function hudStatElement(valueEl: HTMLElement): HTMLElement {
  return valueEl.closest(".hud-stat") ?? valueEl;
}

function pulseHudStat(valueEl: HTMLElement): void {
  const stat = hudStatElement(valueEl);
  stat.classList.remove("pulse");
  void stat.offsetWidth;
  stat.classList.add("pulse");
}

function worldToScreen(world: THREE.Vector3): { x: number; y: number } {
  const projected = world.clone().project(camera);
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height,
  };
}

function hudTargetCenter(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function screenFlyCenter(): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.44 };
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function setFlyTransform(el: HTMLElement, x: number, y: number, scale = 1, opacity = 1): void {
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
  el.style.opacity = String(opacity);
}

function spawnFlyIcon(
  fromWorld: THREE.Vector3,
  targetEl: HTMLElement,
  kind: "pug" | "tuna",
  delay = 0,
  onComplete?: () => void,
): void {
  const from = worldToScreen(fromWorld);
  const via = screenFlyCenter();
  const to = hudTargetCenter(targetEl);
  const dist = Math.hypot(from.x - via.x, from.y - via.y) + Math.hypot(via.x - to.x, via.y - to.y);
  const arc = Math.min(180, dist * 0.22);
  const el = document.createElement("div");
  el.className = `fly-icon fly-icon-${kind}`;
  if (kind === "tuna") el.style.backgroundImage = `url("${tunaFlyImageUrl}")`;
  setFlyTransform(el, from.x, from.y, 1.55, 1);
  flyLayer.appendChild(el);
  spawnDepartureBurst(from.x, from.y, kind);
  flyParticles.push({
    el,
    kind,
    t: 0,
    delay,
    duration: Math.min(1180, 520 + dist * 0.34) / 1000,
    fromX: from.x,
    fromY: from.y,
    viaX: via.x,
    viaY: via.y,
    toX: to.x,
    toY: to.y,
    arc,
    phaseSplit: 0.44,
    centerBurstDone: false,
    trailTimer: 0,
    onComplete,
  });
}

function spawnFlyTrail(x: number, y: number, kind: "pug" | "tuna"): void {
  const el = document.createElement("div");
  el.className = `fly-trail fly-trail-${kind}`;
  setFlyTransform(el, x, y, 1.4, 0.85);
  flyLayer.appendChild(el);
  flyTrails.push({ el, t: 0, duration: 0.28 + Math.random() * 0.08, x, y });
}

function spawnLevelTransitionBurst(x: number, y: number): void {
  const flash = document.createElement("div");
  flash.className = "fly-flash fly-flash-level";
  setFlyTransform(flash, x, y, 0.45, 0.95);
  flyLayer.appendChild(flash);
  flyFlashes.push({ el: flash, t: 0, duration: 0.78, x, y });

  const palette = ["#7cf2c6", "#ffcf67", "#ffb978", "#ffe47b", "#68dfb4", "#fff6c8", "#ff9f4a", "#c8f7ff"];
  const mainCount = 62;
  for (let i = 0; i < mainCount; i += 1) {
    const angle = (Math.PI * 2 * i) / mainCount + (Math.random() - 0.5) * 0.28;
    const speed = 130 + Math.random() * 240;
    const el = document.createElement("div");
    el.className = "fly-burst fly-burst-level";
    el.style.background = `radial-gradient(circle, #fff 0%, ${palette[i % palette.length]} 58%, transparent 100%)`;
    setFlyTransform(el, x, y, 1.15, 1);
    flyLayer.appendChild(el);
    flyBursts.push({
      el,
      t: 0,
      duration: 0.62 + Math.random() * 0.34,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }

  for (let i = 0; i < 24; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 6 + Math.random() * 42;
    const sparkX = x + Math.cos(angle) * radius;
    const sparkY = y + Math.sin(angle) * radius;
    const el = document.createElement("div");
    el.className = "fly-burst fly-burst-level";
    el.style.background = `radial-gradient(circle, #fff 0%, ${palette[Math.floor(Math.random() * palette.length)]} 58%, transparent 100%)`;
    setFlyTransform(el, sparkX, sparkY, 1.1, 1);
    flyLayer.appendChild(el);
    const burstAngle = Math.random() * Math.PI * 2;
    const speed = 48 + Math.random() * 78;
    flyBursts.push({
      el,
      t: 0,
      duration: 0.48 + Math.random() * 0.24,
      x: sparkX,
      y: sparkY,
      vx: Math.cos(burstAngle) * speed,
      vy: Math.sin(burstAngle) * speed,
    });
  }

  for (let i = 0; i < 18; i += 1) {
    const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.12;
    const speed = 72 + Math.random() * 96;
    const el = document.createElement("div");
    el.className = "fly-burst fly-burst-level fly-burst-level-ring";
    el.style.background = `radial-gradient(circle, #fff 0%, ${palette[(i + 2) % palette.length]} 62%, transparent 100%)`;
    setFlyTransform(el, x, y, 0.85, 0.95);
    flyLayer.appendChild(el);
    flyBursts.push({
      el,
      t: 0,
      duration: 0.72 + Math.random() * 0.22,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 18,
    });
  }
}

function spawnLandingBurst(x: number, y: number, kind: "pug" | "tuna"): void {
  const flash = document.createElement("div");
  flash.className = `fly-flash fly-flash-${kind}`;
  setFlyTransform(flash, x, y, 0.35, 0.9);
  flyLayer.appendChild(flash);
  flyFlashes.push({ el: flash, t: 0, duration: 0.34, x, y });

  const count = 12;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
    const speed = 52 + Math.random() * 62;
    const el = document.createElement("div");
    el.className = `fly-burst fly-burst-${kind}`;
    setFlyTransform(el, x, y, 1, 1);
    flyLayer.appendChild(el);
    flyBursts.push({
      el,
      t: 0,
      duration: 0.38 + Math.random() * 0.14,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }
}

function spawnDepartureBurst(x: number, y: number, kind: "pug" | "tuna"): void {
  const flash = document.createElement("div");
  flash.className = `fly-flash fly-flash-${kind}`;
  setFlyTransform(flash, x, y, 0.55, 0.95);
  flyLayer.appendChild(flash);
  flyFlashes.push({ el: flash, t: 0, duration: 0.42, x, y });

  const count = 16;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
    const speed = 68 + Math.random() * 78;
    const el = document.createElement("div");
    el.className = `fly-burst fly-burst-${kind}`;
    setFlyTransform(el, x, y, 1.1, 1);
    flyLayer.appendChild(el);
    flyBursts.push({
      el,
      t: 0,
      duration: 0.42 + Math.random() * 0.16,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }
}

function spawnCenterBurst(x: number, y: number, kind: "pug" | "tuna"): void {
  const flash = document.createElement("div");
  flash.className = `fly-flash fly-flash-${kind}`;
  setFlyTransform(flash, x, y, 0.82, 1);
  flyLayer.appendChild(flash);
  flyFlashes.push({ el: flash, t: 0, duration: 0.48, x, y });

  const count = 18;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.25;
    const speed = 84 + Math.random() * 96;
    const el = document.createElement("div");
    el.className = `fly-burst fly-burst-${kind}`;
    setFlyTransform(el, x, y, 1.2, 1);
    flyLayer.appendChild(el);
    flyBursts.push({
      el,
      t: 0,
      duration: 0.46 + Math.random() * 0.18,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }
}

function flyPositionAt(particle: FlyParticle, t: number): { x: number; y: number } {
  const split = particle.phaseSplit;
  if (t <= split) {
    const local = t / split;
    const eased = easeOutQuad(local);
    const arc = particle.arc * 1.15;
    return {
      x: particle.fromX + (particle.viaX - particle.fromX) * eased,
      y: particle.fromY + (particle.viaY - particle.fromY) * eased - arc * 4 * local * (1 - local),
    };
  }
  const local = (t - split) / (1 - split);
  const eased = easeOutQuad(local);
  const arc = particle.arc * 0.65;
  return {
    x: particle.viaX + (particle.toX - particle.viaX) * eased,
    y: particle.viaY + (particle.toY - particle.viaY) * eased - arc * 4 * local * (1 - local),
  };
}

function flyScaleAt(t: number, phaseSplit: number): number {
  if (t <= phaseSplit) {
    const local = t / phaseSplit;
    return 1.55 + local * 0.75;
  }
  const local = (t - phaseSplit) / (1 - phaseSplit);
  return 2.3 - local * 1.35;
}

function launchScaredFly(worldPos: THREE.Vector3, count: number): void {
  for (let i = 0; i < count; i += 1) {
    spawnFlyIcon(worldPos, ui.mice, "pug", 0, () => {
      pugsScared += 1;
      updateResourceHud();
      pulseHudStat(ui.mice);
    });
  }
}

function applyTunaPickup(): void {
  tunaCount += 1;
  killScore += 20;
  audio.pickup();
  if (tunaCount >= 20) {
    if (extraLives < MAX_EXTRA_LIVES) {
      tunaCount -= 20;
      extraLives += 1;
      audio.victory();
      showToast(t("toast.life"));
    } else {
      tunaCount = 20;
      showToast(t("toast.tuna", { count: tunaCount }));
    }
  } else {
    showToast(t("toast.tuna", { count: tunaCount }));
  }
  updateResourceHud();
  pulseHudStat(ui.tuna);
}

function updateFlyParticles(delta: number): void {
  for (let i = flyTrails.length - 1; i >= 0; i -= 1) {
    const trail = flyTrails[i];
    trail.t += delta;
    const t = trail.t / trail.duration;
    if (t >= 1) {
      trail.el.remove();
      flyTrails.splice(i, 1);
      continue;
    }
    const alpha = 1 - t;
    const scale = 0.55 + (1 - t) * 0.85;
    trail.el.style.opacity = String(alpha * 0.85);
    trail.el.style.transform = `translate(${trail.x}px, ${trail.y}px) translate(-50%, -50%) scale(${scale})`;
  }

  for (let i = flyBursts.length - 1; i >= 0; i -= 1) {
    const burst = flyBursts[i];
    burst.t += delta;
    const t = burst.t / burst.duration;
    if (t >= 1) {
      burst.el.remove();
      flyBursts.splice(i, 1);
      continue;
    }
    const x = burst.x + burst.vx * burst.t;
    const y = burst.y + burst.vy * burst.t + burst.t * burst.t * 28;
    const scale = 1 - t * 0.72;
    burst.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
    burst.el.style.opacity = String(1 - t);
  }

  for (let i = flyFlashes.length - 1; i >= 0; i -= 1) {
    const flash = flyFlashes[i];
    flash.t += delta;
    const t = flash.t / flash.duration;
    if (t >= 1) {
      flash.el.remove();
      flyFlashes.splice(i, 1);
      continue;
    }
    const scale = 0.35 + t * 1.45;
    flash.el.style.opacity = String(0.9 * (1 - t));
    flash.el.style.transform = `translate(${flash.x}px, ${flash.y}px) translate(-50%, -50%) scale(${scale})`;
  }

  for (let i = flyParticles.length - 1; i >= 0; i -= 1) {
    const particle = flyParticles[i];
    particle.t += delta;
    if (particle.t < particle.delay) continue;
    const localT = (particle.t - particle.delay) / particle.duration;
    if (localT >= 1) {
      spawnLandingBurst(particle.toX, particle.toY, particle.kind);
      particle.el.remove();
      particle.onComplete?.();
      flyParticles.splice(i, 1);
      continue;
    }
    const t = easeOutQuad(localT);
    if (!particle.centerBurstDone && localT >= particle.phaseSplit) {
      particle.centerBurstDone = true;
      spawnCenterBurst(particle.viaX, particle.viaY, particle.kind);
    }
    const { x, y } = flyPositionAt(particle, t);
    particle.trailTimer += delta;
    if (particle.trailTimer >= 0.022) {
      particle.trailTimer = 0;
      spawnFlyTrail(x, y, particle.kind);
    }
    const scale = flyScaleAt(t, particle.phaseSplit);
    particle.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
    particle.el.style.opacity = String(1 - t * 0.06);
  }
}

function showToast(message: string): void {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.remove("show"), 900);
}
