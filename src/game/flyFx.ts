import type { BurstParticle, FlashParticle, FlyParticle, TrailParticle } from "./types";
import { MAX_EXTRA_LIVES } from "./constants";
import {
  hudTargetCenter,
  mustElement,
  pulseHudStat,
  screenFlyCenter,
  showToast,
  ui,
} from "./dom";
import { t } from "./locale";
import { audio, game } from "./state";
import { worldToScreen } from "./screen";

export const flyLayer = mustElement("fly-layer");
const flyParticles: FlyParticle[] = [];
const flyTrails: TrailParticle[] = [];
const flyBursts: BurstParticle[] = [];
const flyFlashes: FlashParticle[] = [];
let tunaFlyImageUrl = "";
const MAX_FLY_TRAILS = 18;
const TRAIL_INTERVAL = 0.048;

let flyLayoutCache: {
  via: { x: number; y: number };
  targets: Map<HTMLElement, { x: number; y: number }>;
} | undefined;

function flyViaPoint(): { x: number; y: number } {
  if (!flyLayoutCache) flyLayoutCache = { via: screenFlyCenter(), targets: new Map() };
  return flyLayoutCache.via;
}

function flyTargetPoint(targetEl: HTMLElement): { x: number; y: number } {
  if (!flyLayoutCache) flyLayoutCache = { via: screenFlyCenter(), targets: new Map() };
  let target = flyLayoutCache.targets.get(targetEl);
  if (!target) {
    target = hudTargetCenter(targetEl);
    flyLayoutCache.targets.set(targetEl, target);
  }
  return target;
}

export function setTunaFlyImageUrl(url: string): void {
  tunaFlyImageUrl = url;
}

export function clearFlyFx(): void {
  for (const particle of flyParticles) particle.el.remove();
  for (const particle of flyTrails) particle.el.remove();
  for (const particle of flyBursts) particle.el.remove();
  for (const particle of flyFlashes) particle.el.remove();
  flyParticles.length = 0;
  flyTrails.length = 0;
  flyBursts.length = 0;
  flyFlashes.length = 0;
  flyLayoutCache = undefined;
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function setFlyTransform(el: HTMLElement, x: number, y: number, scale = 1, opacity = 1): void {
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
  el.style.opacity = String(opacity);
}

export function spawnFlyIcon(
  fromWorld: import("three").Vector3,
  targetEl: HTMLElement,
  kind: "pug" | "tuna",
  delay = 0,
  onComplete?: () => void,
): void {
  const from = worldToScreen(fromWorld);
  const via = flyViaPoint();
  const to = flyTargetPoint(targetEl);
  const dist = Math.hypot(from.x - via.x, from.y - via.y) + Math.hypot(via.x - to.x, via.y - to.y);
  const arc = Math.min(180, dist * 0.22);
  const el = document.createElement("div");
  el.className = `fly-icon fly-icon-${kind}`;
  if (kind === "tuna") el.style.backgroundImage = `url("${tunaFlyImageUrl}")`;
  setFlyTransform(el, from.x, from.y, 1.55, 1);
  flyLayer.appendChild(el);
  spawnPickupFlash(from.x, from.y, kind);
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
  if (flyTrails.length >= MAX_FLY_TRAILS) return;
  const el = document.createElement("div");
  el.className = `fly-trail fly-trail-${kind}`;
  setFlyTransform(el, x, y, 1.4, 0.85);
  flyLayer.appendChild(el);
  flyTrails.push({ el, t: 0, duration: 0.28 + Math.random() * 0.08, x, y });
}

export function spawnLevelTransitionBurst(x: number, y: number): void {
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

function spawnPickupFlash(x: number, y: number, kind: "pug" | "tuna"): void {
  const flash = document.createElement("div");
  flash.className = `fly-flash fly-flash-${kind}`;
  setFlyTransform(flash, x, y, 0.55, 0.95);
  flyLayer.appendChild(flash);
  flyFlashes.push({ el: flash, t: 0, duration: 0.34, x, y });
}

function spawnLandingBurst(x: number, y: number, kind: "pug" | "tuna"): void {
  spawnPickupFlash(x, y, kind);

  const count = 6;
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

export function launchScaredFly(worldPos: import("three").Vector3, count: number): void {
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
    const { x, y } = flyPositionAt(particle, t);
    particle.trailTimer += delta;
    if (particle.trailTimer >= TRAIL_INTERVAL) {
      particle.trailTimer = 0;
      spawnFlyTrail(x, y, particle.kind);
    }
    const scale = flyScaleAt(t, particle.phaseSplit);
    particle.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
    particle.el.style.opacity = String(1 - t * 0.06);
  }
}
