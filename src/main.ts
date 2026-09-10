import * as THREE from "three";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import "./style.css";
import { CityAudio } from "./audio";
import {
  ENVIRONMENTS,
  getEnvironment,
  makeEnvironmentDecor,
  makeEnvironmentSky,
  makeEnvironmentTrack,
} from "./environments";
import { translate, type Language, type TranslationKey } from "./i18n";

type RunState = "menu" | "running" | "gameover";
type PickupType = "cat" | "tuna" | "dog" | "carrier" | "coin" | "hint";
type AnimalKind = "cat" | "dog";
type CollectEffect = Exclude<PickupType, "hint">;
type CatPattern = "solid" | "tabby" | "bicolor" | "calico";
type DogPattern = "spaniel" | "solid" | "mask";

interface CatCoat {
  fur: number;
  pattern: CatPattern;
  patch?: number;
  extra?: number;
}

interface DogCoat {
  fur: number;
  belly: number;
  pattern: DogPattern;
}

interface ContinueSnapshot {
  laneIndex: number;
  catCount: number;
  distance: number;
  killScore: number;
  dogsDefeated: number;
  tunaCount: number;
  extraLives: number;
  level: number;
  environmentIndex: number;
  spawnTravel: number;
  nextSpawn: number;
  runTime: number;
  stridePhase: number;
}

interface RunnerObject {
  mesh: THREE.Group;
  type: PickupType;
  lane: number;
  strength: number;
  phase: number;
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

const LANES = [-2.7, 0, 2.7];
const TRACK_LENGTH = 14;
const TRACK_TILES = 10;
const PLAYER_Z = 3;
const MAX_SPEED = 6;
const LIFE_COST = 200;
const CAT_COST = 20;
const CONTINUE_COST = 150;
const ECONOMY_KEY = "catunleashed-economy";
const CAT_COATS: CatCoat[] = [
  { fur: 0xee9a40, pattern: "tabby", patch: 0xd07828 },
  { fur: 0xf6f1e8, pattern: "solid" },
  { fur: 0x4a3c36, pattern: "solid" },
  { fur: 0xde6a38, pattern: "bicolor", patch: 0xf6f1e8 },
  { fur: 0xc8c2b8, pattern: "tabby", patch: 0x8f8a82 },
  { fur: 0x2b2a2e, pattern: "solid" },
  { fur: 0xf6f1e8, pattern: "calico", patch: 0xee9a40, extra: 0x5c4036 },
  { fur: 0xb0aaa4, pattern: "bicolor", patch: 0xf6f1e8 },
];
const DOG_COATS: DogCoat[] = [
  { fur: 0xc47a3a, belly: 0xf7f2ea, pattern: "solid" },
  { fur: 0xe0b06a, belly: 0xfff3d8, pattern: "solid" },
  { fur: 0x5c4036, belly: 0xf0e6d8, pattern: "solid" },
  { fur: 0xd4a078, belly: 0xf6f1e8, pattern: "solid" },
  { fur: 0x8a7a70, belly: 0xeee8e0, pattern: "solid" },
];
const gold = new THREE.MeshStandardMaterial({ color: 0xe8b83f, roughness: 0.42, metalness: 0.35 });
const terracotta = new THREE.MeshStandardMaterial({ color: 0xac4f2d, roughness: 0.82 });
const cream = new THREE.MeshStandardMaterial({ color: 0xf7e3a6, roughness: 0.72 });
const obsidian = new THREE.MeshStandardMaterial({ color: 0x13201e, roughness: 0.35, metalness: 0.25 });
const biscuitTan = new THREE.MeshStandardMaterial({ color: 0xb87a3c, roughness: 0.88 });
const biscuitToasted = new THREE.MeshStandardMaterial({ color: 0x6e3b22, roughness: 0.92 });
const ink = new THREE.MeshBasicMaterial({ color: 0x1c1410, side: THREE.BackSide });
const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xfff6ea });
const catInk = new THREE.MeshBasicMaterial({ color: 0x2b1c16 });
const catNose = new THREE.MeshBasicMaterial({ color: 0xe8899a });
const toonRamp = makeToonRamp();
const sharedMaterials = new Set<THREE.Material>([
  gold,
  terracotta,
  cream,
  obsidian,
  biscuitTan,
  biscuitToasted,
  ink,
  eyeWhite,
  catInk,
  catNose,
]);

const canvas = mustElement<HTMLCanvasElement>("game");
const mobileRendering =
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  window.matchMedia("(pointer: coarse)").matches;
const maxPixelRatio = mobileRendering ? 1.5 : 2;

const ui = {
  menu: mustElement("menu"),
  gameover: mustElement("gameover"),
  hud: mustElement("hud"),
  play: mustElement<HTMLButtonElement>("play"),
  restart: mustElement<HTMLButtonElement>("restart"),
  backMenu: mustElement<HTMLButtonElement>("back-menu"),
  sound: mustElement<HTMLButtonElement>("sound"),
  language: mustElement<HTMLSelectElement>("language"),
  score: mustElement("score"),
  cats: mustElement("cats"),
  speed: mustElement("speed"),
  tuna: mustElement("tuna"),
  lives: mustElement("lives"),
  coins: mustElement("coins"),
  menuCoins: mustElement("menu-coins"),
  shopStock: mustElement("shop-stock"),
  buyLife: mustElement<HTMLButtonElement>("buy-life"),
  buyCat: mustElement<HTMLButtonElement>("buy-cat"),
  continueRun: mustElement<HTMLButtonElement>("continue-run"),
  finalScore: mustElement("final-score"),
  finalDistance: mustElement("final-distance"),
  finalDogs: mustElement("final-dogs"),
  finalCoins: mustElement("final-coins"),
  collectFx: mustElement("collect-fx"),
  toast: mustElement("toast"),
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !mobileRendering,
  powerPreference: "high-performance",
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = mobileRendering ? THREE.BasicShadowMap : THREE.PCFShadowMap;
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
sun.shadow.mapSize.set(mobileRendering ? 512 : 1024, mobileRendering ? 512 : 1024);
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
let dogsDefeated = 0;
let tunaCount = 0;
let extraLives = 0;
let wallet = 0;
let bankedLives = 0;
let purchasedCats = 0;
let lastHintLane = 1;
let kibblePauseWaves = 0;
let continueSnapshot: ContinueSnapshot | undefined;
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
let accessoryEnvironmentIndex = 0;
let transitionTilesRemaining = 0;
let environmentTransition: EnvironmentTransition | undefined;
let language: Language = "en";

loadEconomy();
setEnvironment(0);
catCount = 1 + purchasedCats;
rebuildPack();
applyLanguage();
bindControls();
bindAppLifecycle();
resize();
renderer.setAnimationLoop(update);

function mustElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento #${id} non trovato`);
  return element as T;
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
  refreshShopUi();
  updateWalletUi();
}

