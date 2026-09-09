import * as THREE from "three";
import {
  cream,
  gold,
  LANES,
  MAX_PUG_STRENGTH,
  OBSTACLE_SPRITE_HEIGHT,
  PUG_BARK_SPRITE_SCALE,
  PUG_IDLE_SPRITE_SCALE,
  PUG_SPRITE_HEIGHT,
  terracotta,
  WAVE_TICK_DEPTH,
  WAVE_TICKS_PER_SPAWN,
} from "./constants";
import { spawnCatPickup } from "./cats";
import type { PickupType, RunnerObject } from "./types";
import { game, objectRoot, objects, textures } from "./state";
import { nextWaveTick } from "./wavePatterns";
import {
  makeTexturedPlane,
  resizeTexturedPlane,
  setTexturedPlaneFlip,
  setTexturedPlaneTexture,
} from "./threeUtils";

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

export function buildTunaFlyImageUrl(): string {
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
  const texture = textures.obstacle;
  if (!texture) throw new Error("Texture accalappiacani mancante");
  const group = new THREE.Group();
  group.add(makeTexturedPlane(texture, OBSTACLE_SPRITE_HEIGHT));
  return group;
}

function makePugSprite(texture: THREE.Texture, flipX: 1 | -1 = 1): THREE.Mesh {
  const plane = makeTexturedPlane(texture, PUG_SPRITE_HEIGHT, flipX);
  plane.userData.pugSprite = true;
  return plane;
}

function setPugPackTexture(group: THREE.Group, texture: THREE.Texture): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.userData.pugSprite) return;
    setTexturedPlaneTexture(child, texture);
  });
}

function setPugPackFlip(group: THREE.Group, flipX: 1 | -1): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.userData.pugSprite) return;
    setTexturedPlaneFlip(child, flipX);
  });
}

function setPugPackScale(group: THREE.Group, height: number): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.userData.pugSprite) return;
    const texture = (child.material as THREE.MeshBasicMaterial).map;
    if (!texture) return;
    resizeTexturedPlane(child, texture, height);
  });
}

function makeMousePack(strength: number): THREE.Group {
  const group = new THREE.Group();
  const count = Math.min(strength, MAX_PUG_STRENGTH);
  for (let i = 0; i < count; i += 1) {
    const pug = makePugSprite(textures.pugIdle!);
    pug.userData.pugSprite = true;
    pug.position.set((i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.55, 0.55, Math.floor(i / 2) * 0.65);
    group.add(pug);
  }
  return group;
}

export function pugsDominate(strength: number): boolean {
  return strength >= game.catCount;
}

export function syncPugPackMood(object: RunnerObject): void {
  if (object.type !== "mouse" || object.resolved) return;
  const mood = pugsDominate(object.strength) ? "bark" : "idle";
  if (object.mesh.userData.pugMood === mood) return;
  object.mesh.userData.pugMood = mood;
  const bark = mood === "bark";
  setPugPackTexture(object.mesh, bark ? textures.pugBark! : textures.pugIdle!);
  setPugPackScale(
    object.mesh,
    PUG_SPRITE_HEIGHT * (bark ? PUG_BARK_SPRITE_SCALE : PUG_IDLE_SPRITE_SCALE),
  );
  setPugPackFlip(object.mesh, 1);
}

export function spawnWave(): void {
  for (let waveTick = 0; waveTick < WAVE_TICKS_PER_SPAWN; waveTick += 1) {
    const tick = nextWaveTick();
    const depth = waveTick * WAVE_TICK_DEPTH;
    for (let lane = 0; lane < tick.length; lane += 1) {
      const cell = tick[lane];
      if (!cell) continue;
      spawnObject(cell.type, lane, cell.strength, depth);
    }
  }
}

function spawnObject(type: PickupType, lane: number, strength: number, depth = 0): void {
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
  mesh.position.set(LANES[lane], 0.3, -86 - Math.random() * 4 - depth);
  objectRoot.add(mesh);
  const runner: RunnerObject = { mesh, type, lane, strength, phase: Math.random() * Math.PI * 2 };
  objects.push(runner);
  if (type === "mouse") syncPugPackMood(runner);
}

export function clearObjects(): void {
  for (const object of objects) objectRoot.remove(object.mesh);
  objects.length = 0;
}
