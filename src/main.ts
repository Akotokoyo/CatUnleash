import * as THREE from "three";
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
type PickupType = "milk" | "tuna" | "mouse" | "obstacle";

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
const jade = new THREE.MeshStandardMaterial({ color: 0x25a57e, roughness: 0.62, metalness: 0.08 });
const gold = new THREE.MeshStandardMaterial({ color: 0xe8b83f, roughness: 0.42, metalness: 0.35 });
const terracotta = new THREE.MeshStandardMaterial({ color: 0xac4f2d, roughness: 0.82 });
const cream = new THREE.MeshStandardMaterial({ color: 0xf7e3a6, roughness: 0.72 });
const obsidian = new THREE.MeshStandardMaterial({ color: 0x13201e, roughness: 0.35, metalness: 0.25 });
const mouseMat = new THREE.MeshStandardMaterial({ color: 0x7b665c, roughness: 0.85 });

const canvas = mustElement<HTMLCanvasElement>("game");

const ui = {
  menu: mustElement("menu"),
  gameover: mustElement("gameover"),
  hud: mustElement("hud"),
  play: mustElement<HTMLButtonElement>("play"),
  restart: mustElement<HTMLButtonElement>("restart"),
  sound: mustElement<HTMLButtonElement>("sound"),
  language: mustElement<HTMLSelectElement>("language"),
  score: mustElement("score"),
  cats: mustElement("cats"),
  speed: mustElement("speed"),
  tuna: mustElement("tuna"),
  lives: mustElement("lives"),
  finalScore: mustElement("final-score"),
  finalDistance: mustElement("final-distance"),
  finalMice: mustElement("final-mice"),
  toast: mustElement("toast"),
};

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
let miceDefeated = 0;
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
let language: Language = "en";

setEnvironment(0);
rebuildPack();
applyLanguage();
bindControls();
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

function rebuildPack(): void {
  playerRoot.clear();
  const shown = Math.min(catCount, 7);
  for (let i = 0; i < shown; i += 1) {
    const palette = [0xe58a31, 0xf1d28a, 0x57514c, 0xc9613d, 0xe3e0d2];
    const cat = makeCat(palette[i % palette.length]);
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

function makeMilk(): THREE.Group {
  const group = new THREE.Group();
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.92, 12), cream);
  bottle.position.y = 0.58;
  bottle.castShadow = true;
  group.add(bottle);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.27, 12), cream);
  neck.position.y = 1.15;
  group.add(neck);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12), gold);
  cap.position.y = 1.34;
  group.add(cap);
  const glyph = new THREE.Mesh(new THREE.CircleGeometry(0.18, 12), jade);
  glyph.position.set(0, 0.62, -0.37);
  group.add(glyph);
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

function makeMousePack(strength: number): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < Math.min(strength, 5); i += 1) {
    const mouse = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 7), mouseMat);
    body.scale.set(0.85, 0.75, 1.35);
    body.position.y = 0.38;
    body.castShadow = true;
    mouse.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 7), mouseMat);
    head.position.set(0, 0.52, -0.35);
    mouse.add(head);
    for (const x of [-0.17, 0.17]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), terracotta);
      ear.position.set(x, 0.71, -0.36);
      mouse.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 5), obsidian);
    nose.position.set(0, 0.47, -0.58);
    mouse.add(nose);
    mouse.position.set((i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.45, 0.1, Math.floor(i / 2) * 0.6);
    group.add(mouse);
  }
  const badge = makeBadge(strength);
  badge.position.set(0, 1.55, 0);
  group.add(badge);
  return group;
}

function makeBadge(value: number): THREE.Sprite {
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
    spawnObject("milk", laneOrder[0], 0);
    spawnObject("mouse", laneOrder[1], randomStrength());
  } else if (roll < 0.4) {
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
  const mesh =
    type === "milk"
      ? makeMilk()
      : type === "tuna"
        ? makeTuna()
        : type === "obstacle"
          ? makeObstacle()
          : makeMousePack(strength);
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
  miceDefeated = 0;
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
  audio.hit();
  ui.hud.classList.add("hidden");
  ui.finalScore.textContent = String(scoreValue());
  ui.finalDistance.textContent = `${Math.floor(distance)}m`;
  ui.finalMice.textContent = String(miceDefeated);
  ui.gameover.classList.remove("hidden");
}

function scoreValue(): number {
  return Math.floor(distance * 10 + killScore);
}

function clearObjects(): void {
  for (const object of objects) objectRoot.remove(object.mesh);
  objects.length = 0;
}

function shiftLane(direction: number): void {
  if (state !== "running") return;
  laneIndex = THREE.MathUtils.clamp(laneIndex + direction, 0, LANES.length - 1);
  targetX = LANES[laneIndex];
}

function bindControls(): void {
  ui.play.addEventListener("click", startRun);
  ui.restart.addEventListener("click", startRun);
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
    if (object.type !== "obstacle") {
      object.mesh.rotation.y += delta * (object.type === "mouse" ? 1.2 : 2.2);
    }
    object.mesh.position.y = 0.3 + Math.sin(elapsed * 3.2 + object.phase) * 0.12;

    const closeZ =
      Math.abs(object.mesh.position.z - PLAYER_Z) < 1.25 ||
      (previousZ < PLAYER_Z && object.mesh.position.z > PLAYER_Z);
    if (closeZ && object.lane === laneIndex && runTime < invulnerableUntil) {
      objectRoot.remove(object.mesh);
      objects.splice(i, 1);
    } else if (closeZ && object.lane === laneIndex) {
      collect(object);
      objectRoot.remove(object.mesh);
      objects.splice(i, 1);
    } else if (object.mesh.position.z > PLAYER_Z + 9) {
      objectRoot.remove(object.mesh);
      objects.splice(i, 1);
    }
  }
}

function collect(object: RunnerObject): void {
  if (object.type === "milk") {
    catCount += 1;
    killScore += 25;
    rebuildPack();
    audio.pickup(true);
    showToast(t("toast.cat"));
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
      showToast(t("toast.life"));
    } else {
      showToast(t("toast.tuna", { count: tunaCount }));
    }
    updateResourceHud();
    return;
  }
  if (object.type === "obstacle") {
    showToast(t("toast.barrier"));
    loseLife();
    return;
  }

  if (catCount > object.strength) {
    catCount -= object.strength;
    miceDefeated += object.strength;
    killScore += object.strength * 85;
    rebuildPack();
    audio.victory();
    showToast(t("toast.battle", { score: object.strength * 85, cats: object.strength }));
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

function showToast(message: string): void {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.remove("show"), 900);
}
