# Generazione immagini sprite

Regole e prompt per produrre i PNG in `public/assets/cats/` e `public/assets/pugs/`, a tema per mondo.

## Cartelle

| Path | Cosa |
|------|------|
| `tools/assets/` | Tooling permanente: questo file, `extract-fuchsia-sprites.mjs`, `extract-theme.ps1` |
| `tools/temp/assets/` | **Temporanei**: fogli `*_sheet.png`, tile, `.prompt.txt` — si possono cancellare a fine lavoro |
| `public/assets/cats/` | Gatti default (root) + sottocartelle per tema |
| `public/assets/pugs/` | Carlini default (root) + sottocartelle per tema |

Dopo extract, `tools/temp/assets/` si può svuotare interamente.

## Struttura output

```
public/assets/cats/{theme}/   → 5 gatti × 2 frame
public/assets/pugs/{theme}/   → carlino_meme, carlino_bark, carlino_flee
```

| `theme` | mondo |
|---------|--------|
| `city` | città |
| `country` | campagna |
| `jungle` | giungla |
| `lab` | laboratorio |
| `space` | spazio |
| `egypt` | Egitto |
| `dimension` | dimensione 3D |

Gatti: `orange`, `maxwell`, `paralized`, `tuxedo`, `barong`  
Frame: `{id}_center.png`, `{id}_front.png`  
Carlini: `carlino_meme.png`, `carlino_bark.png`, `carlino_flee.png`

I PNG in `public/assets/cats/` e `public/assets/pugs/` (root) restano i default/base. Le cartelle tema sovrascrivono a runtime (`src/main.ts`).

## Pipeline (ricorda questo)

1. **Genera** un contact-sheet (Cursor `GenerateImage` o Nano Banana) con **sfondo fucsia puro `#ff00ff`**, tile separate e margine generoso.
2. Salva il foglio in `tools/temp/assets/` (es. `jungle_cats_center_sheet.png`) + `.prompt.txt` del prompt usato.
3. **Estrai** gli sprite con lo script (chroma key + crop + resize + alpha):

```powershell
node tools/assets/extract-fuchsia-sprites.mjs tools/temp/assets/jungle_cats_center_sheet.png --size 256 --out public/assets/cats/jungle --names "orange_center.png,maxwell_center.png,paralized_center.png,tuxedo_center.png,barong_center.png"
```

Senza `--names` scrive `01.png`, `02.png`, …

4. **Batch per mondo** (3 fogli: center, front, pugs):

```powershell
powershell -File tools/assets/extract-theme.ps1 -Theme jungle
```

Gatti `--size 256`, carlini `--size 512`.

## Obiettivo output

