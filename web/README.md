<div align="center">

# ArtMapify Web

**The browser version of [ArtMapify](../README.md).**

Drop in an image, get back a zip with the preview, per-tile build guides, and dye totals. Everything runs client-side, nothing is uploaded.

[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg?logo=next.js&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-149eca.svg?logo=react&logoColor=white)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8.svg?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Deploy](https://img.shields.io/badge/Deploy-Vercel-black.svg?logo=vercel&logoColor=white)](https://vercel.com/new)

</div>

---

## Run locally

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000.

## Build

```bash
npm run build
npm start
```

## Deploy to Vercel

1. Import the repo on [vercel.com/new](https://vercel.com/new).
2. Set **Root Directory** to `web`.
3. Framework preset: **Next.js** (auto-detected). No env vars needed.
4. Deploy.

## Stack

- Next.js 16 (App Router, Turbopack)
- Tailwind v4 + shadcn/ui (base-ui primitives)
- Canvas API + jszip for client-side image processing and zip output
- Dark mode only

## Assets

- The palette is bundled directly into `@artmapify/core`; the web app imports it as a string and parses at startup, so there's no runtime fetch.
- `public/items/*.png` are the Minecraft item textures. Keep them in sync with the root `items/` folder (use `npm run fetch-textures` at the repo root, then copy into `web/public/items/`).
