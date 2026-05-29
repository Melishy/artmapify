<div align="center">

# @artmapify/core

**The shared engine behind [ArtMapify](../README.md).**

Pure TypeScript, zero platform deps (just `pako` for gzip). The CLI and the web app both build on top of it, so the color math stays identical everywhere.

</div>

---

## What's in here

| Module             | Job                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `palette.ts`       | Parse the palette CSV, match a pixel to the nearest dye (`closestEntry`), compute click cost. |
| `quantize.ts`      | Error-diffusion dithering and `splitIntoTiles`.                                               |
| `aspect.ts`        | Fit a tile budget to a source image's aspect ratio.                                           |
| `artmap-export.ts` | Encode tiles into the ArtMap database format (gzip + base64 + Java hash).                     |
| `types.ts`         | Shared type definitions.                                                                      |
| `index.ts`         | Public API surface.                                                                           |

## Color matching metrics

| Metric               | Use it for                                                  |
| -------------------- | ----------------------------------------------------------- |
| `luma-hue` (default) | Mixed content. Grays stay gray, saturated colors match hue. |
| `redmean`            | Cheap perceptual match, keeps dark tints intact.            |
| `rgb`                | Plain squared distance. Simplest, can collapse darks.       |

## Build

```bash
npm run build      # tsc -> dist/
npm run typecheck  # tsc --noEmit
```

## The palette

`palette.csv` holds 61 items x 4 shades. It's generated from the [Minecraft map color table](https://minecraft.wiki/w/Map_item_format#Base_colors) by `scripts/gen-palette.mjs` at the repo root, which also emits the bundled `src/palette-data.ts` string so consumers don't need a runtime file read.

Shade columns run brightest to darkest:

| Column   | Brightness | In-game                              |
| -------- | ---------- | ------------------------------------ |
| `Color0` | x255       | 1 bone meal click brighter than base |
| `Color1` | x220       | the placed base color (0 clicks)     |
| `Color2` | x180       | 1 coal click darker                  |
| `Color3` | x135       | 2 coal clicks darker                 |