function setEnvironment(index: number): void {
  environmentIndex = index % ENVIRONMENTS.length;
  accessoryEnvironmentIndex = environmentIndex;
  environmentTransition = undefined;
  transitionTilesRemaining = 0;
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
    tile.userData.environmentIndex = environmentIndex;
    trackTiles.push(tile);
    trackRoot.add(tile);

    const decor = makeEnvironmentDecor(environmentIndex, i);
    decor.position.z = PLAYER_Z - i * TRACK_LENGTH;
    decorTiles.push(decor);
    decorRoot.add(decor);
  }
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
    duration: 4,
  };
  environmentIndex = nextIndex;
  transitionTilesRemaining = TRACK_TILES;
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

function disposeRuntimeObject(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose();
    }
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return;
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) {
      if (sharedMaterials.has(material) || materials.has(material)) continue;
      materials.add(material);
      if (material instanceof THREE.SpriteMaterial) material.map?.dispose();
      material.dispose();
    }
  });
}

function makeToonRamp(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D non disponibile");
  const stops = ["#a3a3a3", "#a3a3a3", "#d2d2d2", "#d2d2d2", "#ffffff", "#ffffff", "#ffffff", "#ffffff"];
  stops.forEach((color, index) => {
    context.fillStyle = color;
    context.fillRect(index, 0, 1, 1);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

function toon(color: number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp });
}

function addInk(mesh: THREE.Mesh, inflate = 1.08): void {
  const shell = new THREE.Mesh(mesh.geometry, ink);
  shell.scale.setScalar(inflate);
  shell.castShadow = false;
  shell.receiveShadow = false;
  mesh.add(shell);
}

function furLuma(color: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return (r * 0.3 + g * 0.59 + b * 0.11) / 255;
}

function mixHex(color: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((color & 255) * factor)));
  return (r << 16) | (g << 8) | b;
}

function makeKawaiiEarGeometry(scale = 1): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const k = scale;
  shape.moveTo(0, 0.4 * k);
  shape.quadraticCurveTo(0.16 * k, 0.2 * k, 0.2 * k, -0.05 * k);
  shape.quadraticCurveTo(0, -0.1 * k, -0.2 * k, -0.05 * k);
  shape.quadraticCurveTo(-0.16 * k, 0.2 * k, 0, 0.4 * k);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.07 * k,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.018,
    bevelSegments: 1,
    curveSegments: 5,
  });
  geometry.translate(0, 0, -0.035 * k);
  geometry.computeVertexNormals();
  return geometry;
}

function addFurPatch(
  parent: THREE.Group,
  color: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  const patch = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), toon(color));
  patch.position.set(x, y, z);
  patch.scale.set(sx, sy, sz);
  parent.add(patch);
}

function addChibiFace(
  parent: THREE.Group,
  eyeX: number,
  eyeY: number,
  faceZ: number,
  eyeSize: number,
  nose: "pink" | "black",
): void {
  for (const x of [-eyeX, eyeX]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeSize, 12, 10), catInk);
    eye.scale.set(0.92, 1.08, 0.28);
    eye.position.set(x, eyeY, faceZ);
    parent.add(eye);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(eyeSize * 0.32, 6, 5), eyeWhite);
    shine.position.set(x - eyeSize * 0.35, eyeY + eyeSize * 0.42, faceZ - 0.05);
    parent.add(shine);
    const blush = new THREE.Mesh(new THREE.SphereGeometry(eyeSize * 0.82, 8, 6), toon(0xf4a4b0));
    blush.scale.set(1.25, 0.55, 0.28);
    blush.position.set(x * 1.7, eyeY - eyeSize * 1.4, faceZ + 0.1);
    parent.add(blush);
  }
  const noseMesh = new THREE.Mesh(
    new THREE.SphereGeometry(nose === "pink" ? 0.035 : 0.042, 8, 6),
    nose === "pink" ? catNose : catInk,
  );
  noseMesh.scale.set(1.15, 0.72, 0.8);
  noseMesh.position.set(0, eyeY - eyeSize * 1.15, faceZ - 0.02);
  parent.add(noseMesh);
  for (const x of [-0.038, 0.038]) {
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.01, 5, 8, Math.PI), catInk);
    mouth.position.set(x, eyeY - eyeSize * 1.55, faceZ - 0.01);
    mouth.rotation.set(Math.PI * 0.12, 0, x < 0 ? 0.45 : -0.45);
    parent.add(mouth);
  }
}

function makeCat(coat: CatCoat = CAT_COATS[0]): THREE.Group {
  const cat = new THREE.Group();
  const fur = toon(coat.fur);
  const innerEar = toon(0xf4a39a);
  const creamFur = toon(0xf6f1e8);
  const dark = furLuma(coat.fur) < 0.38;
  const faceZ = -0.48;

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), fur);
  body.scale.set(1.05, 0.9, 1);
  body.position.set(0, 0.36, 0.08);
  body.castShadow = true;
  addInk(body, 1.06);
  cat.add(body);

  const tummy = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 10, 8),
    coat.pattern === "bicolor" || coat.pattern === "calico" || dark ? creamFur : toon(0xf5e2c4),
  );
  tummy.scale.set(0.95, 0.95, 0.42);
  tummy.position.set(0, 0.36, -0.22);
  cat.add(tummy);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.52, 14, 12), fur);
  head.scale.set(1.08, 1, 0.8);
  head.position.set(0, 1.02, -0.04);
  head.castShadow = true;
  addInk(head, 1.05);
  cat.add(head);

  if (dark) {
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), creamFur);
    muzzle.scale.set(1.05, 0.72, 0.55);
    muzzle.position.set(0, 0.92, -0.28);
    cat.add(muzzle);
  }

  if (coat.pattern === "bicolor" && coat.patch !== undefined) {
    addFurPatch(cat, coat.patch, 0.22, 1.08, -0.12, 0.95, 0.85, 0.7);
    addFurPatch(cat, coat.patch, -0.08, 0.38, -0.12, 0.7, 0.7, 0.5);
  }
  if (coat.pattern === "calico") {
    if (coat.patch !== undefined) addFurPatch(cat, coat.patch, 0.24, 1.1, -0.1, 0.9, 0.8, 0.65);
    if (coat.extra !== undefined) addFurPatch(cat, coat.extra, -0.22, 0.98, -0.16, 0.7, 0.65, 0.55);
  }
  if (coat.pattern === "tabby") {
    const stripe = toon(coat.patch ?? mixHex(coat.fur, 0.78));
    for (const [x, rot] of [
      [-0.12, 0.35],
      [0, 0],
      [0.12, -0.35],
    ] as const) {
      const mark = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.16, 3, 6), stripe);
      mark.position.set(x, 1.22, -0.4);
      mark.rotation.z = rot;
      cat.add(mark);
    }
  }

  for (const x of [-0.28, 0.28]) {
    const earColor =
      coat.pattern === "bicolor" && coat.patch !== undefined && x > 0 ? toon(coat.patch) : fur;
    const ear = new THREE.Mesh(makeKawaiiEarGeometry(1), earColor);
    ear.position.set(x, 1.38, -0.06);
    ear.rotation.set(-0.18, x < 0 ? 0.18 : -0.18, x < 0 ? 0.42 : -0.42);
    ear.castShadow = true;
    addInk(ear, 1.07);
    cat.add(ear);
    const pink = new THREE.Mesh(makeKawaiiEarGeometry(0.55), innerEar);
    pink.position.set(x * 1.02, 1.36, -0.1);
    pink.rotation.copy(ear.rotation);
    cat.add(pink);
  }

  for (const x of [-0.16, 0.16]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), catInk);
    eye.scale.set(0.82, 1.12, 0.28);
    eye.position.set(x, 1.04, faceZ);
    cat.add(eye);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), eyeWhite);
    shine.position.set(x - 0.03, 1.08, faceZ - 0.05);
    cat.add(shine);
    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toon(0xf2a09a));
    blush.scale.set(1.15, 0.55, 0.28);
    blush.position.set(x * 1.55, 0.92, -0.36);
    cat.add(blush);
    const whisker = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), catInk);
    whisker.position.set(x * 1.7, 0.94, -0.4);
    cat.add(whisker);
  }

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), catNose);
  nose.scale.set(1.2, 0.7, 0.8);
  nose.position.set(0, 0.94, faceZ - 0.02);
  cat.add(nose);
  for (const x of [-0.035, 0.035]) {
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 5, 8, Math.PI), catInk);
    mouth.position.set(x, 0.9, faceZ - 0.01);
    mouth.rotation.set(Math.PI * 0.15, 0, x < 0 ? 0.4 : -0.4);
    cat.add(mouth);
  }

  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.42, 4, 8), fur);
  tail.position.set(0.2, 0.5, 0.42);
  tail.rotation.set(1.05, 0.35, -0.25);
  tail.name = "tail";
  addInk(tail, 1.08);
  cat.add(tail);

  for (const x of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.1, 4, 8), fur);
    leg.position.set(x, 0.16, 0);
    addInk(leg, 1.08);
    cat.add(leg);
  }
  return cat;
}

