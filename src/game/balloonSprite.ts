import * as THREE from "three";
import { textureAspect } from "./threeUtils";

type LevelSpec = { erode: number; depth: number; shade: number };

const LEVELS: LevelSpec[] = [
  { erode: 0, depth: 0.45, shade: 1 },
  { erode: 2, depth: 0.7, shade: 0.82 },
  { erode: 4, depth: 1.0, shade: 0.64 },
];

const MASK_MAX_WIDTH = 72;
const ALPHA_THRESHOLD = 24;
const SQUASH_Z = 0.75;
const OUTLINE_STEP = 2;

type SilhouetteCache = {
  levels: Array<{ points: THREE.Vector2[]; avgColor: number }>;
};

const silhouetteCache = new Map<string, SilhouetteCache>();

function imageSource(texture: THREE.Texture): CanvasImageSource | null {
  const image = texture.image as CanvasImageSource | undefined;
  if (!image) return null;
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement && !image.complete) {
    return null;
  }
  return image;
}

function readMask(texture: THREE.Texture): { mask: Uint8Array; w: number; h: number; avgColor: number } | null {
  const source = imageSource(texture);
  if (!source) return null;

  const srcW = (source as { width: number }).width;
  const srcH = (source as { height: number }).height;
  if (!srcW || !srcH) return null;

  const scale = Math.min(1, MASK_MAX_WIDTH / srcW);
  const w = Math.max(12, Math.round(srcW * scale));
  const h = Math.max(12, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const mask = new Uint8Array(w * h);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) {
    const o = i * 4;
    if (data[o + 3] <= ALPHA_THRESHOLD) continue;
    mask[i] = 1;
    r += data[o];
    g += data[o + 1];
    b += data[o + 2];
    n += 1;
  }
  if (n < 8) return null;
  const avgColor = (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
  return { mask, w, h, avgColor };
}

function erodeMask(mask: Uint8Array, w: number, h: number, times: number): Uint8Array {
  let current = mask;
  for (let t = 0; t < times; t += 1) {
    const next = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const i = y * w + x;
        if (!current[i]) continue;
        if (
          current[i - 1]
          && current[i + 1]
          && current[i - w]
          && current[i + w]
        ) {
          next[i] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

function largestComponent(mask: Uint8Array, w: number, h: number): Uint8Array {
  const seen = new Uint8Array(w * h);
  let best: number[] = [];
  const queue: number[] = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const cells: number[] = [];
    seen[start] = 1;
    queue.length = 0;
    queue.push(start);
    while (queue.length) {
      const i = queue.pop()!;
      cells.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      const neighbors = [i - 1, i + 1, i - w, i + w];
      for (const n of neighbors) {
        if (n < 0 || n >= mask.length || seen[n] || !mask[n]) continue;
        const nx = n % w;
        const ny = (n / w) | 0;
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
    if (cells.length > best.length) best = cells;
  }

  const out = new Uint8Array(w * h);
  for (const i of best) out[i] = 1;
  return out;
}

function isBoundary(mask: Uint8Array, w: number, h: number, x: number, y: number): boolean {
  if (!mask[y * w + x]) return false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !mask[ny * w + nx]) return true;
    }
  }
  return false;
}

function traceOutline(mask: Uint8Array, w: number, h: number): THREE.Vector2[] | null {
  let sx = -1;
  let sy = -1;
  outer: for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (isBoundary(mask, w, h, x, y)) {
        sx = x;
        sy = y;
        break outer;
      }
    }
  }
  if (sx < 0) return null;

  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ] as const;

  const points: THREE.Vector2[] = [];
  let x = sx;
  let y = sy;
  let dir = 0;
  const maxSteps = w * h * 2;

  for (let step = 0; step < maxSteps; step += 1) {
    points.push(new THREE.Vector2(x + 0.5, y + 0.5));
    let found = false;
    for (let k = 0; k < 8; k += 1) {
      const nd = (dir + 6 + k) % 8;
      const nx = x + dirs[nd][0];
      const ny = y + dirs[nd][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!isBoundary(mask, w, h, nx, ny)) continue;
      x = nx;
      y = ny;
      dir = nd;
      found = true;
      break;
    }
    if (!found) break;
    if (x === sx && y === sy && points.length > 8) break;
  }

  if (points.length < 8) return null;

  const simplified: THREE.Vector2[] = [];
  for (let i = 0; i < points.length; i += OUTLINE_STEP) {
    simplified.push(points[i]);
  }
  if (simplified.length >= 3) {
    const first = simplified[0];
    const last = simplified[simplified.length - 1];
    if (first.distanceToSquared(last) > 0.01) simplified.push(first.clone());
  }
  return simplified.length >= 4 ? simplified : null;
}

function toNormalizedPoints(points: THREE.Vector2[], w: number, h: number): THREE.Vector2[] {
  return points.map((p) => new THREE.Vector2(p.x / w - 0.5, 1 - p.y / h));
}

