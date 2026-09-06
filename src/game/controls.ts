import type { Language } from "../i18n";
import { canvas, ui } from "./dom";
import { continueRun, shiftLane, startRunFromZero } from "./gameplay";
import { applyLanguage, setLanguage } from "./locale";
import { hasSave, writeSave } from "./save";
import { audio, game } from "./state";
import { resize } from "./world";

export function bindControls(): void {
  ui.continueRun.addEventListener("click", (event) => {
    event.preventDefault();
    continueRun();
  });
  ui.newRun.addEventListener("click", (event) => {
    event.preventDefault();
    startRunFromZero();
  });
  ui.restart.addEventListener("click", (event) => {
    event.preventDefault();
    startRunFromZero();
  });
  ui.language.addEventListener("change", () => {
    setLanguage(ui.language.value as Language);
    applyLanguage();
  });
  ui.sound.addEventListener("click", () => {
    const muted = audio.toggle();
    ui.sound.textContent = muted ? "×" : "♪";
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") shiftLane(-1);
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") shiftLane(1);
    if ((event.key === " " || event.key === "Enter") && game.runState !== "running") {
      if (hasSave()) continueRun();
      else startRunFromZero();
    }
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (game.runState !== "running") return;
    game.swipeStartX = event.clientX;
  });
  canvas.addEventListener("pointerup", (event) => {
    if (game.runState !== "running") return;
    const delta = event.clientX - game.swipeStartX;
    if (Math.abs(delta) > 24) shiftLane(delta > 0 ? 1 : -1);
    else shiftLane(event.clientX < window.innerWidth / 2 ? -1 : 1);
  });
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") writeSave();
  });
  window.addEventListener("pagehide", writeSave);
  window.addEventListener("blur", writeSave);
  new ResizeObserver(resize).observe(canvas);
}
