# ArtMapify

Convert an image into a grid of Minecraft maps you can paint in-game using the [ArtMap](https://gitlab.com/BlockStack/ArtMap) plugin. Given a source image and a canvas size (in tiles), it produces:

- a **preview** of what the finished art will look like in-game,
- one **guide image per map tile** showing which item to use in each cell and how many times to darken it,
- an optional **combined canvas** that stitches all guide tiles together,
- a **summary.json** with total dye counts.

## Requirements

- Node.js 20+ (ES2022, ESM, global `fetch`).
- npm (or pnpm/yarn).
- Works on Windows, macOS, and Linux.

## Install

```bash
npm install
```

## Item textures

The per-tile guide images draw the actual Minecraft item texture inside each cell. Textures are not shipped with this repo. Run:

```bash
npm run fetch-textures
```

This populates the `items/` folder. If the folder is empty or missing, guides still render but cells show only the flat dye color plus the shade digit.

## Quick start

```bash
npx tsx src/cli.ts myart.png --width 5 --height 5 --dither floyd-steinberg --guide --combined
```

This reads `myart.png`, lays it out as a 5x5 grid of maps, dithers, and writes everything into `out/`.

Outputs:

| File | When | What it is |
|------|------|------------|
| `out/preview.png` | always | What the canvas will look like in-game. Compare to your input. |
| `out/map_<gx>_<gy>.png` | with `--guide` | Per-map build guide. `gx` is the column (1..width), `gy` is the row (1..height). Includes a numbered ruler around the edge. |
| `out/canvas.png` | with `--guide --combined` | All guide tiles stitched into one big image. |
| `out/summary.json` | unless `--summary false` | Item counts per tile and overall totals. |

## Shade digits on the guides

Each cell on a guide shows a small digit 0-3. That number is **how many times you need to darken the base color** after placing it:

- `0` = place the item, use the feather once (brightest).
- `1` = place, that's it (default).
- `2` = place, then use coal.
- `3` = place, then use coal twice (darkest).

## Command-line arguments

Positional:

- `<input>` - path to the source image (PNG, JPG, etc.). Required. Alternatively pass `--input <path>`.

### Output

| Flag | Default | Description |
|------|---------|-------------|
| `--out <dir>` | `out` | Where all generated files go. |
| `--summary <bool>` | `true` | Pass `--summary false` to skip `summary.json`. |

### Palette and textures

| Flag | Default | Description |
|------|---------|-------------|
| `--palette <csv>` | `palette.csv` | CSV with columns `Item,Color0,Color1,Color2,Color3`. Column index matches the digit printed on the guide (see "Shade digits" above). |
| `--items <dir>` | `items` | Folder containing item PNG textures named after the CSV's `Item` column (lowercased, spaces -> underscores, e.g. `raw_iron.png`). |

### Canvas size

One Minecraft map is one tile. Each tile has `tile-size` x `tile-size` dye cells (the real plugin uses 32x32 per map).

| Flag | Default | Description |
|------|---------|-------------|
| `--width <n>` | `4` | Canvas width in tiles (maps across). |
| `--height <n>` | `4` | Canvas height in tiles (maps down). |
| `--aspect <mode>` | `manual` | `auto` derives `--width` and `--height` from the input image's aspect ratio while keeping the same total tile budget (`width * height`). `manual` uses the numbers verbatim. |
| `--fit <mode>` | `fill` | How the input is resized onto the canvas. `fill` stretches (current default, may distort). `cover` fills the canvas and crops overflow, no distortion. `contain` fits inside with letterbox bars. |
| `--tile-size <n>` | `32` | Dye cells per tile side. Leave at 32 to match ArtMap. |

### Image processing

| Flag | Default | Description |
|------|---------|-------------|
| `--dither <method>` | `none` | `none`, `floyd-steinberg`, `burkes`, or `sierra-lite`. Dithering improves gradients at the cost of a noisier look. |
| `--gamma-dither` | off | Diffuse dither error in linear-light space. Usually gives cleaner gradients on photographs, especially on skin tones and dark areas. |
| `--metric <name>` | `luma-hue` | How colors are matched to the palette. `luma-hue` (grays stay gray, saturated colors match hue), `redmean` (cheap perceptual, good for dark tints), or `rgb` (plain squared RGB distance). |
| `--click-bias <f>` | `0` | Penalize palette shades that cost more in-game clicks per cell. Shade `1` is 0 clicks (placed), shades `0` and `2` are 1 click each (feather or coal once), shade `3` is 2 clicks (coal twice). At `0` this is a pure color match. Values around `8..16` nudge near-ties toward the cheap shade and can cut total click count a lot without changing the look much. Crank higher for more aggressive. |
| `--brightness <f>` | `1.0` | Multiplier. `>1` brighter, `<1` darker. |
| `--contrast <f>` | `1.0` | Multiplier. `>1` more contrast. |
| `--saturation <f>` | `1.0` | Multiplier. `0` desaturates. |
| `--sharpness <f>` | `1.0` | Multiplier. `>1` sharper. |
| `--filter <name>` | `none` | `none`, `grayscale`, or `sepia`. |

### Guide image rendering

Only relevant when you pass `--guide` or `--combined`.

| Flag | Default | Description |
|------|---------|-------------|
| `--guide` | off | Emit a `map_<gx>_<gy>.png` for every tile. |
| `--combined` | off | Also emit `canvas.png` stitching all guide tiles. Requires `--guide`. |
| `--cell-size <n>` | `32` | Pixels per dye cell in guide images. Larger = bigger, easier-to-read guides. |
| `--preview-scale <n>` | `4` | Nearest-neighbor zoom applied to `preview.png`. |
| `--texture-padding <f>` | `0.2` | Fraction of a cell used as a colored border around the item texture. `0` = texture fills the cell, `0.45` = tiny texture, big dye border. |
| `--tile-border <n>` | `2` | Black grid line width between tiles on `canvas.png`. `0` disables. |
| `--cell-border <n>` | `1` | Black grid line width between cells inside each `map_*.png`. `0` disables. Seams between cells that share the same item + shade are suppressed automatically so solid "runs" read as one block. |
| `--ruler-margin <n>` | `24` | Width (px) of the numeric ruler around each `map_*.png` (column numbers on top, row numbers on left). `0` disables. The top-left corner shows the current tile's index out of the total (e.g. `3/25`). |

## Examples

Plain 4x4 preview only:

```bash
npx tsx src/cli.ts myart.png
```

5x5 with dithering, full guides, and stitched canvas:

```bash
npx tsx src/cli.ts myart.png --width 5 --height 5 --dither floyd-steinberg --guide --combined
```

Big, readable per-tile guides (good for printing or a second monitor):

```bash
npx tsx src/cli.ts myart.png --width 3 --height 3 --guide --cell-size 48 --ruler-margin 32
```

Grayscale portrait, higher contrast:

```bash
npx tsx src/cli.ts photo.jpg --filter grayscale --contrast 1.2 --guide
```

Match the input's aspect ratio with a 12-tile budget, cover-crop, and bias toward cheap dye shades:

```bash
npx tsx src/cli.ts photo.jpg --width 4 --height 3 --aspect auto --fit cover --click-bias 12 --guide
```

Photo-friendly dither (linear-light error diffusion) with a full guide:

```bash
npx tsx src/cli.ts photo.jpg --width 5 --height 5 --dither floyd-steinberg --gamma-dither --guide --combined
```

## Re-running the same job

`summary.json` includes an `inputHash` (SHA-256 of the input file) and an `argsHash` (short hash of the output-affecting arguments). If you rerun with the same image and the same flags, both hashes will be identical, so you can skip re-rendering. Change the input or any output-affecting flag (width, dither, click-bias, etc.) and at least one hash will change.

## Project layout

```
palette.csv          61 items x 4 shades, authoritative per ArtMap plugin + Minecraft wiki.
items/               Item textures (populated by fetch-textures).
src/
  cli.ts             Argument parsing and pipeline.
  palette.ts         CSV loader and color matching.
  image.ts           Load, resize, adjust, dither, quantize.
  render.ts          Preview and guide image rendering.
scripts/
  fetch-textures.mjs Downloads item textures.
  gen-palette.mjs    Regenerates palette.csv from the wiki (with --check).
```

## Notes on the palette

`palette.csv` covers the 61 non-void colors the ArtMap plugin exposes. Shade columns are ordered brightest to darkest so the column index directly equals the number of coal clicks the guide tells you to do. The values are validated against both the [Minecraft wiki map color table](https://minecraft.wiki/w/Map_item_format#Color_table) and the ArtMap plugin's `Palette_1_18.java` material-to-colorId mapping. If you ever change `palette.csv` by hand, run `node scripts/gen-palette.mjs --check` to diff against the authoritative table.
