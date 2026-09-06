import { showScreen } from "./dom";
import { bindControls } from "./controls";
import { setTunaFlyImageUrl } from "./flyFx";
import { update } from "./gameplay";
import { applyLanguage } from "./locale";
import { buildTunaFlyImageUrl } from "./objects";
import { updateMenuSaveState } from "./save";
import { rebuildPack } from "./cats";
import { loadAllThemeSprites } from "./sprites";
import { renderer } from "./state";
import { resize, setEnvironment } from "./world";

export async function bootstrap(): Promise<void> {
  try {
    await loadAllThemeSprites();
    setEnvironment(0);
    rebuildPack();
    setTunaFlyImageUrl(buildTunaFlyImageUrl());
    applyLanguage();
    bindControls();
    updateMenuSaveState();
    resize();
    renderer.setAnimationLoop(update);
    showScreen("menu");
    document.body.style.display = "block";
  } finally {
    document.body.classList.remove("loading");
  }
}
