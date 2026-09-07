import * as THREE from "three";
import { canvas } from "./dom";
import { camera } from "./state";

const projected = new THREE.Vector3();

export function worldToScreen(world: THREE.Vector3): { x: number; y: number } {
  projected.copy(world).project(camera);
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height,
  };
}
