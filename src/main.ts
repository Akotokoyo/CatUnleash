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
type PickupType = "cat" | "tuna" | "dog" | "carrier";
type AnimalKind = "cat" | "dog";

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
const CAT_COLORS = [0xe58a31, 0xf1d28a, 0x57514c, 0xc9613d, 0xe3e0d2];
const gold = new THREE.MeshStandardMaterial({ color: 0xe8b83f, roughness: 0.42, metalness: 0.35 });
const terracotta = new THREE.MeshStandardMaterial({ color: 0xac4f2d, roughness: 0.82 });
const cream = new THREE.MeshStandardMaterial({ color: 0xf7e3a6, roughness: 0.72 });
const obsidian = new THREE.MeshStandardMaterial({ color: 0x13201e, roughness: 0.35, metalness: 0.25 });
const sharedMaterials = new Set<THREE.Material>([gold, terracotta, cream, obsidian]);

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
  finalScore: mustElement("final-score"),
  finalDistance: mustElement("final-distance"),
  finalDogs: mustElement("final-dogs"),
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

setEnvironment(0);
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

function makeCat(color = 0xe48b31): THREE.Group {
  const cat = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color, roughness: 0.78 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 9), fur);
  body.scale.set(0.9, 1, 1.35);
  body.position.y = 0.65;
  body.castShadow = true;
  cat.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 9), fur);
  head.position.set(0, 1.25, -0.34);
  head.castShadow = true;
  cat.add(head);
  for (const x of [-0.22, 0.22]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.42, 4), fur);
    ear.position.set(x, 1.62, -0.35);
    ear.rotation.z = x < 0 ? 0.12 : -0.12;
    cat.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), gold);
    eye.position.set(x * 0.55, 1.3, -0.71);
    cat.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), obsidian);
  nose.position.set(0, 1.18, -0.74);
  cat.add(nose);
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.075, 7, 12, Math.PI * 1.35), fur);
  tail.position.set(0.38, 0.8, 0.55);
  tail.rotation.set(Math.PI / 2, 0.3, -0.4);
  tail.name = "tail";
  cat.add(tail);
  for (const x of [-0.25, 0.25]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.35, 4, 7), fur);
    leg.position.set(x, 0.28, -0.15);
    cat.add(leg);
  }
  return cat;
}

function addAnimalAccessory(animal: THREE.Group, kind: AnimalKind, worldIndex: number): void {
  const worldId = getEnvironment(worldIndex).id;
  const accessory = new THREE.Group();
  accessory.name = "world-accessory";
  const headY = kind === "cat" ? 1.58 : 1.28;
  const headZ = kind === "cat" ? -0.34 : -0.4;
  const faceY = kind === "cat" ? 1.3 : 1.08;
  const faceZ = kind === "cat" ? -0.75 : -0.74;
  const size = kind === "cat" ? 1 : 0.86;

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
      new THREE.SphereGeometry((kind === "cat" ? 0.55 : 0.47), 12, 8),
      glass,
    );
    helmet.position.set(0, kind === "cat" ? 1.31 : 1.06, headZ);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry((kind === "cat" ? 0.42 : 0.36), 0.05, 7, 16),
      cream,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, kind === "cat" ? 0.98 : 0.78, headZ + 0.04);
    const backpack = new THREE.Mesh(
      new THREE.BoxGeometry(0.52 * size, 0.62 * size, 0.22),
      cream,
    );
    backpack.position.set(0, kind === "cat" ? 0.78 : 0.6, 0.48);
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
  animal.add(accessory);
}

