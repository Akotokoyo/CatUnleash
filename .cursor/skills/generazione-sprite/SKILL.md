---
name: generazione-sprite
description: >-
  Genera ed estrae sprite PNG gatti e carlini per CatUnleash (contact-sheet fucsia,
  extract, temi mondo). Usa quando devi creare o rigenerare asset in
  public/assets/cats/ o public/assets/pugs/, o quando l'utente chiede sprite a tema.
---

# Generazione sprite CatUnleash

**Source of truth:** leggi e segui `tools/assets/generazione_sprite.md`.

## Checklist rapida

1. Leggi il prompt template giusto in `tools/temp/assets/` (stesso formato di `carlino_flee.prompt.txt`).
2. Genera foglio o tile su sfondo fucsia **#ff00ff** puro (`GenerateImage`, aspect `1:1`).
3. Salva foglio + `.prompt.txt` in `tools/temp/assets/`.
4. Estrai con `node tools/assets/extract-fuchsia-sprites.mjs` → `public/assets/cats/${theme}/` o `public/assets/pugs/${theme}/`.
5. Gatti `--size 256`, carlini `--size 512`.

## Formato prompt (obbligatorio)

Ogni `.prompt.txt` ha **4 blocchi**, in questo ordine:

1. **Reference** — cosa tenere dal ref (stile, proporzioni, tema)
2. **Canvas** — `1:1`, sfondo `#ff00ff` piatto
3. **Subject** — pose, scala/margine, espressione; vincoli `NOT …`
4. **Chroma masking** — bullet list (mai un paragrafo unico)

Template pronti: `cats_back.prompt.txt`, `carlino_meme.prompt.txt`, `carlino_flee.prompt.txt` (e varianti `{theme}_*.prompt.txt`).

Non usare prompt in prosa lunga senza bullet chroma: l'extract fallisce o lascia alone.
