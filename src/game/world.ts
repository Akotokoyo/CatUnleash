import * as THREE from "three";
import {
  ENVIRONMENTS,
  getEnvironment,
  makeEnvironmentDecor,
  makeEnvironmentSky,
  makeEnvironmentTrack,
} from "../environments";
import {
  ENVIRONMENT_TRANSITION_DURATION,
  ENVIRONMENT_TRANSITION_TILES,
  PLAYER_Z,
  TRACK_LENGTH,
  TRACK_TILES,
} from "./constants";
import { canvas, showToast } from "./dom";
import { spawnLevelTransitionBurst } from "./flyFx";
import { t } from "./locale";
import { applyThemeSprites } from "./sprites";
import {
  audio,
  camera,
  decorRoot,
  decorTiles,
  game,
  playerRoot,
  renderer,
  scene,
  skyRoot,
  sun,
  tmpWorldPos,
  trackRoot,
  trackTiles,
} from "./state";
import { worldToScreen } from "./screen";
import { disposeGroup, setGroupOpacity } from "./threeUtils";

function transitionEnvironmentIndex(): number {
  return game.transitionTargetIndex ?? game.environmentIndex;
}

export function setEnvironment(index: number): void {
  game.environmentIndex = index % ENVIRONMENTS.length;
  game.transitionTargetIndex = undefined;
  game.environmentTransition = undefined;
  game.transitionTilesRemaining = 0;
  game.pendingThemeApply = undefined;
  game.pendingLevelToast = undefined;
  game.postTransitionSpawnReady = false;
  const theme = getEnvironment(game.environmentIndex);
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
  skyRoot.add(makeEnvironmentSky(game.environmentIndex));

  for (let i = 0; i < TRACK_TILES; i += 1) {
    const tile = makeEnvironmentTrack(game.environmentIndex, TRACK_LENGTH);
    tile.position.z = PLAYER_Z - i * TRACK_LENGTH;
    trackTiles.push(tile);
    trackRoot.add(tile);

    const decor = makeEnvironmentDecor(game.environmentIndex, i);
    decor.position.z = PLAYER_Z - i * TRACK_LENGTH;
    decorTiles.push(decor);
    decorRoot.add(decor);
  }
  applyThemeSprites(theme.id);
}

export function scheduleEnvironmentTransition(index: number): void {
  const nextIndex = index % ENVIRONMENTS.length;
  if (nextIndex === game.environmentIndex && game.transitionTargetIndex === undefined) return;
  if (game.transitionTargetIndex === nextIndex) return;
  const theme = getEnvironment(nextIndex);
  game.transitionTargetIndex = nextIndex;
  game.pendingThemeApply = theme.id;
  game.transitionTilesRemaining = ENVIRONMENT_TRANSITION_TILES;
  game.postTransitionSpawnReady = true;
}

function startEnvironmentVisualTransition(): void {
  const nextIndex = game.transitionTargetIndex;
  if (nextIndex === undefined || game.environmentTransition) return;
  const theme = getEnvironment(nextIndex);
  const oldSky = skyRoot.children[0] as THREE.Group;
  const newSky = makeEnvironmentSky(nextIndex);
  setGroupOpacity(newSky, 0);
  skyRoot.add(newSky);
  game.environmentTransition = {
    oldSky,
    newSky,
    fromBackground: (scene.background as THREE.Color).clone(),
    toBackground: new THREE.Color(theme.sky),
    fromFog: scene.fog instanceof THREE.Fog ? scene.fog.color.clone() : new THREE.Color(theme.fog),
    toFog: new THREE.Color(theme.fog),
    fromSun: sun.color.clone(),
    toSun: new THREE.Color(theme.sun),
    elapsed: 0,
    duration: ENVIRONMENT_TRANSITION_DURATION,
  };
  game.environmentIndex = nextIndex;
}

