import * as THREE from "three";

export function textureAspect(texture: THREE.Texture): number {
  const image = texture.image as { width: number; height: number };
  return image.width > 0 && image.height > 0 ? image.width / image.height : 1;
}

export function makeTexturedPlane(texture: THREE.Texture, height: number, flipX: 1 | -1 = 1): THREE.Mesh {
  const width = height * textureAspect(texture);
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.translate(0, height * 0.5, 0);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.08,
    depthWrite: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.x = flipX;
  return mesh;
}

export function resizeTexturedPlane(mesh: THREE.Mesh, texture: THREE.Texture, height: number): void {
  const width = height * textureAspect(texture);
  mesh.geometry.dispose();
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.translate(0, height * 0.5, 0);
  mesh.geometry = geometry;
}

export function setTexturedPlaneTexture(mesh: THREE.Mesh, texture: THREE.Texture): void {
  const material = mesh.material as THREE.MeshBasicMaterial;
  material.map = texture;
  material.needsUpdate = true;
}

export function setTexturedPlaneFlip(mesh: THREE.Mesh, flipX: 1 | -1): void {
  mesh.scale.x = flipX;
}

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
