<div align="center">

# ArtMapify

**Turn any image into a grid of Minecraft maps you can paint in-game.**

Built for the [ArtMap](https://gitlab.com/BlockStack/ArtMap) plugin. Pick a canvas size in tiles, drop in a picture, and get a preview plus a step-by-step build guide for every map.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-43853d.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg?logo=next.js&logoColor=white)](https://nextjs.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/Melishy/artmapify/pulls)

[Web app](web/) &nbsp;&middot;&nbsp; [CLI](#quick-start) &nbsp;&middot;&nbsp; [Arguments](#command-line-arguments) &nbsp;&middot;&nbsp; [How it works](#shade-digits-on-the-guides)

</div>

---

## What you get

Give it a source image and a canvas size (in tiles) and it produces:

- a **preview** of what the finished art will look like in-game,
- one **guide image per map tile** showing which item to use in each cell and how many times to darken it,
- an optional **combined canvas** that stitches all guide tiles together,
- a **summary.json** with total dye counts.

## Two ways to use it

|             | Best for                                                   | Where          |
| ----------- | ---------------------------------------------------------- | -------------- |
| **Web app** | No install. Drop an image, tweak settings, download a zip. | [`web/`](web/) |
| **CLI**     | Scripting, batching, reproducible runs.                    | this repo      |

## Contents

- [Shade digits on the guides](#shade-digits-on-the-guides)
- [Requirements](#requirements)
- [Install](#install)
- [Item textures](#item-textures)
- [Quick start](#quick-start)
- [Command-line arguments](#command-line-arguments)
- [Examples](#examples)
- [Re-running the same job](#re-running-the-same-job)
- [Project layout](#project-layout)
- [Notes on the palette](#notes-on-the-palette)

## Shade digits on the guides

Each cell on a guide shows a small digit 0-3. That number is **how many times you need to darken the base color** after placing it:

- `0` = draw a pixel, use the feather once (brightest).
- `1` = draw, that's it (default).
- `2` = draw, then use coal.
- `3` = draw, then use coal twice (darkest).

## Requirements

- Node.js 20+ (ESM, global `fetch`).
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
npm run dev:cli -- myart.png --width 5 --height 5 --dither floyd-steinberg --guide --combined
```

This reads `myart.png`, lays it out as a 5x5 grid of maps, dithers, and writes everything into `out/`.

Outputs:

| File                    | When                      | What it is                                                                                                                  |
| ----------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `out/preview.png`       | always                    | What the canvas will look like in-game. Compare to your input.                                                              |
| `out/map_<gx>_<gy>.png` | with `--guide`            | Per-map build guide. `gx` is the column (1..width), `gy` is the row (1..height). Includes a numbered ruler around the edge. |
| `out/canvas.png`        | with `--guide --combined` | All guide tiles stitched into one big image.                                                                                |
| `out/summary.json`      | unless `--summary false`  | Item counts per tile and overall totals.                                                                                    |

## Command-line arguments

Positional:

- `<input>` - path to the source image (PNG, JPG, etc.). Required. Alternatively pass `--input <path>`.

### Output

| Flag               | Default | Description                                    |
| ------------------ | ------- | ---------------------------------------------- |
| `--out <dir>`      | `out`   | Where all generated files go.                  |
| `--summary <bool>` | `true`  | Pass `--summary false` to skip `summary.json`. |

### Palette and textures

| Flag              | Default | Description                                                                                                                                                                 |
| ----------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--palette <csv>` | bundled | Override the bundled palette with your own CSV. Format: `Item,Color0,Color1,Color2,Color3`. Column index matches the digit printed on the guide (see "Shade digits" above). |
| `--items <dir>`   | `items` | Folder containing item PNG textures named after the CSV's `Item` column (lowercased, spaces -> underscores, e.g. `raw_iron.png`).                                           |

### Canvas size

One Minecraft map is one tile. Each tile has `tile-size` x `tile-size` dye cells (the real plugin uses 32x32 per map).

| Flag              | Default  | Description                                                                                                                                                                                       |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--width <n>`     | `4`      | Canvas width in tiles (maps across).                                                                                                                                                              |
| `--height <n>`    | `4`      | Canvas height in tiles (maps down).                                                                                                                                                               |
| `--aspect <mode>` | `manual` | `auto` derives `--width` and `--height` from the input image's aspect ratio while keeping the same total tile budget (`width * height`). `manual` uses the numbers verbatim.                      |
| `--fit <mode>`    | `fill`   | How the input is resized onto the canvas. `fill` stretches (current default, may distort). `cover` fills the canvas and crops overflow, no distortion. `contain` fits inside with letterbox bars. |
| `--tile-size <n>` | `32`     | Dye cells per tile side. Leave at 32 to match ArtMap.                                                                                                                                             |

### Image processing

| Flag                | Default    | Description                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--dither <method>` | `none`     | `none`, `floyd-steinberg`, `burkes`, or `sierra-lite`. Dithering improves gradients at the cost of a noisier look.                                                                                                                                                                                                                                                                                    |
| `--gamma-dither`    | off        | Diffuse dither error in linear-light space. Usually gives cleaner gradients on photographs, especially on skin tones and dark areas.                                                                                                                                                                                                                                                                  |
| `--metric <name>`   | `luma-hue` | How colors are matched to the palette. `luma-hue` (grays stay gray, saturated colors match hue), `redmean` (cheap perceptual, good for dark tints), or `rgb` (plain squared RGB distance).                                                                                                                                                                                                            |
| `--click-bias <f>`  | `0`        | Penalize palette shades that cost more in-game clicks per cell. Shade `1` is 0 clicks (placed), shades `0` and `2` are 1 click each (feather or coal once), shade `3` is 2 clicks (coal twice). At `0` this is a pure color match. Values around `8..16` nudge near-ties toward the cheap shade and can cut total click count a lot without changing the look much. Crank higher for more aggressive. |
| `--brightness <f>`  | `1.0`      | Multiplier. `>1` brighter, `<1` darker.                                                                                                                                                                                                                                                                                                                                                               |
| `--contrast <f>`    | `1.0`      | Multiplier. `>1` more contrast.                                                                                                                                                                                                                                                                                                                                                                       |
| `--saturation <f>`  | `1.0`      | Multiplier. `0` desaturates.                                                                                                                                                                                                                                                                                                                                                                          |
| `--sharpness <f>`   | `1.0`      | Multiplier. `>1` sharper.                                                                                                                                                                                                                                                                                                                                                                             |
| `--filter <name>`   | `none`     | `none`, `grayscale`, or `sepia`.                                                                                                                                                                                                                                                                                                                                                                      |

### Guide image rendering

Only relevant when you pass `--guide` or `--combined`.

| Flag                    | Default | Description                                                                                                                                                                                            |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--guide`               | off     | Emit a `map_<gx>_<gy>.png` for every tile.                                                                                                                                                             |
| `--combined`            | off     | Also emit `canvas.png` stitching all guide tiles. Requires `--guide`.                                                                                                                                  |
| `--cell-size <n>`       | `32`    | Pixels per dye cell in guide images. Larger = bigger, easier-to-read guides.                                                                                                                           |
| `--preview-scale <n>`   | `4`     | Nearest-neighbor zoom applied to `preview.png`.                                                                                                                                                        |
| `--texture-padding <f>` | `0.2`   | Fraction of a cell used as a colored border around the item texture. `0` = texture fills the cell, `0.45` = tiny texture, big dye border.                                                              |
| `--tile-border <n>`     | `2`     | Black grid line width between tiles on `canvas.png`. `0` disables.                                                                                                                                     |
| `--cell-border <n>`     | `1`     | Black grid line width between cells inside each `map_*.png`. `0` disables. Seams between cells that share the same item + shade are suppressed automatically so solid "runs" read as one block.        |
| `--ruler-margin <n>`    | `24`    | Width (px) of the numeric ruler around each `map_*.png` (column numbers on top, row numbers on left). `0` disables. The top-left corner shows the current tile's index out of the total (e.g. `3/25`). |

## Examples

Plain 4x4 preview only:

```bash
npm run dev:cli -- myart.png
```

5x5 with dithering, full guides, and stitched canvas:

```bash
npm run dev:cli -- myart.png --width 5 --height 5 --dither floyd-steinberg --guide --combined
```

Big, readable per-tile guides (good for printing or a second monitor):

```bash
npm run dev:cli -- myart.png --width 3 --height 3 --guide --cell-size 48 --ruler-margin 32
```

Grayscale portrait, higher contrast:

```bash
npm run dev:cli -- photo.jpg --filter grayscale --contrast 1.2 --guide
```

Match the input's aspect ratio with a 12-tile budget, cover-crop, and bias toward cheap dye shades:

```bash
npm run dev:cli -- photo.jpg --width 4 --height 3 --aspect auto --fit cover --click-bias 12 --guide
```

Photo-friendly dither (linear-light error diffusion) with a full guide:

```bash
npm run dev:cli -- photo.jpg --width 5 --height 5 --dither floyd-steinberg --gamma-dither --guide --combined
```

## Re-running the same job

`summary.json` includes an `inputHash` (SHA-256 of the input file) and an `argsHash` (short hash of the output-affecting arguments). If you rerun with the same image and the same flags, both hashes will be identical, so you can skip re-rendering. Change the input or any output-affecting flag (width, dither, click-bias, etc.) and at least one hash will change.

## Project layout

This repo is an npm monorepo with three workspaces:

```
items/               Item textures (populated by fetch-textures).
core/                @artmapify/core - shared palette parsing, color matching, quantization.
  palette.csv        61 items x 4 shades, authoritative per ArtMap plugin + Minecraft wiki.
  src/palette-data.ts  Auto-generated bundled copy (regenerated by gen-palette.mjs).
  src/
    palette.ts       parsePaletteCsv, closestEntry, clickCost.
    quantize.ts      quantize + splitIntoTiles.
    aspect.ts        resolveAspect helper.
    types.ts         Shared types.
cli/                 artmapify - CLI built on sharp + @artmapify/core.
  src/
    cli.ts           Argument parsing and pipeline.
    image.ts         sharp-based load + resize + adjust.
    render.ts        Preview and guide image rendering.
web/                 Next.js web app built on Canvas + @artmapify/core.
scripts/
  fetch-textures.mjs Downloads item textures.
  gen-palette.mjs    Regenerates palette.csv from the wiki (with --check).
```

### Workspace commands

| Command                     | What it does                                                       |
| --------------------------- | ------------------------------------------------------------------ |
| `npm install`               | Installs all workspaces and links them together.                   |
| `npm run build`             | Builds every workspace (`core`, `cli`, `web`).                     |
| `npm run build:cli`         | Builds just the CLI. Implies a fresh `core` build first if needed. |
| `npm run build:web`         | Builds just the web app.                                           |
| `npm run dev:cli -- <args>` | Runs the CLI from TS sources via `tsx`. Pass CLI args after `--`.  |
| `npm run dev:web`           | Starts the Next.js dev server.                                     |
| `npm run typecheck`         | `tsc --noEmit` across every workspace.                             |

## Notes on the palette

`core/palette.csv` covers the 61 non-void colors the ArtMap plugin exposes. Shade columns are ordered brightest to darkest. `Color1` is the base color you get just by placing the material; `Color0` is one bone meal click brighter, and `Color2`/`Color3` are one and two coal clicks darker. The values are validated against the [Minecraft wiki map color table](https://minecraft.wiki/w/Map_item_format#Base_colors). Run `node scripts/gen-palette.mjs --check` to diff against the authoritative table; run `node scripts/gen-palette.mjs` (no flag) to regenerate both `core/palette.csv` and the bundled `core/src/palette-data.ts`.

## License

[MIT](LICENSE) &copy; melishy
