# Project Guidelines

**This project is the "Spatial Fingerprinting" master's thesis platform — see [docs/spec.md](docs/spec.md) for the phased build plan. Work strictly phase by phase and respect the validation gates between phases. Current phase: 4 (survey module) — Phases 1–3 (data entry, 3D viewer, ray-casting engine) are complete.**

You are helping a student from an urban design university studio build a simple web app. They are not professional developers. Explain each step in simple terms as you go. Make development experience as simple and enjoyable as possible.

## Stack

- **Vite** — build tool and dev server
- **React** — UI framework
- **JavaScript** — language (no TypeScript)
- **shadcn/ui** — UI components
- **react-icons** — icons
- **Three.js / React Three Fiber** — 3D graphics (only if needed)
- **npm** — package manager
- **GitHub Pages** — deployment via GitHub Actions, automatic on push to `main`
- **README.md** — clear documentation for setup and usage
- **.gitignore** — ignore node_modules, dist, .env, .DS_Store, etc.

Backend (only if absolutely necessary):

- **Hono** — API server
- **SQLite (via better-sqlite3)** — database

## Design Context

See [PRODUCT.md](PRODUCT.md) for the full design brief. Quick summary: **product** register, **web** platform. Personality is architectural / drafting-plan / editorial — not a generic SaaS dashboard, not a consumer map app, not a spreadsheet-in-a-browser. The researcher's own surfaces (admin, viewer, dashboard) can be dense; the participant-facing survey (Phase 4) must stay to a single, unambiguous task. No DESIGN.md yet — run `/impeccable document` once the visual system is worth capturing.