function rebuildPack(): void {
  for (const child of playerRoot.children) disposeRuntimeObject(child);
  playerRoot.clear();
  const shown = Math.min(catCount, 7);
  for (let i = 0; i < shown; i += 1) {
    const cat = makeCat(CAT_COLORS[i % CAT_COLORS.length]);
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
  const color = CAT_COLORS[Math.floor(Math.random() * CAT_COLORS.length)];
  const cat = makeCat(color);
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
  plusVertical.position.set(0, 1.95, 0);
  plusHorizontal.position.copy(plusVertical.position);
  group.add(plusVertical, plusHorizontal);
  return group;
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

function makeCarrier(): THREE.Group {
  const group = new THREE.Group();
  const upperMaterial = new THREE.MeshStandardMaterial({ color: 0xdce5e5, roughness: 0.7, flatShading: true });
  const lowerMaterial = new THREE.MeshStandardMaterial({ color: 0x4a5255, roughness: 0.78, flatShading: true });
  const metal = new THREE.MeshStandardMaterial({ color: 0x252c2e, roughness: 0.38, metalness: 0.62 });
  const gridMetal = new THREE.MeshStandardMaterial({ color: 0xd6dfdd, roughness: 0.28, metalness: 0.78 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.72, 1.65), lowerMaterial);
  base.position.y = 0.38;
  base.castShadow = true;
  group.add(base);

  const shell = new THREE.Mesh(makeTaperedCarrierShell(), upperMaterial);
  shell.position.y = 0.68;
  shell.castShadow = true;
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
    for (const z of [-0.34, -0.1, 0.14, 0.38]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.48, 0.075), metal);
      vent.position.set(x, 1.28, z);
      group.add(vent);
    }
  }

  for (const x of [-0.28, 0.28]) {
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1), metal);
    support.position.set(x, 1.88, 0.05);
    group.add(support);
  }
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.1, 0.14), metal);
  handle.position.set(0, 2.01, 0.05);
  group.add(handle);
  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.12), gold);
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

function makeDogPack(strength: number): THREE.Group {
  const group = new THREE.Group();
  const dogColors = [0x9a6744, 0xd09a58, 0x5e514b, 0xc4785b, 0xe1c18d];
  for (let i = 0; i < Math.min(strength, 5); i += 1) {
    const dog = new THREE.Group();
    const fur = new THREE.MeshStandardMaterial({
      color: dogColors[i % dogColors.length],
      roughness: 0.85,
    });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 11, 8), fur);
    body.scale.set(0.9, 0.9, 1.35);
    body.position.y = 0.58;
    body.castShadow = true;
    dog.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 11, 8), fur);
    head.position.set(0, 1.02, -0.42);
    dog.add(head);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.17, 9, 7), cream);
    muzzle.scale.set(1, 0.72, 1.2);
    muzzle.position.set(0, 0.93, -0.69);
    dog.add(muzzle);
    for (const x of [-0.26, 0.26]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.42, 5), fur);
      ear.position.set(x, 1.27, -0.37);
      ear.rotation.z = x < 0 ? 0.45 : -0.45;
      dog.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.038, 7, 5), obsidian);
      eye.scale.z = 0.3;
      eye.position.set(x * 0.5, 1.08, -0.735);
      dog.add(eye);
      for (const z of [-0.18, 0.32]) {
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.34, 4, 7), fur);
        leg.position.set(x, 0.25, z);
        dog.add(leg);
      }
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.065, 7, 5), obsidian);
    nose.position.set(0, 0.96, -0.86);
    dog.add(nose);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.65, 7), fur);
    tail.position.set(0.35, 0.78, 0.52);
    tail.rotation.z = -0.82;
    dog.add(tail);
    addAnimalAccessory(dog, "dog", accessoryEnvironmentIndex);
    dog.rotation.y = Math.PI;
    dog.position.set((i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.55, 0.08, Math.floor(i / 2) * 0.75);
    group.add(dog);
  }
  const badge = makeBadge(`−${strength}`);
  badge.position.set(0, 1.8, 0);
  group.add(badge);
  return group;
}

