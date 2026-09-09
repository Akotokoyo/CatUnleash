import { translate, type Language, type TranslationKey } from "../i18n";
import { ui } from "./dom";
import { updateMenuSaveState } from "./save";

let language: Language = "en";

export function t(key: TranslationKey, values: Record<string, string | number> = {}): string {
  return translate(language, key, values);
}

export function getLanguage(): Language {
  return language;
}

export function setLanguage(value: Language): void {
  language = value;
}

export function applyLanguage(): void {
  document.documentElement.lang = language;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n as TranslationKey | undefined;
    if (key) element.textContent = t(key);
  });
  ui.sound.setAttribute("aria-label", t("sound.label"));
  ui.pauseMenu.setAttribute("aria-label", t("hud.menu"));
  updateMenuSaveState();
}
