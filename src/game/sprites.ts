import * as THREE from "three";
import { ENVIRONMENTS } from "../environments";
import type { EnvironmentTheme } from "../environments";
import { CAT_IDS, type CatId, type ThemeSpriteSet } from "./types";
import {
  catFrames,
  catFrontTextures,
  themeSpriteCache,
  textureLoader,
  textures,
} from "./state";
import { setPugFlyImageUrl } from "./flyFx";
import { refreshThemedSpritesInScene } from "./sceneRefresh";

async function loadTexture(path: string): Promise<THREE.Texture> {
  const texture = await textureLoader.loadAsync(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

async function loadTextureWithFallback(primary: string, fallback: string): Promise<THREE.Texture> {
  try {
    return await loadTexture(primary);
  } catch {
    return await loadTexture(fallback);
  }
}

function themedCatPath(themeId: EnvironmentTheme["id"], file: string): string {
  return `/assets/cats/${themeId}/${file}`;
}

function fallbackCatPath(file: string): string {
  return `/assets/cats/${file}`;
}

function themedPugPath(themeId: EnvironmentTheme["id"], file: string): string {
  return `/assets/pugs/${themeId}/${file}`;
}

function fallbackPugPath(file: string): string {
  return `/assets/pugs/${file}`;
}

async function loadThemeSprites(themeId: EnvironmentTheme["id"]): Promise<ThemeSpriteSet> {
  const cats: Partial<Record<CatId, THREE.Texture>> = {};
  const catFront: Partial<Record<CatId, THREE.Texture>> = {};
  await Promise.all(
    CAT_IDS.map(async (id) => {
      const [center, front] = await Promise.all([
        loadTextureWithFallback(themedCatPath(themeId, `${id}_center.png`), fallbackCatPath(`${id}_center.png`)),
        loadTextureWithFallback(themedCatPath(themeId, `${id}_front.png`), fallbackCatPath(`${id}_front.png`)),
      ]);
      cats[id] = center;
      catFront[id] = front;
    }),
  );
  const [pugIdle, pugBark, pugFlee] = await Promise.all([
    loadTextureWithFallback(themedPugPath(themeId, "carlino_meme.png"), fallbackPugPath("carlino_meme.png")),
    loadTextureWithFallback(themedPugPath(themeId, "carlino_bark.png"), fallbackPugPath("carlino_bark.png")),
    loadTextureWithFallback(themedPugPath(themeId, "carlino_flee.png"), fallbackPugPath("carlino_flee.png")),
  ]);
  return { cats, catFront, pugIdle, pugBark, pugFlee };
}

export async function loadAllThemeSprites(): Promise<void> {
  const sets = await Promise.all(
    ENVIRONMENTS.map(async (theme) => [theme.id, await loadThemeSprites(theme.id)] as const),
  );
  for (const [themeId, sprites] of sets) themeSpriteCache.set(themeId, sprites);
  textures.obstacle = await loadTexture("/assets/obstacles/accalappiacani.png");
}

export function applyThemeSprites(themeId: EnvironmentTheme["id"]): void {
  const set = themeSpriteCache.get(themeId);
  if (!set) return;
  for (const id of CAT_IDS) {
    catFrames[id] = set.cats[id];
    catFrontTextures[id] = set.catFront[id];
  }
  textures.pugIdle = set.pugIdle;
  textures.pugBark = set.pugBark;
  textures.pugFlee = set.pugFlee;
  setPugFlyImageUrl(themedPugPath(themeId, "carlino_flee.png"));
  refreshThemedSpritesInScene();
}