function addAnimalAccessory(animal: THREE.Group, kind: AnimalKind, worldIndex: number): void {
  const worldId = getEnvironment(worldIndex).id;
  const accessory = new THREE.Group();
  accessory.name = "world-accessory";
  const headY = kind === "cat" ? 1.46 : 1.42;
  const headZ = kind === "cat" ? -0.04 : -0.04;
  const faceY = kind === "cat" ? 1.04 : 1.06;
  const faceZ = kind === "cat" ? -0.52 : -0.54;
  const size = kind === "cat" ? 1.08 : 0.9;

  if (worldId === "city") {
    const red = new THREE.MeshStandardMaterial({ color: 0xe94f47, roughness: 0.72 });
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18 * size, 0.23 * size, 0.18 * size, 8),
      red,
    );
    crown.position.set(0, headY + 0.22 * size, headZ);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.28 * size, 0.04, 0.18 * size), red);
    brim.position.set(0, headY + 0.13, headZ - 0.21 * size);
    accessory.add(crown, brim);
  } else if (worldId === "country") {
    const straw = new THREE.MeshStandardMaterial({ color: 0xe3bd58, roughness: 0.92 });
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.43 * size, 0.43 * size, 0.055, 12),
      straw,
    );
    brim.position.set(0, headY + 0.05, headZ);
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21 * size, 0.27 * size, 0.28 * size, 10),
      straw,
    );
    crown.position.set(0, headY + 0.2 * size, headZ);
    accessory.add(brim, crown);
  } else if (worldId === "jungle") {
    const leaves = new THREE.MeshStandardMaterial({ color: 0x2fa65a, roughness: 0.86 });
    for (let index = -2; index <= 2; index += 1) {
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(0.09 * size, 0.38 * size, 5),
        leaves,
      );
      leaf.position.set(index * 0.1 * size, headY + 0.22 * size + Math.abs(index) * 0.02, headZ);
      leaf.rotation.z = index * -0.22;
      accessory.add(leaf);
    }
  } else if (worldId === "lab") {
    const helmetShell = new THREE.MeshStandardMaterial({
      color: 0x263d59,
      roughness: 0.38,
      metalness: 0.28,
    });
    const visorMaterial = new THREE.MeshStandardMaterial({
      color: 0x65e8f2,
      emissive: 0x167e8e,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.68,
      roughness: 0.12,
    });
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.43 * size, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.68),
      helmetShell,
    );
    helmet.position.set(0, headY - 0.13 * size, headZ);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.56 * size, 0.24 * size, 0.045),
      visorMaterial,
    );
    visor.position.set(0, faceY + 0.01, faceZ - 0.025);
    const chinGuard = new THREE.Mesh(
      new THREE.BoxGeometry(0.48 * size, 0.075, 0.09),
      helmetShell,
    );
    chinGuard.position.set(0, faceY - 0.2 * size, faceZ - 0.035);
    accessory.add(helmet, visor, chinGuard);
  } else if (worldId === "space") {
    const glass = new THREE.MeshStandardMaterial({
      color: 0xbbeeff,
      transparent: true,
      opacity: 0.25,
      roughness: 0.1,
      depthWrite: false,
    });
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry((kind === "cat" ? 0.62 : 0.52), 12, 8),
      glass,
    );
    helmet.position.set(0, kind === "cat" ? 1.12 : 1.02, headZ);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry((kind === "cat" ? 0.4 : 0.34), 0.05, 7, 16),
      cream,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, kind === "cat" ? 0.68 : 0.62, headZ + 0.04);
    const backpack = new THREE.Mesh(
      new THREE.BoxGeometry(0.42 * size, 0.42 * size, 0.18),
      cream,
    );
    backpack.position.set(0, kind === "cat" ? 0.46 : 0.42, 0.38);
    accessory.add(helmet, ring, backpack);
  } else if (worldId === "egypt") {
    const blue = new THREE.MeshStandardMaterial({ color: 0x225fa8, roughness: 0.6 });
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18 * size, 0.29 * size, 0.35 * size, 8),
      gold,
    );
    crown.position.set(0, headY + 0.23 * size, headZ);
    for (const x of [-0.31, 0.31]) {
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.14 * size, 0.52 * size, 0.09), blue);
      flap.position.set(x * size, headY - 0.2 * size, headZ);
      flap.rotation.z = x < 0 ? -0.13 : 0.13;
      accessory.add(flap);
    }
    accessory.add(crown);
  } else {
    const glow = new THREE.MeshStandardMaterial({
      color: 0xff58db,
      emissive: 0xff30cc,
      emissiveIntensity: 1.1,
    });
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.36 * size, 0.04, 7, 18), glow);
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, headY + 0.43 * size, headZ);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.1 * size), glow);
    crystal.position.set(0, headY + 0.66 * size, headZ);
    accessory.add(halo, crystal);
  }

  accessory.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });
  const accessoryMeshes: THREE.Mesh[] = [];
  accessory.traverse((object) => {
    if (object instanceof THREE.Mesh) accessoryMeshes.push(object);
  });
  for (const mesh of accessoryMeshes) {
    const material = mesh.material;
    if (Array.isArray(material) || material.transparent) continue;
    addInk(mesh, 1.07);
  }
  animal.add(accessory);
}