function makeBadge(value: string | number): THREE.Sprite {
  const badgeCanvas = document.createElement("canvas");
  badgeCanvas.width = badgeCanvas.height = 128;
  const context = badgeCanvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D non disponibile");
  context.fillStyle = "#9f321f";
  context.beginPath();
  context.arc(64, 64, 54, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#f1c44c";
  context.lineWidth = 10;
  context.stroke();
  context.fillStyle = "#fff5bd";
  context.font = "bold 62px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(value), 64, 68);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(badgeCanvas) }));
  sprite.scale.set(1.25, 1.25, 1);
  return sprite;
}

function spawnWave(): void {
  const laneOrder = [0, 1, 2].sort(() => Math.random() - 0.5);
  const roll = Math.random();
  if (roll < 0.22) {
    spawnObject("cat", laneOrder[0], 0);
    spawnObject("dog", laneOrder[1], randomStrength());
  } else if (roll < 0.4) {
    spawnObject("tuna", laneOrder[0], 0);
    spawnObject("dog", laneOrder[1], randomStrength());
  } else if (roll < 0.72) {
    spawnObject("dog", laneOrder[0], randomStrength());
    spawnObject("dog", laneOrder[1], randomStrength());
  } else if (roll < 0.88) {
    spawnObject("dog", laneOrder[0], randomStrength());
  } else {
    spawnObject("carrier", laneOrder[0], 0);
    spawnObject("dog", laneOrder[1], randomStrength());
  }
}

function spawnObject(type: PickupType, lane: number, strength: number): void {
  const mesh =
    type === "cat"
      ? makeRecruitCat()
      : type === "tuna"
        ? makeTuna()
        : type === "carrier"
          ? makeCarrier()
          : makeDogPack(strength);
  mesh.position.set(LANES[lane], 0.3, -86 - Math.random() * 4);
  objectRoot.add(mesh);
  objects.push({ mesh, type, lane, strength, phase: Math.random() * Math.PI * 2 });
}

function randomStrength(): number {
  const maximum = Math.min(8, 2 + level);
  return 1 + Math.floor(Math.random() * maximum);
}

function startRun(): void {
  clearObjects();
  state = "running";
  laneIndex = 1;
  targetX = LANES[laneIndex];
  catCount = 1;
  distance = 0;
  killScore = 0;
  dogsDefeated = 0;
  tunaCount = 0;
  extraLives = 0;
  level = 1;
  spawnTravel = 0;
  nextSpawn = 20;
  runTime = 0;
  stridePhase = 0;
  invulnerableUntil = 0;
  setEnvironment(0);
  rebuildPack();
  updateResourceHud();
  playerRoot.position.x = targetX;
  ui.menu.classList.add("hidden");
  ui.gameover.classList.add("hidden");
  ui.hud.classList.remove("hidden");
  audio.start();
  showToast(t("toast.run"));
}

function endRun(): void {
  state = "gameover";
  ui.hud.classList.add("hidden");
  ui.finalScore.textContent = String(scoreValue());
  ui.finalDistance.textContent = `${Math.floor(distance)}m`;
  ui.finalDogs.textContent = String(dogsDefeated);
  ui.gameover.classList.remove("hidden");
}

function returnToMenu(): void {
  state = "menu";
  clearObjects();
  setEnvironment(0);
  catCount = 1;
  laneIndex = 1;
  targetX = LANES[laneIndex];
  playerRoot.position.x = targetX;
  rebuildPack();
  updateResourceHud();
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
  ui.backMenu.addEventListener("click", returnToMenu);
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
    if ((event.key === " " || event.key === "Enter") && state !== "running") startRun();
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
    const speed = 12 * Math.min(7, Math.pow(1 + runTime / 45, 1.25));
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
    if (object.type === "tuna") object.mesh.rotation.y += delta * 2.2;
    object.mesh.position.y = 0.3 + Math.sin(elapsed * 3.2 + object.phase) * 0.12;

    const closeZ =
      Math.abs(object.mesh.position.z - PLAYER_Z) < 1.25 ||
      (previousZ < PLAYER_Z && object.mesh.position.z > PLAYER_Z);
    if (closeZ && object.lane === laneIndex && runTime < invulnerableUntil) {
      removeRunnerObject(i);
    } else if (closeZ && object.lane === laneIndex) {
      collect(object);
      removeRunnerObject(i);
    } else if (object.mesh.position.z > PLAYER_Z + 9) {
      removeRunnerObject(i);
    }
  }
}

function collect(object: RunnerObject): void {
  spawnScreenSparkles(object.type);
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
  ui.tuna.textContent = `${tunaCount}/20`;
  ui.lives.textContent = String(extraLives);
}

function spawnScreenSparkles(type: PickupType): void {
  const burst = document.createElement("div");
  burst.className = `collect-burst ${type}`;
  const flash = document.createElement("div");
  flash.className = "collect-flash";
  burst.append(flash);
  const sparkleCount = mobileRendering
    ? (type === "carrier" ? 16 : 12)
    : (type === "carrier" ? 28 : 22);
  for (let index = 0; index < sparkleCount; index += 1) {
    const sparkle = document.createElement("i");
    sparkle.style.setProperty("--angle", `${(360 / sparkleCount) * index + Math.random() * 12}deg`);
    sparkle.style.setProperty("--distance", `${THREE.MathUtils.randInt(90, type === "carrier" ? 270 : 220)}px`);
    sparkle.style.setProperty("--delay", `${Math.random() * 90}ms`);
    sparkle.style.setProperty("--size", `${THREE.MathUtils.randInt(5, 14)}px`);
    burst.append(sparkle);
  }
  ui.collectFx.append(burst);
  window.setTimeout(() => burst.remove(), 1000);
}

function showToast(message: string, effectType?: PickupType): void {
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
