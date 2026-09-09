import * as THREE from "three";
import { ENVIRONMENTS, getEnvironment } from "../environments";
import {
  BASE_RUN_SPEED,
  LANES,
  MAX_RUN_SPEED_FACTOR,
  PLAYER_Z,
  RUN_SPEED_FIXED,
  RUN_SPEED_RAMP_EXPONENT,
  RUN_SPEED_RAMP_SECONDS,
  SAVE_INTERVAL,
  WAVE_SPAWN_MAX,
  WAVE_SPAWN_MIN,
  WORLD_SEGMENT_METERS,
} from "./constants";
import { rebuildPack, packIsFull, updatePack } from "./cats";
import { showScreen, showToast, ui } from "./dom";
import {
  applyTunaPickup,
  clearFlyFx,
  launchScaredFly,
  renderFlyOverlay,
  spawnFlyIcon,
  updateFlyParticles,
  updateResourceHud,
} from "./flyFx";
import { t } from "./locale";
import { clearObjects, pugsDominate, spawnWave, syncPugPackMood } from "./objects";
import { resetWaveSequencer } from "./wavePatterns";
import {
  applySave,
  clearSave,
  readSave,
  writeSave,
} from "./save";
import {
  audio,
  camera,
  game,
  objectRoot,
  objects,
  playerRoot,
  renderer,
  scene,
  timer,
  tmpWorldPos,
} from "./state";
import type { RunnerObject } from "./types";
import {
  canSpawnWaves,
  moveWorld,
  resize,
  scheduleEnvironmentTransition,
  setEnvironment,
  tryApplyThemeAtWorldLine,
  tryStartEnvironmentVisualTransition,
  updateEnvironmentTransition,
} from "./world";

function isCheckpointSave(save: import("./types").RunSave): boolean {
  return save.distance > 2
    || save.runTime > 1.5
    || save.catCount > 1
    || save.killScore > 0
    || save.tunaCount > 0
    || save.extraLives > 0
    || save.pugsScared > 0;
}

export function currentSpeedFactor(runTime = game.runTime): number {
  if (RUN_SPEED_FIXED) {
    return MAX_RUN_SPEED_FACTOR;
  }
  return Math.min(
    MAX_RUN_SPEED_FACTOR,
    Math.pow(1 + runTime / RUN_SPEED_RAMP_SECONDS, RUN_SPEED_RAMP_EXPONENT),
  );
}

export function currentRunSpeed(runTime = game.runTime): number {
  return BASE_RUN_SPEED * currentSpeedFactor(runTime);
}

export function scoreValue(): number {
  return Math.floor(game.distance * 10 + game.killScore);
}

export function refreshRunHud(): void {
  ui.score.textContent = String(scoreValue());
  updateResourceHud();
}

function beginRun(distance: number, level: number, environmentIndex: number): void {
  resetRunObjects();
  game.runState = "running";
  game.laneIndex = 1;
  game.targetX = LANES[game.laneIndex];
  game.catCount = 1;
  game.distance = distance;
  game.killScore = 0;
  game.pugsScared = 0;
  game.tunaCount = 0;
  game.extraLives = 0;
  game.level = level;
  game.spawnTravel = 0;
  game.nextSpawn = WAVE_SPAWN_MIN;
  game.runTime = 0;
  game.stridePhase = 0;
  game.invulnerableUntil = 2;
  game.saveTimer = 0;
  game.pendingThemeApply = undefined;
  game.pendingLevelToast = undefined;
  game.postTransitionSpawnReady = false;
  game.transitionTargetIndex = undefined;
  setEnvironment(environmentIndex);
  rebuildPack();
  playerRoot.position.x = game.targetX;
  showScreen("hud");
  audio.start();
  refreshRunHud();
  showToast(t("toast.run"));
}

export function startRunFromZero(): void {
  clearSave();
  beginRun(0, 1, 0);
}

export function restartAtWorldStart(): void {
  const level = Math.max(1, game.level);
  const environmentIndex = (level - 1) % ENVIRONMENTS.length;
  const distance = (level - 1) * WORLD_SEGMENT_METERS;
  clearSave();
  beginRun(distance, level, environmentIndex);
}

export function continueRun(): void {
  const save = readSave();
  if (!save || !isCheckpointSave(save)) {
    startRunFromZero();
    return;
  }
  resetRunObjects();
  applySave(save);
  game.runState = "running";
  setEnvironment(game.environmentIndex);
  rebuildPack();
  playerRoot.position.x = game.targetX;
  refreshRunHud();
  showScreen("hud");
  audio.start();
  showToast(t("toast.continue"));
  writeSave();
}

export function pauseToMenu(): void {
  if (game.runState !== "running") return;
  writeSave();
  game.runState = "menu";
  showScreen("menu");
  showToast(t("toast.saved"));
}

export function endRun(): void {
  game.runState = "gameover";
  clearSave();
  audio.hit();
  ui.finalScore.textContent = String(scoreValue());
  ui.finalDistance.textContent = `${Math.floor(game.distance)}m`;
  ui.finalMice.textContent = String(game.pugsScared);
  showScreen("gameover");
}

function resetRunObjects(): void {
  clearObjects();
  resetWaveSequencer();
  clearFlyFx();
}