function rebuildPack(): void {
  for (const child of playerRoot.children) disposeRuntimeObject(child);
  playerRoot.clear();
  const shown = Math.min(catCount, 7);
  for (let i = 0; i < shown; i += 1) {
    const cat = makeCat(CAT_COATS[i % CAT_COATS.length]);
    addAnimalAccessory(cat, "cat", accessoryEnvironmentIndex);
    if (i === 0) {
      cat.scale.setScalar(1.12);
      cat.position.set(0, 0.28, 0);
    } else {
      const row = Math.ceil(i / 2);
      const side = i % 2 === 0 ? 1 : -1;
      cat.scale.setScalar(Math.max(0.65, 0.9 - row * 0.025));
      cat.position.set(side * Math.min(row, 3) * 0.58, 0.2, row * 0.95);
    }
    cat.userData.phase = i * 0.7;
    playerRoot.add(cat);
  }
  playerRoot.position.z = PLAYER_Z;
  ui.cats.textContent = String(catCount);
}

function makeRecruitCat(): THREE.Group {
  const group = new THREE.Group();
  const coat = CAT_COATS[Math.floor(Math.random() * CAT_COATS.length)];
  const cat = makeCat(coat);
  cat.rotation.y = Math.PI;
  cat.scale.setScalar(0.92);
  addAnimalAccessory(cat, "cat", accessoryEnvironmentIndex);
  group.add(cat);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.065, 7, 20),
    new THREE.MeshStandardMaterial({
      color: 0x62f0b2,
      emissive: 0x1d8f68,
      emissiveIntensity: 0.7,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  group.add(ring);
  const plusMaterial = new THREE.MeshStandardMaterial({
    color: 0x7dffc2,
    emissive: 0x239c69,
    emissiveIntensity: 0.75,
  });
  const plusVertical = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.58, 0.1), plusMaterial);
  const plusHorizontal = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.13, 0.1), plusMaterial);
  plusVertical.position.set(0, 2.12, 0);
  plusHorizontal.position.copy(plusVertical.position);
  group.add(plusVertical, plusHorizontal);
  return group;
}

function makeTuna(): THREE.Group {
  const group = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.42, 18), toon(0xd45c3c));
  can.position.y = 0.42;
  can.castShadow = true;
  addInk(can, 1.05);
  group.add(can);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.405, 0.405, 0.2, 18), toon(0xf2d36a));
  label.position.y = 0.42;
  group.add(label);
  for (const y of [0.22, 0.62]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.045, 7, 18), gold);
    rim.position.y = y;
    rim.rotation.x = Math.PI / 2;
    addInk(rim, 1.1);
    group.add(rim);
  }
  const fish = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), toon(0xf7e7c8));
  fish.scale.set(1.45, 0.85, 0.7);
  fish.position.set(0, 0.44, -0.38);
  fish.castShadow = true;
  addInk(fish, 1.06);
  group.add(fish);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toon(0xf0c48a));
  tail.scale.set(0.45, 1.15, 0.85);
  tail.position.set(0, 0.44, -0.62);
  addInk(tail, 1.08);
  group.add(tail);
  for (const x of [-0.08, 0.08]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), catInk);
    eye.scale.set(0.9, 1.05, 0.3);
    eye.position.set(x, 0.48, -0.52);
    group.add(eye);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 5), eyeWhite);
    shine.position.set(x - 0.015, 0.5, -0.56);
    group.add(shine);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 5), catNose);
  nose.position.set(0, 0.42, -0.54);
  group.add(nose);
  return group;
}

function makePawCookieShape(scale: number): THREE.Shape {
  const s = new THREE.Shape();
  const k = scale;
  s.moveTo(0, 0);
  s.bezierCurveTo(-0.42 * k, 0, -0.82 * k, 0.06 * k, -0.78 * k, 0.4 * k);
  s.bezierCurveTo(-1.04 * k, 0.48 * k, -1.08 * k, 0.96 * k, -0.7 * k, 1.06 * k);
  s.bezierCurveTo(-0.52 * k, 1.14 * k, -0.5 * k, 0.9 * k, -0.46 * k, 0.78 * k);
  s.bezierCurveTo(-0.5 * k, 1.0 * k, -0.38 * k, 1.34 * k, -0.16 * k, 1.32 * k);
  s.bezierCurveTo(-0.04 * k, 1.3 * k, -0.04 * k, 1.04 * k, 0, 0.9 * k);
  s.bezierCurveTo(0.04 * k, 1.04 * k, 0.04 * k, 1.3 * k, 0.16 * k, 1.32 * k);
  s.bezierCurveTo(0.38 * k, 1.34 * k, 0.5 * k, 1.0 * k, 0.46 * k, 0.78 * k);
  s.bezierCurveTo(0.5 * k, 0.9 * k, 0.52 * k, 1.14 * k, 0.7 * k, 1.06 * k);
  s.bezierCurveTo(1.08 * k, 0.96 * k, 1.04 * k, 0.48 * k, 0.78 * k, 0.4 * k);
  s.bezierCurveTo(0.82 * k, 0.06 * k, 0.42 * k, 0, 0, 0);
  return s;
}

function makeCoin(): THREE.Group {
  const group = new THREE.Group();
  const scale = 0.52;
  const geometry = new THREE.ExtrudeGeometry(makePawCookieShape(scale), {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.028,
    bevelSegments: 1,
    curveSegments: 10,
  });
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const lift = box ? -box.min.y : 0;
  if (lift) geometry.translate(0, lift, 0);
  const cookie = new THREE.Mesh(geometry, biscuitTan);
  cookie.castShadow = true;
  addInk(cookie, 1.06);
  group.add(cookie);

  const addPrint = (x: number, y: number, radius: number, scaleX: number, scaleY: number): void => {
    const print = new THREE.Mesh(new THREE.CircleGeometry(radius, 12), biscuitToasted);
    print.scale.set(scaleX, scaleY, 1);
    print.position.set(x, y + lift, 0.13);
    group.add(print);
  };
  addPrint(0, 0.28, 0.16, 1.2, 0.95);
  addPrint(-0.34, 0.58, 0.075, 1, 1.05);
  addPrint(-0.12, 0.7, 0.08, 1, 1.08);
  addPrint(0.12, 0.7, 0.08, 1, 1.08);
  addPrint(0.34, 0.58, 0.075, 1, 1.05);
  return group;
}

function makePathHint(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffe27a,
    emissive: 0xffc44d,
    emissiveIntensity: 0.95,
    transparent: true,
    opacity: 0.72,
    roughness: 0.38,
    depthWrite: false,
  });
  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 4.8),
    new THREE.MeshStandardMaterial({
      color: 0xffe27a,
      emissive: 0xffc44d,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  );
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(0, 0.03, -1.5);
  group.add(stripe);
  const geometry = new THREE.ConeGeometry(0.46, 1.05, 3);
  for (let index = 0; index < 3; index += 1) {
    const arrow = new THREE.Mesh(geometry, material);
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.06, -index * 1.4);
    group.add(arrow);
  }
  return group;
}

