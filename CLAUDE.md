@AGENTS.md

# Project

Next.js 16 App Router app (React 19, TypeScript strict, Tailwind CSS v4), currently the
unmodified `create-next-app` scaffold — this is a hackathon repo, so most structure is still
to be built.

## Commands

```bash
npm run dev     # dev server on http://localhost:3000
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint (flat config, eslint-config-next)
```

There is no test setup yet.

## Layout

- `app/` — App Router routes. `layout.tsx` is the root layout (Geist/Geist Mono via
  `next/font/google`, exposed as `--font-geist-sans` / `--font-geist-mono`).
- `app/globals.css` — the only stylesheet. Tailwind v4 is configured here via
  `@import "tailwindcss"` + `@theme inline`; there is no `tailwind.config.*`, so design
  tokens go in this file.
- `public/` — static assets served at `/`.
- `@/*` path alias maps to the repo root (e.g. `@/app/...`).

## Conventions

- Components in `app/` are Server Components by default; add `"use client"` only where a
  component actually needs browser APIs, state, or effects.
- Route component props use the generated helper types (`LayoutProps<"/">`,
  `PageProps<"/route">`) rather than hand-written prop interfaces — see `app/layout.tsx`.
- Dark mode is driven by `prefers-color-scheme` on CSS variables in `globals.css`, not by a
  `dark:` class strategy.
- Per `AGENTS.md`: this Next.js version differs from training data. Read the relevant guide
  under `node_modules/next/dist/docs/` before writing framework-level code.