function getSilhouette(texture: THREE.Texture): SilhouetteCache | null {
  const cached = silhouetteCache.get(texture.uuid);
  if (cached) return cached;

  const read = readMask(texture);
  if (!read) return null;
  const base = largestComponent(read.mask, read.w, read.h);
  const levels: SilhouetteCache["levels"] = [];

  for (const level of LEVELS) {
    const eroded = level.erode > 0 ? erodeMask(base, read.w, read.h, level.erode) : base;
    const solid = largestComponent(eroded, read.w, read.h);
    const outline = traceOutline(solid, read.w, read.h);
    if (!outline) continue;
    levels.push({
      points: toNormalizedPoints(outline, read.w, read.h),
      avgColor: read.avgColor,
    });
  }

  if (!levels.length) return null;
  const entry = { levels };
  silhouetteCache.set(texture.uuid, entry);
  return entry;
}

function shapeFromNormalized(points: THREE.Vector2[], width: number, height: number): THREE.Shape {
  const shape = new THREE.Shape();
  const first = points[0];
  shape.moveTo(first.x * width, first.y * height);
  for (let i = 1; i < points.length; i += 1) {
    shape.lineTo(points[i].x * width, points[i].y * height);
  }
  shape.closePath();
  return shape;
}

function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    if (child.customDepthMaterial) {
      child.customDepthMaterial.dispose();
      child.customDepthMaterial = undefined;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const seen = new Set<THREE.Material>();
    for (const material of materials) {
      if (seen.has(material) || material.userData.sharedTexture) continue;
      seen.add(material);
      material.dispose();
    }
  });
}

function shadeColor(hex: number, shade: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * shade));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * shade));
  const b = Math.min(255, Math.round((hex & 255) * shade));
  return (r << 16) | (g << 8) | b;
}

export function rebuildBalloonSprite(
  group: THREE.Group,
  texture: THREE.Texture,
  height: number,
  flipX: 1 | -1 = 1,
): void {
  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    disposeObject3D(child);
  }

  const width = height * textureAspect(texture);
  const silhouette = getSilhouette(texture);

  // Solo i lati dell'estrusione (niente cappucci: coprirebbero la texture).
  // Depth già schiacciata in geometria — niente scale.z (normali ok).
  if (silhouette) {
    const avg = silhouette.levels[0]?.avgColor ?? 0x888888;
    for (let i = 0; i < silhouette.levels.length; i += 1) {
      const level = silhouette.levels[i];
      const spec = LEVELS[i] ?? LEVELS[LEVELS.length - 1];
      const depth = Math.max(0.02, spec.depth * SQUASH_Z);
      const shape = shapeFromNormalized(level.points, width, height);
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: false,
        curveSegments: 1,
        steps: 1,
      });
      geometry.translate(0, 0, -depth);

      // ExtrudeGeometry: materialIndex 0 = cappucci, 1 = lati
      const sideGroup = geometry.groups.find((g) => g.materialIndex === 1) ?? geometry.groups[1];
      if (sideGroup) {
        geometry.clearGroups();
        geometry.addGroup(sideGroup.start, sideGroup.count, 0);
      }
      geometry.computeVertexNormals();

      const material = new THREE.MeshLambertMaterial({
        color: shadeColor(avg, spec.shade),
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = false;
      group.add(mesh);
    }
  }

  const faceGeo = new THREE.PlaneGeometry(width, height);
  faceGeo.translate(0, height * 0.5, 0);
  const faceMat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.08,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  faceMat.userData.sharedTexture = true;
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.z = 0.02;
  face.renderOrder = 1;
  face.castShadow = true;
  face.customDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: texture,
    alphaTest: 0.08,
  });
  group.add(face);

  // Contatto a terra sotto i piedi (y≈0 della silhouette).
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(0.22, width * 0.26), 20),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(0, 0.02, 0.04);
  blob.renderOrder = 0;
  group.add(blob);

  group.scale.set(flipX, 1, 1);
  group.userData.balloonSprite = true;
  group.userData.balloonHeight = height;
  group.userData.balloonFlipX = flipX;
  group.userData.balloonTexture = texture;
}

export function makeBalloonSprite(
  texture: THREE.Texture,
  height: number,
  flipX: 1 | -1 = 1,
): THREE.Group {
  const group = new THREE.Group();
  rebuildBalloonSprite(group, texture, height, flipX);
  return group;
}

export function setBalloonTexture(group: THREE.Group, texture: THREE.Texture): void {
  const height = Number(group.userData.balloonHeight ?? 1);
  const flipX = (group.userData.balloonFlipX === -1 ? -1 : 1) as 1 | -1;
  rebuildBalloonSprite(group, texture, height, flipX);
}

export function resizeBalloonSprite(group: THREE.Group, texture: THREE.Texture, height: number): void {
  const flipX = (group.userData.balloonFlipX === -1 ? -1 : 1) as 1 | -1;
  rebuildBalloonSprite(group, texture, height, flipX);
}

export function setBalloonFlip(group: THREE.Group, flipX: 1 | -1): void {
  group.userData.balloonFlipX = flipX;
  group.scale.x = flipX;
  group.scale.y = 1;
  group.scale.z = 1;
}