function makeCarrier(): THREE.Group {
  const group = new THREE.Group();
  const upperMaterial = toon(0xdce5e5);
  const lowerMaterial = toon(0x4a5255);
  const metal = toon(0x252c2e);
  const gridMetal = toon(0xd6dfdd);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.72, 1.65), lowerMaterial);
  base.position.y = 0.38;
  base.castShadow = true;
  addInk(base, 1.04);
  group.add(base);

  const shell = new THREE.Mesh(makeTaperedCarrierShell(), upperMaterial);
  shell.position.y = 0.68;
  shell.castShadow = true;
  addInk(shell, 1.04);
  group.add(shell);
  const topPanel = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.07, 0.92), upperMaterial);
  topPanel.position.set(0, 1.73, 0.04);
  group.add(topPanel);

  const doorway = new THREE.Mesh(
    new THREE.PlaneGeometry(1.36, 1.22),
    new THREE.MeshBasicMaterial({ color: 0x263235, side: THREE.DoubleSide }),
  );
  doorway.position.set(0, 1.08, 0.84);
  group.add(doorway);
  for (const x of [-0.6, -0.3, 0, 0.3, 0.6]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.22, 0.04), gridMetal);
    bar.position.set(x, 1.08, 0.87);
    group.add(bar);
  }
  for (const y of [0.53, 0.8, 1.07, 1.34, 1.61]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.035, 0.04), gridMetal);
    bar.position.set(0, y, 0.875);
    group.add(bar);
  }
  for (const x of [-0.68, 0.68]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.34, 0.07), gridMetal);
    frame.position.set(x, 1.08, 0.89);
    group.add(frame);
  }
  for (const y of [0.42, 1.74]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.43, 0.07, 0.07), gridMetal);
    frame.position.set(0, y, 0.89);
    group.add(frame);
  }
  for (const x of [-0.72, 0.72]) {
    for (const z of [-0.18, 0.18]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.4, 0.075), metal);
      vent.position.set(x, 1.24, z);
      group.add(vent);
    }
  }

  const paw = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), toon(0xf0b7c4));
  paw.position.set(0.82, 1.12, 0);
  paw.rotation.y = Math.PI / 2;
  group.add(paw);

  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 8, 16, Math.PI), metal);
  handle.position.set(0, 1.92, 0.05);
  handle.rotation.x = Math.PI;
  addInk(handle, 1.08);
  group.add(handle);
  const latch = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), gold);
  latch.position.set(0.53, 1.08, 0.91);
  group.add(latch);
  group.scale.setScalar(0.9);
  return group;
}

function makeTaperedCarrierShell(): THREE.BufferGeometry {
  const bottomWidth = 1.72;
  const bottomDepth = 1.58;
  const topWidth = 1.4;
  const topDepth = 1.25;
  const height = 1.04;
  const positions = new Float32Array([
    -bottomWidth / 2, 0, -bottomDepth / 2,
    bottomWidth / 2, 0, -bottomDepth / 2,
    bottomWidth / 2, 0, bottomDepth / 2,
    -bottomWidth / 2, 0, bottomDepth / 2,
    -topWidth / 2, height, -topDepth / 2,
    topWidth / 2, height, -topDepth / 2,
    topWidth / 2, height, topDepth / 2,
    -topWidth / 2, height, topDepth / 2,
  ]);
  const indices = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeDog(coat: DogCoat = DOG_COATS[0]): THREE.Group {
  const dog = new THREE.Group();
  const fur = toon(coat.fur);
  const belly = toon(coat.belly);
  const innerEar = toon(0xf4a39a);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), fur);
  body.scale.set(1, 0.9, 1.15);
  body.position.set(0, 0.4, 0.08);
  body.castShadow = true;
  addInk(body, 1.04);
  dog.add(body);

  const tummy = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), belly);
  tummy.scale.set(1, 0.95, 0.4);
  tummy.position.set(0, 0.38, -0.22);
  dog.add(tummy);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 12), fur);
  head.position.set(0, 1.0, -0.1);
  head.castShadow = true;
  addInk(head, 1.04);
  dog.add(head);

  for (const x of [-0.46, 0.46]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), fur);
    ear.scale.set(0.7, 1.5, 0.45);
    ear.position.set(x, 0.78, 0);
    ear.rotation.z = x < 0 ? 0.28 : -0.28;
    ear.castShadow = true;
    dog.add(ear);
    const pink = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), innerEar);
    pink.scale.set(0.55, 1.2, 0.28);
    pink.position.set(x * 0.92, 0.76, -0.12);
    pink.rotation.z = ear.rotation.z;
    dog.add(pink);
  }

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), belly);
  muzzle.scale.set(1.2, 0.78, 1.2);
  muzzle.position.set(0, 0.84, -0.4);
  dog.add(muzzle);

  for (const x of [-0.14, 0.14]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), eyeWhite);
    white.scale.set(1, 1.12, 0.42);
    white.position.set(x, 1.02, -0.46);
    dog.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), catInk);
    pupil.position.set(x, 1.01, -0.52);
    dog.add(pupil);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), eyeWhite);
    shine.position.set(x - 0.025, 1.05, -0.56);
    dog.add(shine);
  }

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 6), catInk);
  nose.scale.set(1.25, 0.85, 0.9);
  nose.position.set(0, 0.82, -0.62);
  dog.add(nose);

  for (const x of [-0.15, 0.15]) {
    for (const z of [-0.14, 0.22]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.12, 4, 8), fur);
      leg.position.set(x, 0.16, z);
      addInk(leg, 1.05);
      dog.add(leg);
    }
  }

  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.28, 4, 8), fur);
  tail.position.set(0.16, 0.5, 0.46);
  tail.rotation.set(0.85, 0.3, -0.15);
  tail.name = "tail";
  addInk(tail, 1.05);
  dog.add(tail);
  return dog;
}

function makeDogPack(strength: number): THREE.Group {
  const group = new THREE.Group();
  const dog = makeDog(DOG_COATS[(strength - 1) % DOG_COATS.length]);
  addAnimalAccessory(dog, "dog", accessoryEnvironmentIndex);
  dog.rotation.y = Math.PI;
  dog.position.set(0, 0.08, 0);
  group.add(dog);
  const badge = makeBadge(`−${strength}`);
  badge.position.set(0, 2.05, 0);
  group.add(badge);
  return group;
}

function makeBadge(value: string | number): THREE.Sprite {
  const badgeCanvas = document.createElement("canvas");
  badgeCanvas.width = 256;
  badgeCanvas.height = 128;
  const context = badgeCanvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D non disponibile");
  const radius = 54;
  context.fillStyle = "#e45b4a";
  context.beginPath();
  context.roundRect(12, 16, 232, 96, radius);
  context.fill();
  context.strokeStyle = "#2b1c16";
  context.lineWidth = 10;
  context.stroke();
  context.fillStyle = "#fff8ee";
  context.font = "bold 72px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(value), 128, 68);
  const map = new THREE.CanvasTexture(badgeCanvas);
  map.needsUpdate = true;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map, depthTest: false, depthWrite: false }),
  );
  sprite.scale.set(1.85, 0.92, 1);
  sprite.renderOrder = 12;
  return sprite;
}