export function shiftLane(direction: number): void {
  if (game.runState !== "running") return;
  game.laneIndex = THREE.MathUtils.clamp(game.laneIndex + direction, 0, LANES.length - 1);
  game.targetX = LANES[game.laneIndex];
}

function collect(object: RunnerObject): boolean {
  if (object.type === "milk") {
    if (packIsFull()) return true;
    game.catCount += 1;
    game.killScore += 25;
    rebuildPack();
    audio.pickup(true);
    showToast(t("toast.cat"));
    return true;
  }
  if (object.type === "tuna") {
    object.mesh.getWorldPosition(tmpWorldPos);
    tmpWorldPos.y += 0.65;
    spawnFlyIcon(tmpWorldPos, ui.tuna, "tuna", 0, applyTunaPickup);
    return true;
  }
  if (object.type === "obstacle") {
    showToast(t("toast.barrier"));
    loseLife();
    return true;
  }

  if (!pugsDominate(object.strength)) {
    game.catCount -= 1;
    requestAnimationFrame(() => rebuildPack());
    if (game.catCount <= 0) {
      game.catCount = 0;
      endRun();
      return true;
    }
    game.killScore += object.strength * 85;
    audio.victory();
    showToast(t("toast.flee", { score: object.strength * 85, count: object.strength }));
    object.mesh.getWorldPosition(tmpWorldPos);
    tmpWorldPos.y += 0.65;
    launchScaredFly(tmpWorldPos, object.strength);
    return true;
  }

  audio.hit();
  showToast(t("toast.bark"));
  loseLife();
  return true;
}

function loseLife(): void {
  if (game.extraLives <= 0) {
    game.catCount = 0;
    endRun();
    return;
  }
  game.extraLives -= 1;
  game.catCount = Math.max(1, game.catCount);
  game.invulnerableUntil = game.runTime + 2;
  rebuildPack();
  updateResourceHud();
  audio.victory();
  showToast(t("toast.lifeUsed"));
}

function updateObjects(travel: number, delta: number): void {
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    const object = objects[i];
    const previousZ = object.mesh.position.z;
    object.mesh.position.z += travel;
    if (object.type !== "obstacle" && object.type !== "mouse" && object.type !== "milk") {
      object.mesh.rotation.y += delta * 2.2;
    }
    object.mesh.position.y = 0.3;// + Math.sin(game.elapsed * 3.2 + object.phase) * 0.12;
    if (object.type === "mouse") {
      syncPugPackMood(object);
    }

    const closeZ =
      Math.abs(object.mesh.position.z - PLAYER_Z) < 1.25 ||
      (previousZ < PLAYER_Z && object.mesh.position.z > PLAYER_Z);
    if (closeZ && object.lane === game.laneIndex && game.runTime < game.invulnerableUntil) {
      objectRoot.remove(object.mesh);
      objects.splice(i, 1);
    } else if (closeZ && object.lane === game.laneIndex && !object.resolved) {
      if (collect(object)) {
        objectRoot.remove(object.mesh);
        objects.splice(i, 1);
      }
    } else if (object.mesh.position.z > PLAYER_Z + 9) {
      objectRoot.remove(object.mesh);
      objects.splice(i, 1);
    }
  }
}

export function update(): void {
  resize();
  timer.update();
  const delta = Math.min(timer.getDelta(), 0.05);
  game.elapsed += delta;
  updateEnvironmentTransition(delta);
  updateFlyParticles(delta);

  if (game.runState === "running") {
    game.runTime += delta;
    const speed = currentRunSpeed();
    const travel = speed * delta;
    game.stridePhase += delta * speed * 0.34;
    game.distance += travel * 0.34;
    game.spawnTravel += travel;
    moveWorld(travel);
    updatePack(delta);
    updateObjects(travel, delta);
    if (game.spawnTravel >= game.nextSpawn && canSpawnWaves()) {
      game.spawnTravel = 0;
      game.nextSpawn = THREE.MathUtils.randFloat(WAVE_SPAWN_MIN, WAVE_SPAWN_MAX);
      spawnWave();
    }
    tryStartEnvironmentVisualTransition();
    tryApplyThemeAtWorldLine();
    const nextLevel = Math.floor(game.distance / WORLD_SEGMENT_METERS) + 1;
    if (nextLevel > game.level) {
      game.level = nextLevel;
      scheduleEnvironmentTransition(game.level - 1);
      game.pendingLevelToast = {
        level: game.level,
        worldKey: getEnvironment(game.level - 1).nameKey,
      };
    }
    ui.score.textContent = String(scoreValue());
    game.saveTimer += delta;
    if (game.saveTimer >= SAVE_INTERVAL) {
      game.saveTimer = 0;
      writeSave();
    }
  } else {
    moveWorld(2.3 * delta);
    game.stridePhase += delta * 2.3 * 0.34;
    playerRoot.position.x = Math.sin(game.elapsed * 0.65) * 0.22;
    updatePack(delta);
  }

  camera.position.x += (playerRoot.position.x * 0.16 - camera.position.x) * Math.min(1, delta * 2.8);
  renderer.render(scene, camera);
  renderFlyOverlay();
}
