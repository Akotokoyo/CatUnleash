import * as THREE from "three";
import type { BurstParticle, FlashParticle, FlyParticle, TrailParticle } from "./types";
import { MAX_EXTRA_LIVES } from "./constants";
import {
  canvas,
  hudTargetCenter,
  pulseHudStat,
  screenFlyCenter,
  showToast,
  ui,
} from "./dom";
import { t } from "./locale";
import { audio, game, renderer } from "./state";
import { worldToScreen } from "./screen";

const flyScene = new THREE.Scene();
const flyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
flyCamera.position.z = 10;

const textureLoader = new THREE.TextureLoader();

const flyParticles: FlyParticle[] = [];
const flyTrails: TrailParticle[] = [];
const flyBursts: BurstParticle[] = [];
const flyFlashes: FlashParticle[] = [];

const MAX_FLY_TRAILS = 18;
const TRAIL_INTERVAL = 0.048;
const ICON_SIZE = 86;

let viewW = 1;
let viewH = 1;
let tunaTexture: THREE.Texture | undefined;
let pugTexture: THREE.Texture | undefined;
let softTexture: THREE.Texture | undefined;

let flyLayoutCache: {
  via: { x: number; y: number };
  targets: Map<HTMLElement, { x: number; y: number }>;
} | undefined;

function softMap(): THREE.Texture {
  if (softTexture) return softTexture;
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context missing");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.75)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  softTexture = new THREE.CanvasTexture(c);
  softTexture.colorSpace = THREE.SRGBColorSpace;
  return softTexture;
}

function makeSprite(map: THREE.Texture, color: number, size: number, opacity = 1): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map,
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size, size, 1);
  sprite.position.z = 1;
  sprite.renderOrder = 10;
  return sprite;
}

function disposeSprite(sprite: THREE.Sprite): void {
  flyScene.remove(sprite);
  sprite.material.dispose();
}

