# juan.com.uy

Minimal static blog. No dependencies: `build.mjs` turns Markdown in `content/posts/` into plain HTML in `dist/`.

## Write a post

Add `content/posts/my-slug.md` (the filename becomes the URL: `/my-slug/`):

```
---
title: My title
date: 2026-01-31T12:00:00Z
---

Markdown here. Raw HTML (iframes etc.) is allowed.
```

Put images in `public/images/` and reference them as `![alt](/images/name.png)`.

## Run locally

```
npm start      # builds and serves http://localhost:3000
```

## Deploy (Vercel)

Import the repo. `vercel.json` already sets the build command (`node build.mjs`) and output (`dist`); no framework preset needed.
It also keeps the old WordPress feed (`/feed/`) and redirects old WP URLs.

Site title, tagline and About text live in `site.json`.