export function tryStartEnvironmentVisualTransition(): void {
  if (!game.transitionTargetIndex || game.environmentTransition) return;
  const lineZ = getWorldChangeLineZ();
  if (lineZ === undefined || lineZ < PLAYER_Z - TRACK_LENGTH) return;
  startEnvironmentVisualTransition();
}

export function isEnvironmentTransitionActive(): boolean {
  return game.environmentTransition !== undefined || game.transitionTilesRemaining > 0;
}

export function canSpawnWaves(): boolean {
  if (!isEnvironmentTransitionActive()) return true;
  return game.pendingThemeApply === undefined;
}

function getWorldChangeLineZ(): number | undefined {
  let frontier = -Infinity;
  for (const tile of trackTiles) {
    if (!tile.userData.newTheme) continue;
    frontier = Math.max(frontier, tile.position.z + TRACK_LENGTH * 0.5);
  }
  return frontier === -Infinity ? undefined : frontier;
}

export function tryApplyThemeAtWorldLine(): void {
  if (!game.pendingThemeApply) return;
  const lineZ = getWorldChangeLineZ();
  if (lineZ === undefined || lineZ < PLAYER_Z) return;
  const center = playerScreenCenter();
  applyThemeSprites(game.pendingThemeApply);
  game.pendingThemeApply = undefined;
  if (game.transitionTilesRemaining <= 0) {
    game.transitionTargetIndex = undefined;
  }
  spawnLevelTransitionBurst(center.x, center.y);
  if (game.pendingLevelToast) {
    showToast(t("toast.level", {
      level: game.pendingLevelToast.level,
      world: t(game.pendingLevelToast.worldKey),
    }));
    game.pendingLevelToast = undefined;
    audio.victory();
  }
  if (game.postTransitionSpawnReady) {
    game.postTransitionSpawnReady = false;
    game.spawnTravel = Math.max(game.spawnTravel, game.nextSpawn);
  }
}

function playerScreenCenter(): { x: number; y: number } {
  playerRoot.getWorldPosition(tmpWorldPos);
  tmpWorldPos.y += 0.95;
  return worldToScreen(tmpWorldPos);
}

export function updateEnvironmentTransition(delta: number): void {
  const transition = game.environmentTransition;
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
  game.environmentTransition = undefined;
}

export function moveWorld(travel: number): void {
  for (let index = 0; index < trackTiles.length; index += 1) {
    const tile = trackTiles[index];
    const decor = decorTiles[index];
    tile.position.z += travel;
    decor.position.z += travel;
    if (tile.position.z <= PLAYER_Z + TRACK_LENGTH) continue;
    const wrappedZ = tile.position.z - TRACK_LENGTH * TRACK_TILES;
    if (game.transitionTilesRemaining > 0) {
      trackRoot.remove(tile);
      decorRoot.remove(decor);
      disposeGroup(tile);
      disposeGroup(decor);
      const envIndex = transitionEnvironmentIndex();
      const nextTile = makeEnvironmentTrack(envIndex, TRACK_LENGTH);
      const nextDecor = makeEnvironmentDecor(envIndex, index);
      nextTile.userData.newTheme = true;
      nextDecor.userData.newTheme = true;
      nextTile.position.z = wrappedZ;
      nextDecor.position.z = wrappedZ;
      trackTiles[index] = nextTile;
      decorTiles[index] = nextDecor;
      trackRoot.add(nextTile);
      decorRoot.add(nextDecor);
      game.transitionTilesRemaining -= 1;
    } else {
      tile.position.z = wrappedZ;
      decor.position.z = wrappedZ;
    }
  }
  const theme = getEnvironment(game.environmentIndex);
  const baseIntensity = theme.id === "space" || theme.id === "dimension" ? 1.8 : 2.9;
  sun.intensity = baseIntensity + Math.sin(game.elapsed * 0.35) * 0.2;
  decorRoot.rotation.z = Math.sin(game.elapsed * 0.18) * 0.0015;
}

export function resize(): void {
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