function canvasPoint(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function flyViaPoint(): { x: number; y: number } {
  if (!flyLayoutCache) flyLayoutCache = { via: canvasPoint(screenFlyCenter().x, screenFlyCenter().y), targets: new Map() };
  return flyLayoutCache.via;
}

function flyTargetPoint(targetEl: HTMLElement): { x: number; y: number } {
  if (!flyLayoutCache) flyLayoutCache = { via: canvasPoint(screenFlyCenter().x, screenFlyCenter().y), targets: new Map() };
  let target = flyLayoutCache.targets.get(targetEl);
  if (!target) {
    const c = hudTargetCenter(targetEl);
    target = canvasPoint(c.x, c.y);
    flyLayoutCache.targets.set(targetEl, target);
  }
  return target;
}

function setSpriteXY(sprite: THREE.Sprite, x: number, y: number, scaleX: number, scaleY: number, opacity: number): void {
  // canvas (origin top-left) → ortho HUD (origin center, Y up)
  sprite.position.set(x - viewW * 0.5, viewH * 0.5 - y, 1);
  sprite.scale.set(scaleX, scaleY, 1);
  sprite.material.opacity = opacity;
}

function iconScale(texture: THREE.Texture, base: number): { w: number; h: number } {
  const img = texture.image as { width?: number; height?: number } | undefined;
  const w = img?.width ?? 1;
  const h = img?.height ?? 1;
  const aspect = w / Math.max(h, 1);
  if (aspect >= 1) return { w: base, h: base / aspect };
  return { w: base * aspect, h: base };
}

export function syncFlyOverlaySize(): void {
  viewW = Math.max(1, canvas.clientWidth);
  viewH = Math.max(1, canvas.clientHeight);
  flyCamera.left = -viewW * 0.5;
  flyCamera.right = viewW * 0.5;
  flyCamera.top = viewH * 0.5;
  flyCamera.bottom = -viewH * 0.5;
  flyCamera.updateProjectionMatrix();
}

export function renderFlyOverlay(): void {
  if (
    flyParticles.length === 0 &&
    flyTrails.length === 0 &&
    flyBursts.length === 0 &&
    flyFlashes.length === 0
  ) {
    return;
  }
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(flyScene, flyCamera);
  renderer.autoClear = true;
}

function adoptFlyTexture(kind: "tuna" | "pug", tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  if (kind === "tuna") {
    tunaTexture?.dispose();
    tunaTexture = tex;
  } else {
    pugTexture?.dispose();
    pugTexture = tex;
  }
}

export function setTunaFlyImageUrl(url: string): void {
  textureLoader.load(url, (tex) => adoptFlyTexture("tuna", tex));
}

export function setPugFlyImageUrl(url: string): void {
  textureLoader.load(url, (tex) => adoptFlyTexture("pug", tex));
}

export function clearFlyFx(): void {
  for (const particle of flyParticles) disposeSprite(particle.sprite);
  for (const particle of flyTrails) disposeSprite(particle.sprite);
  for (const particle of flyBursts) disposeSprite(particle.sprite);
  for (const particle of flyFlashes) disposeSprite(particle.sprite);
  flyParticles.length = 0;
  flyTrails.length = 0;
  flyBursts.length = 0;
  flyFlashes.length = 0;
  flyLayoutCache = undefined;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function spawnFlyIcon(
  fromWorld: THREE.Vector3,
  targetEl: HTMLElement,
  kind: "pug" | "tuna",
  delay = 0,
  onComplete?: () => void,
): void {
  const loaded = kind === "tuna" ? tunaTexture : pugTexture;
  const texture = loaded ?? softMap();
  const tint = loaded ? 0xffffff : kind === "pug" ? 0xff9f4a : 0xffcf67;

  const fromScreen = worldToScreen(fromWorld);
  const from = canvasPoint(fromScreen.x, fromScreen.y);
  const via = flyViaPoint();
  const to = flyTargetPoint(targetEl);
  const dist = Math.hypot(from.x - via.x, from.y - via.y) + Math.hypot(via.x - to.x, via.y - to.y);
  const goingUp = to.y < from.y;
  const arc = Math.min(goingUp ? 240 : 180, dist * (goingUp ? 0.3 : 0.22));
  const size = iconScale(texture, ICON_SIZE);
  const sprite = makeSprite(texture, tint, size.w * 1.55);
  setSpriteXY(sprite, from.x, from.y, size.w * 1.55, size.h * 1.55, 1);
  flyScene.add(sprite);
  spawnPickupFlash(from.x, from.y, kind);
  flyParticles.push({
    sprite,
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
    trailTimer: 0,
    baseW: size.w,
    baseH: size.h,
    onComplete,
  });
}

function spawnFlyTrail(x: number, y: number, kind: "pug" | "tuna"): void {
  if (flyTrails.length >= MAX_FLY_TRAILS) return;
  const color = kind === "pug" ? 0xff9f4a : 0xffcf67;
  const size = kind === "pug" ? 14 : 12;
  const sprite = makeSprite(softMap(), color, size * 1.4, 0.85);
  setSpriteXY(sprite, x, y, size * 1.4, size * 1.4, 0.85);
  flyScene.add(sprite);
  flyTrails.push({ sprite, t: 0, duration: 0.28 + Math.random() * 0.08, x, y, size });
}

export function spawnLevelTransitionBurst(xClient: number, yClient: number): void {
  const { x, y } = canvasPoint(xClient, yClient);
  const flash = makeSprite(softMap(), 0xffe47b, 190, 0.95);
  setSpriteXY(flash, x, y, 190 * 0.45, 190 * 0.45, 0.95);
  flyScene.add(flash);
  flyFlashes.push({ sprite: flash, t: 0, duration: 0.78, x, y, size: 190 });

  const palette = [0x7cf2c6, 0xffcf67, 0xffb978, 0xffe47b, 0x68dfb4, 0xfff6c8, 0xff9f4a, 0xc8f7ff];
  const mainCount = 62;
  for (let i = 0; i < mainCount; i += 1) {
    const angle = (Math.PI * 2 * i) / mainCount + (Math.random() - 0.5) * 0.28;
    const speed = 130 + Math.random() * 240;
    const sprite = makeSprite(softMap(), palette[i % palette.length], 14 * 1.15, 1);
    setSpriteXY(sprite, x, y, 14 * 1.15, 14 * 1.15, 1);
    flyScene.add(sprite);
    flyBursts.push({
      sprite,
      t: 0,
      duration: 0.62 + Math.random() * 0.34,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 14,
    });
  }

  for (let i = 0; i < 24; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 6 + Math.random() * 42;
    const sparkX = x + Math.cos(angle) * radius;
    const sparkY = y + Math.sin(angle) * radius;
    const sprite = makeSprite(softMap(), palette[Math.floor(Math.random() * palette.length)], 14 * 1.1, 1);
    setSpriteXY(sprite, sparkX, sparkY, 14 * 1.1, 14 * 1.1, 1);
    flyScene.add(sprite);
    const burstAngle = Math.random() * Math.PI * 2;
    const speed = 48 + Math.random() * 78;
    flyBursts.push({
      sprite,
      t: 0,
      duration: 0.48 + Math.random() * 0.24,
      x: sparkX,
      y: sparkY,
      vx: Math.cos(burstAngle) * speed,
      vy: Math.sin(burstAngle) * speed,
      size: 14,
    });
  }

  for (let i = 0; i < 18; i += 1) {
    const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.12;
    const speed = 72 + Math.random() * 96;
    const sprite = makeSprite(softMap(), palette[(i + 2) % palette.length], 10 * 0.85, 0.95);
    setSpriteXY(sprite, x, y, 10 * 0.85, 10 * 0.85, 0.95);
    flyScene.add(sprite);
    flyBursts.push({
      sprite,
      t: 0,
      duration: 0.72 + Math.random() * 0.22,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 18,
      size: 10,
    });
  }
}

function spawnPickupFlash(x: number, y: number, kind: "pug" | "tuna"): void {
  const color = kind === "pug" ? 0xff9f4a : 0xffcf67;
  const size = kind === "pug" ? 28 : 26;
  const sprite = makeSprite(softMap(), color, size * 0.55, 0.95);
  setSpriteXY(sprite, x, y, size * 0.55, size * 0.55, 0.95);
  flyScene.add(sprite);
  flyFlashes.push({ sprite, t: 0, duration: 0.34, x, y, size });
}

function spawnLandingBurst(x: number, y: number, kind: "pug" | "tuna"): void {
  spawnPickupFlash(x, y, kind);
  const color = kind === "pug" ? 0xff9f4a : 0xffcf67;
  const count = 6;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
    const speed = 52 + Math.random() * 62;
    const sprite = makeSprite(softMap(), color, 8, 1);
    setSpriteXY(sprite, x, y, 8, 8, 1);
    flyScene.add(sprite);
    flyBursts.push({
      sprite,
      t: 0,
      duration: 0.38 + Math.random() * 0.14,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 8,
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

export function launchScaredFly(worldPos: THREE.Vector3, count: number): void {
  spawnFlyIcon(worldPos, ui.mice, "pug", 0, () => {
    game.pugsScared += count;
    updateResourceHud();
    pulseHudStat(ui.mice);
  });
}

export function applyTunaPickup(): void {
  game.tunaCount += 1;
  game.killScore += 20;
  audio.pickup();
  if (game.tunaCount >= 20) {
    if (game.extraLives < MAX_EXTRA_LIVES) {
      game.tunaCount -= 20;
      game.extraLives += 1;
      audio.victory();
      showToast(t("toast.life"));
    } else {
      game.tunaCount = 20;
      showToast(t("toast.tuna", { count: game.tunaCount }));
    }
  } else {
    showToast(t("toast.tuna", { count: game.tunaCount }));
  }
  updateResourceHud();
  pulseHudStat(ui.tuna);
}

export function updateResourceHud(): void {
  ui.mice.textContent = String(game.pugsScared);
  ui.tuna.textContent = `${game.tunaCount}/20`;
  ui.lives.textContent = String(game.extraLives);
}

export function updateFlyParticles(delta: number): void {
  flyLayoutCache = undefined;

  for (let i = flyTrails.length - 1; i >= 0; i -= 1) {
    const trail = flyTrails[i];
    trail.t += delta;
    const t = trail.t / trail.duration;
    if (t >= 1) {
      disposeSprite(trail.sprite);
      flyTrails.splice(i, 1);
      continue;
    }
    const scale = trail.size * (0.55 + (1 - t) * 0.85);
    setSpriteXY(trail.sprite, trail.x, trail.y, scale, scale, (1 - t) * 0.85);
  }

  for (let i = flyBursts.length - 1; i >= 0; i -= 1) {
    const burst = flyBursts[i];
    burst.t += delta;
    const t = burst.t / burst.duration;
    if (t >= 1) {
      disposeSprite(burst.sprite);
      flyBursts.splice(i, 1);
      continue;
    }
    const x = burst.x + burst.vx * burst.t;
    const y = burst.y + burst.vy * burst.t + burst.t * burst.t * 28;
    const scale = burst.size * (1 - t * 0.72);
    setSpriteXY(burst.sprite, x, y, scale, scale, 1 - t);
  }

  for (let i = flyFlashes.length - 1; i >= 0; i -= 1) {
    const flash = flyFlashes[i];
    flash.t += delta;
    const t = flash.t / flash.duration;
    if (t >= 1) {
      disposeSprite(flash.sprite);
      flyFlashes.splice(i, 1);
      continue;
    }
    const scale = flash.size * (0.35 + t * 1.45);
    setSpriteXY(flash.sprite, flash.x, flash.y, scale, scale, 0.9 * (1 - t));
  }

  for (let i = flyParticles.length - 1; i >= 0; i -= 1) {
    const particle = flyParticles[i];
    particle.t += delta;
    if (particle.t < particle.delay) continue;
    const localT = (particle.t - particle.delay) / particle.duration;
    if (localT >= 1) {
      spawnLandingBurst(particle.toX, particle.toY, particle.kind);
      disposeSprite(particle.sprite);
      particle.onComplete?.();
      flyParticles.splice(i, 1);
      continue;
    }
    const t = easeOutQuad(localT);
    const { x, y } = flyPositionAt(particle, t);
    particle.trailTimer += delta;
    if (particle.trailTimer >= TRAIL_INTERVAL) {
      particle.trailTimer = 0;
      spawnFlyTrail(x, y, particle.kind);
    }
    const scale = flyScaleAt(t, particle.phaseSplit);
    setSpriteXY(
      particle.sprite,
      x,
      y,
      particle.baseW * scale,
      particle.baseH * scale,
      1 - t * 0.06,
    );
  }
}