- Sprite di gioco su **sfondo fucsia (#ff00ff)** nel foglio sorgente.
- Post: `extract-fuchsia-sprites.mjs` → PNG con alpha in `public/assets/cats/${theme}/` o `public/assets/pugs/${theme}/`.
- Stile meme photorealistico (flash telefono, energia comica), coerente col reference del personaggio base.
- Path file: `public/assets/cats/${theme}/${catId}_${frame}.png`, `public/assets/pugs/${theme}/carlino_*.png`.

## Regole generali di prompting

1. **Prosa da creative director**, non lista di keyword — ma **struttura fissa** (sotto).
2. **Framing positivo**: descrivi cosa vuoi (es. “sfondo fucsia piatto #ff00ff”), non lunghe liste di divieti — ma per il chroma key **ripeti esplicitamente** i vincoli anti-alone (sotto).
3. Con **immagine di riferimento**: dichiara cosa tenere (stile/rendering del gatto o carlino base) e cosa generare di nuovo (solo il personaggio a tema, non la scena intera). Ref tipici: sprite default in `public/assets/cats/` o `public/assets/pugs/`.
4. Per una **serie a tema**: blocca stile + inquadratura + scala e riusali uguali tra i fogli dello stesso mondo; meglio **un foglio per turno** se la quality cala.
5. Chiedi esplicitamente **aspect ratio** (di solito `1:1`) e margine fucsia generoso tra le tile (obbligatorio per lo script: tile non devono toccarsi).
6. Niente testo, filename, UI, etichette sulle tile.

### Formato prompt (obbligatorio)

Ogni `.prompt.txt` in `tools/temp/assets/` segue **4 blocchi**, nello stesso ordine di `carlino_flee.prompt.txt`:

| Blocco | Cosa scrivere |
|--------|----------------|
| **Reference** | Cosa tenere dal ref allegato (stile, proporzioni, breed, tema/costume) |
| **Canvas** | `1:1`, sfondo `#ff00ff` piatto che riempie l'immagine |
| **Subject** | Pose, inquadratura, scala (`~40%` larghezza / `~60%` altezza o `~20%` margine fucsia), espressione; vincoli espliciti `NOT …` |
| **Chroma masking** | **Bullet list** (mai un paragrafo unico) |

Template pronti:

| File | Uso |
|------|-----|
| `cats_back.prompt.txt` | Gatti vista posteriore (`*_center`) |
| `carlino_meme.prompt.txt` | Carlino fronte, occhioni tristi meme |
| `carlino_flee.prompt.txt` | Carlino profilo destro, fuga |
| `{theme}_carlino_meme.prompt.txt` | Variante a tema (es. `city_carlino_meme.prompt.txt`) |

Skill progetto (checklist): `.cursor/skills/generazione-sprite/SKILL.md`.

### Anti-alone (obbligatorio — altrimenti resta grigio dopo extract)

Lo script chiave solo il fucsia. Ombre / glow / AA sporco diventano **alone grigio** in `public/assets/`.

Nel prompt (e nel follow-up se serve) chiedi sempre:

- ogni sprite con **bordo nero netto** (outline 1–2 px, hard edge) che separa il soggetto dal fucsia
- **niente anti-aliasing** / blend / dither tra il prop (o il bordo nero) e lo sfondo `#ff00ff`: il passaggio deve essere a pixel duri
- oggetti **flat sul fucsia**, silhouette a contatto diretto con `#ff00ff` (via outline nero)
- **no drop shadow**, no soft shadow sotto/ai lati, no contatto/ground shadow
- **no outer glow**, no vignette, no halo, no blur sul bordo esterno
- shading **solo dentro** il personaggio (volume interno ok); fuori dalla silhouette solo `#ff00ff` puro
- niente ombre grigie semi-trasparenti mescolate al fucsia

Follow-up tipico se il foglio ha ancora ombre / AA:

```
Same style and #ff00ff background. Give every sprite a crisp 1-2px hard black outline. No anti-aliasing or color bleed into the fuchsia — hard pixel edges only. Remove every drop shadow, soft shadow, outer glow and gray fringe. Outside the black outline: only pure #ff00ff.
```

## Fogli per tema

Per ogni `theme` servono **3 contact-sheet**:

| Foglio | Griglia | Output | Size |
|--------|---------|--------|------|
| `{theme}_cats_center_sheet.png` | 5 tile (verticale o 3+2) | `{id}_center.png` × 5 | 256 |
| `{theme}_cats_front_sheet.png` | 5 tile | `{id}_front.png` × 5 | 256 |
| `{theme}_pugs_sheet.png` | 3 tile | `carlino_bark`, `carlino_meme`, `carlino_flee` | 512 |

Eccezioni note: `city` usa `city_cats_front_v2_sheet.png` e `city_pugs_v2_sheet.png`.

Ordine lettura foglio gatti (top→bottom o left→right): `orange`, `maxwell`, `paralized`, `tuxedo`, `barong`.

Fogli problematici: layout verticale (5 righe) o griglia 3+2 con gap enormi — in quel caso rigenera con più padding fucsia.

### Prompt gatti — vista posteriore (`*_center`)

Vedi `tools/temp/assets/cats_back.prompt.txt`. Adatta il tema (giungla, spazio, Egitto, …) ma **non** cambiare inquadratura né scala.

```
Use the attached cat sprite as STYLE reference only: same photorealistic internet meme quality, harsh phone flash, chunky funny panic energy.

Single game sprite, square 1:1, pure flat fuchsia background (#ff00ff) filling entire image.

Subject: ONE cat only, centered. Camera DIRECTLY BEHIND — straight rear view. Compact upright run, narrow lane-fit silhouette (~40% frame width), cat ~60% frame height.

Theme: [jungle / city / space / …] — costume and fur accents only, same cat breeds as default roster.

Variants per cat: orange, maxwell, paralized, tuxedo, barong.

Chroma masking: crisp 1-2px hard black outline; no AA/bleed into #ff00ff; no shadows/glow/fringe; outside outline only pure #ff00ff; no text.
```

`*_front`: vista frontale o tre quarti frontale, stesso stile. In gioco il flip orizzontale di `*_center` copre sinistra/destra.

### Prompt carlini (`*_pugs_sheet`)

Tre stati, stesso carlino meme photorealistico. Template: `carlino_meme.prompt.txt`, `carlino_flee.prompt.txt` (e `carlino_bark.prompt.txt` se presente).

| file | pose |
|------|------|
| `carlino_meme.png` | fronte seduto, occhioni tristi meme (sad puppy eyes) |
| `carlino_bark.png` | fronte, abbaiata comica arrabbiata |
| `carlino_flee.png` | profilo destro, fuga panico |

Adatta accessori/tema al mondo; tieni proporzioni e rendering del carlino base.

#### `carlino_meme` — template

Vedi `tools/temp/assets/carlino_meme.prompt.txt`. Per un mondo specifico copia il file in `{theme}_carlino_meme.prompt.txt` e compila il blocco Theme (es. city = gilet cantiere).

```
Use the attached pug sprite as the ONLY character reference: same photorealistic meme pug (carlino), same fawn/tan fur, black mask, chunky body, same rendering quality and proportions.

Single game sprite, square 1:1, pure flat fuchsia background (#ff00ff) filling the entire image.

Subject: ONE pug only, centered with generous fuchsia margin (~20% fuchsia on each side). Front view, sitting upright facing camera directly. Meme "sad puppy eyes" expression: enormous glossy round eyes (~2× normal size), dewy pleading look, downturned mouth, soft worried brows. NOT barking, NOT snarling, NOT showing teeth, NOT angry, NOT side view, NOT running.

Theme: [city / jungle / space / …] — costume and accessories only (e.g. city = orange construction safety vest with neon reflective stripes).

Chroma masking:
- crisp 1-2px hard black outline around entire silhouette
- no anti-aliasing / bleed into #ff00ff
- no drop shadow, soft shadow, outer glow, gray fringe, ground contact shadow
- shading only inside the character
- outside black outline: only pure #ff00ff
- no text, no labels
```

### Follow-up se il foglio è troppo fitto / bordi sporchi

```
Keep the same style and fuchsia background (#ff00ff). Regenerate with more fuchsia padding between sprites, sharper silhouettes, zero fringe, zero text.
```

### Singola tile

Non usare prompt in prosa libera. Parti dal template dello stato (`carlino_meme.prompt.txt`, `carlino_flee.prompt.txt`, …), compila Theme e salva come `{theme}_{sprite}.prompt.txt`.

Follow-up se il foglio ha ancora ombre / AA: vedi blocco sopra in **Anti-alone**.

## Post-produzione

1. Non ritagliare a mano: usa sempre `extract-fuchsia-sprites.mjs`.
2. Output diretto in `public/assets/cats/${theme}/` o `public/assets/pugs/${theme}/` col nome esatto.
3. Verifica in gioco con `npm run dev` cambiando mondo.
4. Dipendenza: `pngjs` (devDependency). Se manca: `npm install -D pngjs`.
