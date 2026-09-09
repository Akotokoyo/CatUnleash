import * as THREE from "three";
import {
  CAT_FACING_THRESHOLD,
  CAT_PICKUP_SPRITE_HEIGHT,
  CAT_SPRITE_HEIGHT,
  LANES,
  MAX_PACK_SIZE,
  PACK_LANE_SPREAD,
  PACK_ROW_DEPTH,
  PLAYER_Z,
} from "./constants";
import { CAT_IDS, type CatFacing, type CatId } from "./types";
import {
  catFrames,
  catFrontTextures,
  game,
  objectRoot,
  objects,
  playerRoot,
} from "./state";
import {
  makeTexturedPlane,
  resizeTexturedPlane,
  setTexturedPlaneFlip,
  setTexturedPlaneTexture,
} from "./threeUtils";

export function makeCatSprite(texture: THREE.Texture, flipX: 1 | -1 = 1): THREE.Mesh {
  return makeTexturedPlane(texture, CAT_SPRITE_HEIGHT, flipX);
}

export function setCatFacing(plane: THREE.Mesh, texture: THREE.Texture, facing: CatFacing): void {
  const flipX: 1 | -1 = facing === "right" ? -1 : 1;
  setTexturedPlaneTexture(plane, texture);
  resizeTexturedPlane(plane, texture, CAT_SPRITE_HEIGHT);
  setTexturedPlaneFlip(plane, flipX);
}

export function catFacingFromLane(dx: number): CatFacing {
  if (dx < -CAT_FACING_THRESHOLD) return "left";
  if (dx > CAT_FACING_THRESHOLD) return "right";
  if (game.laneIndex === 0) return "left";
  if (game.laneIndex === 2) return "right";
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

export function rebuildPack(): void {
  playerRoot.clear();
  const shown = Math.min(game.catCount, MAX_PACK_SIZE);
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
}

export function packIsFull(): boolean {
  return game.catCount >= MAX_PACK_SIZE;
}

export function randomPickupCatId(): CatId {
  return CAT_IDS[Math.floor(Math.random() * CAT_IDS.length)];
}

export function makeCatPickup(catId: CatId): THREE.Group {
  const texture = catFrontTextures[catId];
  if (!texture) throw new Error(`Texture pickup gatto mancante: ${catId}`);
  const group = new THREE.Group();
  group.add(makeTexturedPlane(texture, CAT_PICKUP_SPRITE_HEIGHT));
  group.userData.pickupCatId = catId;
  return group;
}

export function spawnCatPickup(lane: number): void {
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

export function updatePack(delta: number): void {
  playerRoot.position.x += (game.targetX - playerRoot.position.x) * Math.min(1, delta * 11);
  const dx = game.targetX - playerRoot.position.x;
  const facing = catFacingFromLane(dx);
  playerRoot.children.forEach((cat) => {
    const catId = cat.userData.catId as CatId;
    const texture = catFrames[catId];
    const plane = cat.children[0];
    if (texture && plane instanceof THREE.Mesh) {
      setCatFacing(plane, texture, facing);
    }
    const phase = Number(cat.userData.phase ?? 0);
    const baseScale = Number(cat.userData.baseScale ?? 1);
    const stride = Math.sin(game.stridePhase + phase);
    cat.position.y = 0.42 + Math.abs(stride) * 0.14;
    cat.rotation.z = stride * 0.06;
    cat.rotation.y = 0;
    const stretch = 1 + stride * 0.06;
    const squash = 1 - Math.abs(stride) * 0.04;
    cat.scale.set(baseScale * stretch, baseScale * squash, baseScale);
  });
}