function objectsNear(lane: number, z: number, radius: number, types: PickupType[]): boolean {
  return objects.some(
    (object) =>
      object.lane === lane &&
      types.includes(object.type) &&
      Math.abs(object.mesh.position.z - z) < radius,
  );
}

function laneClearOf(lane: number, fromZ: number, toZ: number, types: PickupType[], radius: number): boolean {
  const minZ = Math.min(fromZ, toZ) - radius;
  const maxZ = Math.max(fromZ, toZ) + radius;
  return !objects.some(
    (object) =>
      object.lane === lane &&
      types.includes(object.type) &&
      object.mesh.position.z >= minZ &&
      object.mesh.position.z <= maxZ,
  );
}

function spawnWave(): void {
  const laneOrder = [0, 1, 2].sort(() => Math.random() - 0.5);
  const blocked = new Set<number>();
  const rewards = new Set<number>();
  const place = (type: PickupType, lane: number, strength = 0): void => {
    const z = -86 - Math.random() * 4;
    let spawnLane = lane;
    if (type === "dog" || type === "carrier") {
      const candidates = [lane, ...[0, 1, 2].filter((item) => item !== lane)];
      const free = candidates.find((item) => !objectsNear(item, z, 10, ["coin"]));
      if (free === undefined) return;
      spawnLane = free;
      blocked.add(spawnLane);
      spawnObject(type, spawnLane, strength, z);
      return;
    }
    spawnObject(type, spawnLane, strength, z);
    if (type === "cat" || type === "tuna") rewards.add(spawnLane);
  };
  const roll = Math.random();
  if (roll < 0.22) {
    place("cat", laneOrder[0]);
    place("dog", laneOrder[1], randomStrength());
  } else if (roll < 0.4) {
    place("tuna", laneOrder[0]);
    place("dog", laneOrder[1], randomStrength());
  } else if (roll < 0.72) {
    place("dog", laneOrder[0], randomStrength());
    place("dog", laneOrder[1], randomStrength());
  } else if (roll < 0.88) {
    place("dog", laneOrder[0], randomStrength());
  } else {
    place("carrier", laneOrder[0]);
    place("dog", laneOrder[1], randomStrength());
  }
  spawnRecommendedPath(blocked, rewards);
}

function spawnRecommendedPath(blocked: Set<number>, rewards: Set<number>): void {
  const safe = [0, 1, 2].filter((lane) => !blocked.has(lane));
  if (safe.length === 0) return;
  const rewardLane = [...rewards].find((lane) => safe.includes(lane));
  const hintLane = rewardLane
    ?? (safe.includes(lastHintLane) ? lastHintLane : safe[Math.floor(Math.random() * safe.length)]);
  const baseZ = -86;
  spawnObject("hint", hintLane, 0, baseZ + 8);
  if (kibblePauseWaves > 0) {
    kibblePauseWaves -= 1;
    lastHintLane = hintLane;
    return;
  }
  const count = 5 + Math.floor(Math.random() * 3);
  const spacing = 5.6;
  const gap = 10;
  const farZ = baseZ + gap;
  const nearZ = farZ + (count - 1) * spacing;
  const biscuitLane = safe.find((lane) => laneClearOf(lane, nearZ, farZ, ["dog", "carrier"], 10));
  if (biscuitLane === undefined) {
    lastHintLane = hintLane;
    return;
  }
  for (let index = 0; index < count; index += 1) {
    const z = nearZ - index * spacing;
    if (objectsNear(biscuitLane, z, 10, ["dog", "carrier"])) continue;
    spawnObject("coin", biscuitLane, 0, z);
  }
  kibblePauseWaves = 1 + Math.floor(Math.random() * 2);
  lastHintLane = biscuitLane;
}

function spawnObject(type: PickupType, lane: number, strength: number, z = -86 - Math.random() * 4): void {
  const mesh =
    type === "cat"
      ? makeRecruitCat()
      : type === "tuna"
        ? makeTuna()
        : type === "carrier"
          ? makeCarrier()
          : type === "coin"
            ? makeCoin()
            : type === "hint"
              ? makePathHint()
              : makeDogPack(strength);
  mesh.position.set(LANES[lane], type === "hint" ? 0.02 : 0.3, z);
  objectRoot.add(mesh);
  objects.push({ mesh, type, lane, strength, phase: Math.random() * Math.PI * 2 });
}

function randomStrength(): number {
  const maximum = Math.min(8, 2 + level);
  return 1 + Math.floor(Math.random() * maximum);
}

function startRun(): void {
  continueSnapshot = undefined;
  clearObjects();
  state = "running";
  laneIndex = 1;
  targetX = LANES[laneIndex];
  catCount = 1 + purchasedCats;
  purchasedCats = 0;
  distance = 0;
  killScore = 0;
  dogsDefeated = 0;
  tunaCount = 0;
  extraLives = bankedLives;
  lastHintLane = 1;
  kibblePauseWaves = 0;
  level = 1;
  spawnTravel = 0;
  nextSpawn = 20;
  runTime = 0;
  stridePhase = 0;
  invulnerableUntil = 0;
  saveEconomy();
  setEnvironment(0);
  rebuildPack();
  updateResourceHud();
  refreshShopUi();
  playerRoot.position.x = targetX;
  ui.menu.classList.add("hidden");
  ui.gameover.classList.add("hidden");
  ui.hud.classList.remove("hidden");
  audio.start();
  showToast(t("toast.run"));
}

function continueRun(): void {
  const snapshot = continueSnapshot;
  if (!snapshot || !spendCoins(CONTINUE_COST)) return;
  continueSnapshot = undefined;
  clearObjects();
  state = "running";
  laneIndex = snapshot.laneIndex;
  targetX = LANES[laneIndex];
  catCount = Math.max(1, snapshot.catCount);
  distance = snapshot.distance;
  killScore = snapshot.killScore;
  dogsDefeated = snapshot.dogsDefeated;
  tunaCount = snapshot.tunaCount;
  extraLives = snapshot.extraLives;
  level = snapshot.level;
  spawnTravel = snapshot.spawnTravel;
  nextSpawn = snapshot.nextSpawn;
  runTime = snapshot.runTime;
  stridePhase = snapshot.stridePhase;
  lastHintLane = laneIndex;
  invulnerableUntil = runTime + 2.5;
  setEnvironment(snapshot.environmentIndex);
  rebuildPack();
  updateResourceHud();
  playerRoot.position.x = targetX;
  ui.gameover.classList.add("hidden");
  ui.hud.classList.remove("hidden");
  audio.start();
  showToast(t("toast.continue"));
}

