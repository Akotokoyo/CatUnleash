import * as THREE from "three";
import {
  cream,
  gold,
  LANES,
  MAX_PUG_STRENGTH,
  obsidian,
  terracotta,
} from "./constants";
import { spawnCatPickup } from "./cats";
import type { PickupType, RunnerObject } from "./types";
import { game, objectRoot, objects, textures } from "./state";

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
    const pug = makePugSprite(textures.pugIdle!);
    pug.userData.pugSprite = true;
    pug.position.set((i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.55, 0.55, Math.floor(i / 2) * 0.65);
    group.add(pug);
  }
  return group;
}

function pugsInMajority(strength: number): boolean {
  return strength >= game.catCount;
}

export function syncPugPackMood(object: RunnerObject): void {
  if (object.type !== "mouse" || object.resolved) return;
  const mood = pugsInMajority(object.strength) ? "bark" : "idle";
  if (object.mesh.userData.pugMood === mood) return;
  object.mesh.userData.pugMood = mood;
  setPugPackTexture(object.mesh, mood === "bark" ? textures.pugBark! : textures.pugIdle!);
  setPugPackFlip(object.mesh, 1);
}

function randomStrength(): number {
  return 1 + Math.floor(Math.random() * MAX_PUG_STRENGTH);
}

export function spawnWave(): void {
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

export function clearObjects(): void {
  for (const object of objects) objectRoot.remove(object.mesh);
  objects.length = 0;
}
