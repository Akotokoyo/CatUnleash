import * as THREE from "three";
import "./style.css";
import { CityAudio } from "./audio";

type RunState = "menu" | "running" | "gameover";
type PickupType = "milk" | "tuna" | "mouse" | "obstacle";

interface RunnerObject {
  mesh: THREE.Group;
  type: PickupType;
  lane: number;
  strength: number;
  phase: number;
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
const asphalt = new THREE.MeshStandardMaterial({ color: 0x343b43, roughness: 0.96 });
const concrete = new THREE.MeshStandardMaterial({ color: 0xa9adb0, roughness: 0.9 });
const roadPaint = new THREE.MeshStandardMaterial({ color: 0xf6df88, roughness: 0.78 });

const canvas = mustElement<HTMLCanvasElement>("game");

const ui = {
  menu: mustElement("menu"),
  gameover: mustElement("gameover"),
  hud: mustElement("hud"),
  play: mustElement<HTMLButtonElement>("play"),
  restart: mustElement<HTMLButtonElement>("restart"),
  sound: mustElement<HTMLButtonElement>("sound"),
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

createSky();
createTrack();
rebuildPack();
bindControls();
resize();
renderer.setAnimationLoop(update);

function mustElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento #${id} non trovato`);
  return element as T;
}

function createSky(): void {
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(7, 48),
    new THREE.MeshBasicMaterial({ color: 0xffe59b, fog: false }),
  );
  sunDisc.position.set(-24, 25, -110);
  scene.add(sunDisc);

  const cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xf5fbff, transparent: true, opacity: 0.72, fog: false });
  for (let i = 0; i < 8; i += 1) {
    const cloud = new THREE.Group();
    for (let puff = 0; puff < 4; puff += 1) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.8 + (puff % 2) * 0.6, 10, 7), cloudMaterial);
      mesh.position.set(puff * 2.1, Math.sin(puff) * 0.5, 0);
      mesh.scale.y = 0.65;
      cloud.add(mesh);
    }
    cloud.position.set(-35 + (i % 4) * 24, 16 + (i % 3) * 5, -60 - Math.floor(i / 4) * 35);
    scene.add(cloud);
  }
}

function createTrack(): void {
  for (let i = 0; i < TRACK_TILES; i += 1) {
    const tile = makeTrackTile();
    tile.position.z = PLAYER_Z - i * TRACK_LENGTH;
    trackTiles.push(tile);
    trackRoot.add(tile);

    const decor = makeDecorTile(i);
    decor.position.z = PLAYER_Z - i * TRACK_LENGTH;
    decorTiles.push(decor);
    decorRoot.add(decor);
  }
}

function makeTrackTile(): THREE.Group {
  const group = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.55, TRACK_LENGTH), asphalt);
  slab.receiveShadow = true;
  group.add(slab);

  for (const x of [-5.35, 5.35]) {
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.72, TRACK_LENGTH), concrete);
    sidewalk.position.set(x, 0.08, 0);
    sidewalk.receiveShadow = true;
    group.add(sidewalk);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, TRACK_LENGTH), roadPaint);
    curb.position.set(x + (x < 0 ? 0.68 : -0.68), 0.43, 0);
    group.add(curb);
  }

  for (const x of [-1.35, 1.35]) {
    for (let z = -5.3; z <= 5.3; z += 3.5) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 1.75), roadPaint);
      dash.position.set(x, 0.3, z);
      group.add(dash);
    }
  }

  return group;
}

function makeDecorTile(index: number): THREE.Group {
  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    const x = side * 8.7;
    group.add(makeBuilding(x, -3.6, index * 2 + (side > 0 ? 1 : 0)));
    group.add(makeBuilding(x, 4.4, index * 2 + (side > 0 ? 7 : 4)));
    group.add(makeStreetLight(side * 5.25, 1.5, side));
  }
  return group;
}

function makeBuilding(x: number, z: number, seed: number): THREE.Group {
  const building = new THREE.Group();
  const colors = [0xe8755d, 0x5c8fc4, 0xe2b65b, 0x6fa587, 0x9a78ad, 0xd9894c];
  const width = 4.6 + (seed % 3) * 0.65;
  const height = 6 + (seed % 5) * 1.65;
  const depth = 5.5;
  const wallMaterial = new THREE.MeshStandardMaterial({ color: colors[seed % colors.length], roughness: 0.86 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMaterial);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  building.add(body);

  const windowMaterial = new THREE.MeshStandardMaterial({
    color: seed % 2 === 0 ? 0x9fe1f2 : 0xffd77d,
    emissive: seed % 2 === 0 ? 0x163b4b : 0x4c3611,
    emissiveIntensity: 0.35,
    roughness: 0.28,
  });
  for (let floor = 1.5; floor < height - 0.6; floor += 1.65) {
    for (const windowX of [-width * 0.25, width * 0.25]) {
      const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.82, 0.08), windowMaterial);
      windowMesh.position.set(windowX, floor, depth / 2 + 0.05);
      building.add(windowMesh);
    }
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 0.28, depth + 0.3), concrete);
  roof.position.y = height + 0.12;
  building.add(roof);
  building.position.set(x, -0.2, z);
  return building;
}

function makeStreetLight(x: number, z: number, side: number): THREE.Group {
  const light = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.2, 8), obsidian);
  pole.position.y = 2.1;
  light.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.1, 0.1), obsidian);
  arm.position.set(-side * 0.36, 4.1, 0);
  light.add(arm);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffdf78, emissive: 0xffb62e, emissiveIntensity: 1.4 }),
  );
  lamp.position.set(-side * 0.75, 3.98, 0);
  light.add(lamp);
  light.position.set(x, 0.4, z);
  return light;
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
  const shown = Math.min(catCount, 13);
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
  rebuildPack();
  updateResourceHud();
  playerRoot.position.x = targetX;
  ui.menu.classList.add("hidden");
  ui.gameover.classList.add("hidden");
  ui.hud.classList.remove("hidden");
  audio.start();
  showToast("CORRI!");
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

  if (state === "running") {
    runTime += delta;
    const speed = 12 * Math.min(5, Math.pow(1 + runTime / 45, 1.25));
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
      showToast(`LIVELLO ${level}`);
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
  for (const tile of trackTiles) {
    tile.position.z += travel;
    if (tile.position.z > PLAYER_Z + TRACK_LENGTH) tile.position.z -= TRACK_LENGTH * TRACK_TILES;
  }
  for (const decor of decorTiles) {
    decor.position.z += travel;
    if (decor.position.z > PLAYER_Z + TRACK_LENGTH) decor.position.z -= TRACK_LENGTH * TRACK_TILES;
  }
  sun.intensity = 2.9 + Math.sin(elapsed * 0.35) * 0.25;
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
    showToast("+1 GATTO");
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
      showToast("+1 VITA!");
    } else {
      showToast(`TONNO ${tunaCount}/20`);
    }
    updateResourceHud();
    return;
  }
  if (object.type === "obstacle") {
    showToast("BARRIERA!");
    loseLife();
    return;
  }

  if (catCount > object.strength) {
    catCount -= object.strength;
    miceDefeated += object.strength;
    killScore += object.strength * 85;
    rebuildPack();
    audio.victory();
    showToast(`+${object.strength * 85} · -${object.strength} GATTI`);
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
  showToast("VITA EXTRA USATA!");
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