function endRun(): void {
  state = "gameover";
  ui.hud.classList.add("hidden");
  ui.finalScore.textContent = String(scoreValue());
  ui.finalDistance.textContent = `${Math.floor(distance)}m`;
  ui.finalDogs.textContent = String(dogsDefeated);
  updateWalletUi();
  refreshContinueUi();
  ui.gameover.classList.remove("hidden");
}

function returnToMenu(): void {
  continueSnapshot = undefined;
  state = "menu";
  clearObjects();
  setEnvironment(0);
  catCount = 1 + purchasedCats;
  laneIndex = 1;
  targetX = LANES[laneIndex];
  playerRoot.position.x = targetX;
  rebuildPack();
  updateResourceHud();
  refreshShopUi();
  refreshContinueUi();
  ui.hud.classList.add("hidden");
  ui.gameover.classList.add("hidden");
  ui.menu.classList.remove("hidden");
  audio.pause();
}

function scoreValue(): number {
  return Math.floor(distance * 10 + killScore);
}

function clearObjects(): void {
  for (const object of objects) {
    objectRoot.remove(object.mesh);
    disposeRuntimeObject(object.mesh);
  }
  objects.length = 0;
}

function removeRunnerObject(index: number): void {
  const object = objects[index];
  objectRoot.remove(object.mesh);
  disposeRuntimeObject(object.mesh);
  objects.splice(index, 1);
}

function shiftLane(direction: number): void {
  if (state !== "running") return;
  laneIndex = THREE.MathUtils.clamp(laneIndex + direction, 0, LANES.length - 1);
  targetX = LANES[laneIndex];
}

function bindControls(): void {
  ui.play.addEventListener("click", startRun);
  ui.restart.addEventListener("click", startRun);
  ui.continueRun.addEventListener("click", continueRun);
  ui.backMenu.addEventListener("click", returnToMenu);
  ui.buyLife.addEventListener("click", () => buyUpgrade("life"));
  ui.buyCat.addEventListener("click", () => buyUpgrade("cat"));
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
      if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLSelectElement) return;
      startRun();
    }
  });
  canvas.addEventListener("pointerdown", (event) => {
    swipeStartX = event.clientX;
  });
  canvas.addEventListener("pointerup", (event) => {
    const delta = event.clientX - swipeStartX;
    if (Math.abs(delta) > 24) shiftLane(delta > 0 ? 1 : -1);
    else shiftLane(event.clientX < window.innerWidth / 2 ? -1 : 1);
  });
  window.addEventListener("resize", resize);
  new ResizeObserver(resize).observe(canvas);
}

function bindAppLifecycle(): void {
  const updateAudioState = (isActive: boolean): void => {
    if (!isActive) {
      audio.pause();
    } else if (state === "running") {
      audio.resume();
    }
  };
  document.addEventListener("visibilitychange", () => {
    updateAudioState(document.visibilityState === "visible");
  });
  window.addEventListener("pagehide", () => updateAudioState(false));
  window.addEventListener("pageshow", () => updateAudioState(true));
  if (Capacitor.isNativePlatform()) {
    void App.addListener("appStateChange", ({ isActive }) => updateAudioState(isActive));
  }
}

function resize(): void {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), maxPixelRatio);
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
  timer.update();
  const delta = Math.min(timer.getDelta(), 0.05);
  elapsed += delta;
  updateEnvironmentTransition(delta);

  if (state === "running") {
    runTime += delta;
    const speed = 12 * Math.min(MAX_SPEED, Math.pow(1 + runTime / 45, 1.25));
    const travel = speed * delta;
    stridePhase += delta * speed * 0.34;
    distance += travel * 0.34;
    spawnTravel += travel;
    moveWorld(travel);
    updatePack(delta);
    updateObjects(travel, delta);
    if (spawnTravel >= nextSpawn) {
      spawnTravel = 0;
      nextSpawn = THREE.MathUtils.randFloat(21, 29);
      spawnWave();
    }
    const nextLevel = Math.floor(distance / 250) + 1;
    if (nextLevel > level) {
      level = nextLevel;
      beginEnvironmentTransition(level - 1);
      showToast(t("toast.level", {
        level,
        world: t(getEnvironment(environmentIndex).nameKey),
      }));
      audio.victory();
    }
    ui.score.textContent = String(scoreValue());
    ui.speed.textContent = `${(speed / 12).toFixed(1)}×`;
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
      nextTile.position.z = wrappedZ;
      nextTile.userData.environmentIndex = environmentIndex;
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
  syncAccessoriesWithCurrentTrack();
  const theme = getEnvironment(environmentIndex);
  const baseIntensity = theme.id === "space" || theme.id === "dimension" ? 1.8 : 2.9;
  sun.intensity = baseIntensity + Math.sin(elapsed * 0.35) * 0.2;
  decorRoot.rotation.z = Math.sin(elapsed * 0.18) * 0.0015;
}

function syncAccessoriesWithCurrentTrack(): void {
  let currentTile: THREE.Group | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const tile of trackTiles) {
    const tileDistance = Math.abs(tile.position.z - PLAYER_Z);
    if (tileDistance >= closestDistance) continue;
    closestDistance = tileDistance;
    currentTile = tile;
  }
  const currentEnvironment = currentTile?.userData.environmentIndex;
  if (typeof currentEnvironment !== "number" || currentEnvironment === accessoryEnvironmentIndex) return;
  accessoryEnvironmentIndex = currentEnvironment;
  rebuildPack();
}

function updatePack(delta: number): void {
  playerRoot.position.x += (targetX - playerRoot.position.x) * Math.min(1, delta * 11);
  playerRoot.children.forEach((cat, index) => {
    const phase = Number(cat.userData.phase ?? 0);
    cat.position.y = 0.55 + Math.abs(Math.sin(stridePhase + phase)) * 0.2;
    cat.rotation.z = Math.sin(stridePhase + phase) * 0.05;
    const tail = cat.getObjectByName("tail");
    if (tail) tail.rotation.z = -0.4 + Math.sin(stridePhase * 2.2 + index) * 0.28;
  });
}

function updateObjects(travel: number, delta: number): void {
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    const object = objects[i];
    const previousZ = object.mesh.position.z;
    object.mesh.position.z += travel;
    if (object.type === "hint") {
      object.mesh.position.y = 0.06;
    } else if (object.type === "coin") {
      object.mesh.rotation.z = Math.sin(elapsed * 2.4 + object.phase) * 0.08;
      object.mesh.position.y = 0.55 + Math.sin(elapsed * 3.1 + object.phase) * 0.05;
    } else if (object.type === "tuna") {
      object.mesh.rotation.y += delta * 2.2;
      object.mesh.position.y = 0.3 + Math.sin(elapsed * 3.2 + object.phase) * 0.12;
    } else {
      object.mesh.position.y = 0.3 + Math.sin(elapsed * 3.2 + object.phase) * 0.12;
    }

    if (object.type === "hint") {
      if (object.mesh.position.z > PLAYER_Z + 9) removeRunnerObject(i);
      continue;
    }

    const closeZ =
      Math.abs(object.mesh.position.z - PLAYER_Z) < 1.25 ||
      (previousZ < PLAYER_Z && object.mesh.position.z > PLAYER_Z);
    if (closeZ && object.lane === laneIndex) {
      const hazard = object.type === "dog" || object.type === "carrier";
      if (!(hazard && runTime < invulnerableUntil)) collect(object);
      removeRunnerObject(i);
    } else if (object.mesh.position.z > PLAYER_Z + 9) {
      removeRunnerObject(i);
    }
  }
}

