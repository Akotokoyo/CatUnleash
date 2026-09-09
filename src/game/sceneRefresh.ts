import * as THREE from "three";
import { rebuildPack } from "./cats";
import { CAT_PICKUP_SPRITE_HEIGHT } from "./constants";
import { syncPugPackMood } from "./objects";
import { catFrontTextures, objects } from "./state";
import { resizeTexturedPlane, setTexturedPlaneTexture } from "./threeUtils";

export function refreshThemedSpritesInScene(): void {
  rebuildPack();
  for (const object of objects) {
    if (object.type === "milk" && object.pickupCatId) {
      const texture = catFrontTextures[object.pickupCatId];
      if (!texture) continue;
      const sprite = object.mesh.children[0];
      if (!(sprite instanceof THREE.Mesh)) continue;
      setTexturedPlaneTexture(sprite, texture);
      resizeTexturedPlane(sprite, texture, CAT_PICKUP_SPRITE_HEIGHT);
    }
    if (object.type === "mouse") {
      object.mesh.userData.pugMood = undefined;
      syncPugPackMood(object);
    }
  }
}
