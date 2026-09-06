import * as THREE from "three";

export function setGroupOpacity(group: THREE.Group, factor: number): void {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const item of materials) {
      const baseOpacity = typeof item.userData.baseOpacity === "number"
        ? item.userData.baseOpacity
        : item.opacity;
      item.userData.baseOpacity = baseOpacity;
      item.opacity = baseOpacity * factor;
      item.transparent = factor < 1 || baseOpacity < 1;
      item.needsUpdate = true;
    }
  });
}

export function disposeGroup(group: THREE.Group): void {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const item of materials) item.dispose();
  });
}