function collect(object: RunnerObject): void {
  const { type } = object;
  if (type === "hint") return;
  spawnScreenSparkles(type);
  if (type === "coin") {
    wallet += 1;
    audio.pickup(true);
    updateWalletUi();
    saveEconomy();
    showToast(t("toast.coin"), "coin");
    return;
  }
  if (object.type === "cat") {
    catCount += 1;
    killScore += 25;
    rebuildPack();
    audio.meow();
    showToast(t("toast.cat"), "cat");
    return;
  }
  if (object.type === "tuna") {
    tunaCount += 1;
    killScore += 20;
    audio.pickup();
    if (tunaCount >= 20) {
      tunaCount -= 20;
      extraLives += 1;
      audio.victory();
      showToast(t("toast.life"), "tuna");
    } else {
      showToast(t("toast.tuna", { count: tunaCount }), "tuna");
    }
    updateResourceHud();
    return;
  }
  if (object.type === "carrier") {
    audio.gameOver();
    showToast(t("toast.carrier"), "carrier");
    loseLife();
    return;
  }

  audio.bark();
  if (catCount > object.strength) {
    catCount -= object.strength;
    dogsDefeated += object.strength;
    killScore += object.strength * 85;
    rebuildPack();
    audio.victory();
    showToast(t("toast.battle", { score: object.strength * 85, cats: object.strength }), "dog");
  } else {
    loseLife();
  }
}

function loseLife(): void {
  if (extraLives <= 0) {
    continueSnapshot = {
      laneIndex,
      catCount: Math.max(1, catCount),
      distance,
      killScore,
      dogsDefeated,
      tunaCount,
      extraLives,
      level,
      environmentIndex,
      spawnTravel,
      nextSpawn,
      runTime,
      stridePhase,
    };
    catCount = 0;
    ui.cats.textContent = "0";
    endRun();
    return;
  }
  extraLives -= 1;
  if (extraLives < bankedLives) {
    bankedLives = extraLives;
    saveEconomy();
  }
  catCount = Math.max(1, catCount);
  invulnerableUntil = runTime + 2;
  rebuildPack();
  updateResourceHud();
  audio.victory();
  showToast(t("toast.lifeUsed"));
}

function loadEconomy(): void {
  try {
    const raw = localStorage.getItem(ECONOMY_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { coins?: number; lives?: number; cats?: number };
    wallet = Math.max(0, Math.floor(Number(saved.coins) || 0));
    bankedLives = Math.max(0, Math.floor(Number(saved.lives) || 0));
    purchasedCats = Math.max(0, Math.floor(Number(saved.cats) || 0));
  } catch {
    wallet = 0;
    bankedLives = 0;
    purchasedCats = 0;
  }
}

function saveEconomy(): void {
  localStorage.setItem(ECONOMY_KEY, JSON.stringify({
    coins: wallet,
    lives: bankedLives,
    cats: purchasedCats,
  }));
}

function spendCoins(cost: number): boolean {
  if (wallet < cost) {
    showToast(t("toast.needCoins"));
    return false;
  }
  wallet -= cost;
  updateWalletUi();
  saveEconomy();
  return true;
}

function buyUpgrade(kind: "life" | "cat"): void {
  if (state !== "menu") return;
  if (kind === "life") {
    if (!spendCoins(LIFE_COST)) return;
    bankedLives += 1;
    extraLives = bankedLives;
    saveEconomy();
    updateResourceHud();
    refreshShopUi();
    audio.pickup(true);
    showToast(t("toast.boughtLife"), "tuna");
    return;
  }
  if (!spendCoins(CAT_COST)) return;
  purchasedCats += 1;
  catCount = 1 + purchasedCats;
  saveEconomy();
  rebuildPack();
  refreshShopUi();
  audio.pickup(true);
  showToast(t("toast.boughtCat"), "cat");
}

function updateWalletUi(): void {
  ui.coins.textContent = String(wallet);
  ui.menuCoins.textContent = String(wallet);
  ui.finalCoins.textContent = String(wallet);
  ui.buyLife.classList.toggle("unaffordable", wallet < LIFE_COST);
  ui.buyCat.classList.toggle("unaffordable", wallet < CAT_COST);
  refreshContinueUi();
}

function refreshShopUi(): void {
  ui.shopStock.textContent = t("shop.stock", { lives: bankedLives, cats: purchasedCats });
  ui.buyLife.classList.toggle("unaffordable", wallet < LIFE_COST);
  ui.buyCat.classList.toggle("unaffordable", wallet < CAT_COST);
}

function refreshContinueUi(): void {
  ui.continueRun.classList.toggle("hidden", !continueSnapshot);
  ui.continueRun.disabled = !continueSnapshot;
}

function updateResourceHud(): void {
  ui.tuna.textContent = `${tunaCount}/20`;
  ui.lives.textContent = String(extraLives);
  updateWalletUi();
}

function spawnScreenSparkles(type: CollectEffect): void {
  const burst = document.createElement("div");
  burst.className = `collect-burst ${type}`;
  const flash = document.createElement("div");
  flash.className = "collect-flash";
  burst.append(flash);
  const sparkleCount = type === "coin"
    ? (mobileRendering ? 4 : 6)
    : mobileRendering
      ? (type === "carrier" ? 16 : 12)
      : (type === "carrier" ? 28 : 22);
  for (let index = 0; index < sparkleCount; index += 1) {
    const sparkle = document.createElement("i");
    sparkle.style.setProperty("--angle", `${(360 / sparkleCount) * index + Math.random() * 12}deg`);
    sparkle.style.setProperty("--distance", `${THREE.MathUtils.randInt(
      type === "coin" ? 36 : 90,
      type === "carrier" ? 270 : type === "coin" ? 78 : 220,
    )}px`);
    sparkle.style.setProperty("--delay", `${Math.random() * 90}ms`);
    sparkle.style.setProperty("--size", `${THREE.MathUtils.randInt(type === "coin" ? 3 : 5, type === "coin" ? 7 : 14)}px`);
    burst.append(sparkle);
  }
  ui.collectFx.append(burst);
  window.setTimeout(() => burst.remove(), 1000);
}

function showToast(message: string, effectType?: CollectEffect): void {
  ui.toast.textContent = message;
  ui.toast.className = "";
  void ui.toast.offsetWidth;
  if (effectType) ui.toast.classList.add("collect-message", effectType);
  ui.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    ui.toast.className = "";
  }, effectType ? 950 : 900);
}
