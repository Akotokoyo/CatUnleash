import { rebuildBalloonSprite } from "./balloonSprite";
import { rebuildPack } from "./cats";
import { CAT_PICKUP_SPRITE_HEIGHT } from "./constants";
import { syncPugPackMood } from "./objects";
import { catFrontTextures, objects } from "./state";

export function refreshThemedSpritesInScene(): void {
  rebuildPack();
  for (const object of objects) {
    if (object.type === "milk" && object.pickupCatId) {
      const texture = catFrontTextures[object.pickupCatId];
      if (!texture) continue;
      rebuildBalloonSprite(object.mesh, texture, CAT_PICKUP_SPRITE_HEIGHT);
      object.mesh.userData.pickupCatId = object.pickupCatId;
    }
    if (object.type === "mouse") {
      object.mesh.userData.pugMood = undefined;
      syncPugPackMood(object);
    }
  }
}
