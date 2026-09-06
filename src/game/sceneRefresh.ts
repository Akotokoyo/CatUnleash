import * as THREE from "three";
import { applyPickupSpriteScale } from "./cats";
import { syncPugPackMood } from "./objects";
import { rebuildPack } from "./cats";
import { catFrontTextures, objects } from "./state";

export function refreshThemedSpritesInScene(): void {
  rebuildPack();
  for (const object of objects) {
    if (object.type === "milk" && object.pickupCatId) {
      const texture = catFrontTextures[object.pickupCatId];
      if (!texture) continue;
      const sprite = object.mesh.children[0];
      if (!(sprite instanceof THREE.Sprite)) continue;
      const material = sprite.material as THREE.SpriteMaterial;
      material.map = texture;
      applyPickupSpriteScale(sprite, texture);
      material.needsUpdate = true;
    }
    if (object.type === "mouse") {
      object.mesh.userData.pugMood = undefined;
      syncPugPackMood(object);
    }
  }
}
