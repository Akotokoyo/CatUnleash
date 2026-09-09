import type { ScreenMode } from "./types";

export function mustElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento #${id} non trovato`);
  return element as T;
}

export const ui = {
  menu: mustElement("menu"),
  gameover: mustElement("gameover"),
  hud: mustElement("hud"),
  continueRun: mustElement<HTMLButtonElement>("continue-run"),
  newRun: mustElement<HTMLButtonElement>("new-run"),
  restart: mustElement<HTMLButtonElement>("restart"),
  sound: mustElement<HTMLButtonElement>("sound"),
  pauseMenu: mustElement<HTMLButtonElement>("pause-menu"),
  language: mustElement<HTMLSelectElement>("language"),
  score: mustElement("score"),
  mice: mustElement("mice"),
  tuna: mustElement("tuna"),
  lives: mustElement("lives"),
  finalScore: mustElement("final-score"),
  finalDistance: mustElement("final-distance"),
  finalMice: mustElement("final-mice"),
  toast: mustElement("toast"),
};

export const canvas = mustElement<HTMLCanvasElement>("game");

let toastTimer = 0;

export function showScreen(mode: ScreenMode): void {
  ui.menu.classList.toggle("hidden", mode !== "menu");
  ui.hud.classList.toggle("hidden", mode !== "hud");
  ui.gameover.classList.toggle("hidden", mode !== "gameover");
  ui.pauseMenu.classList.toggle("hidden", mode !== "hud");
  canvas.style.pointerEvents = mode === "hud" ? "auto" : "none";
}

export function showToast(message: string): void {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.remove("show"), 900);
}

export function hudStatElement(valueEl: HTMLElement): HTMLElement {
  return valueEl.closest(".hud-stat") ?? valueEl;
}

export function pulseHudStat(valueEl: HTMLElement): void {
  const stat = hudStatElement(valueEl);
  stat.classList.remove("pulse");
  requestAnimationFrame(() => stat.classList.add("pulse"));
}

export function hudTargetCenter(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function screenFlyCenter(): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.58 };
}
