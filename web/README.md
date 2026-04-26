# ArtMapify web

Browser version of [ArtMapify](../README.md). Drop in an image, get back a zip with the preview, per-tile build guides, and dye totals. All processing runs in your browser; nothing is uploaded.

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

- Next.js 16 (App Router, Turbopack, React Compiler)
- Tailwind v4 + shadcn/ui (base-ui primitives)
- Canvas API + jszip for client-side image processing and zip output
- next-themes for dark mode

## Assets

- `public/palette.csv` is a copy of the repo-root palette.
- `public/items/*.png` are the Minecraft item textures. Keep them in sync with the root `items/` folder (use `npm run fetch-textures` at the repo root, then copy into `web/public/items/`).
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
