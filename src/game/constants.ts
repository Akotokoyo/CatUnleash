import * as THREE from "three";

export const LANES = [-2.7, 0, 2.7];
export const TRACK_LENGTH = 14;
export const TRACK_TILES = 10;
export const ENVIRONMENT_TRANSITION_DURATION = 14;
export const ENVIRONMENT_TRANSITION_TILES = TRACK_TILES + 4;
export const PLAYER_Z = 3;

export const gold = new THREE.MeshStandardMaterial({ color: 0xe8b83f, roughness: 0.42, metalness: 0.35 });
export const terracotta = new THREE.MeshStandardMaterial({ color: 0xac4f2d, roughness: 0.82 });
export const cream = new THREE.MeshStandardMaterial({ color: 0xf7e3a6, roughness: 0.72 });
export const obsidian = new THREE.MeshStandardMaterial({ color: 0x13201e, roughness: 0.35, metalness: 0.25 });

export const MAX_PUG_STRENGTH = 3;
export const MAX_EXTRA_LIVES = 5;
export const MAX_PACK_SIZE = 5;
export const SAVE_KEY = "catunleash_run_v1";
export const SAVE_INTERVAL = 1;
export const CAT_SPRITE_HEIGHT = 1.60;
export const CAT_PICKUP_SPRITE_HEIGHT = 1.35;
export const CAT_FACING_THRESHOLD = 0.12;
export const PACK_LANE_SPREAD = 0.34;
export const PACK_ROW_DEPTH = 0.68;
