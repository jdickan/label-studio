# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Label Studio — a label management application for a scented products business (soy candles, room sprays, room diffusers).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + wouter

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── label-studio/       # React + Vite frontend
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
│   └── src/seed.ts         # Database seed script
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Database Schema

Tables:
- `label_sheets` — OnlineLabels sheet templates with physical dimensions (OL-only, no Avery)
- `label_templates` — Label layout zone templates (where logo, scent notes, etc. go)
- `design_system` — Brand settings (colors, fonts, logo URL, business info)
- `products` — Product catalog (soy candles, room sprays, room diffusers)
- `print_jobs` — Print job queue with product quantities and sheet selection

## API Endpoints

All routes prefixed with `/api`:
- `GET/POST /label-sheets` — Label sheet CRUD
- `GET/PATCH/DELETE /label-sheets/:id`
- `POST /label-sheets/upload-pdf` — Upload PDF templates (multer, returns jobId)
- `GET /label-sheets/analyze/:jobId/events` — SSE stream of 12-step analysis progress
- `POST /label-sheets/import` — Bulk-import extracted measurements to DB
- `GET/POST /label-templates` — Label template CRUD
- `GET/PATCH/DELETE /label-templates/:id`
- `GET/PATCH /design-system` — Brand design system (singleton)
- `GET/POST /products` — Product catalog (supports ?productType=&search= filters)
- `GET/PATCH/DELETE /products/:id`
- `GET/POST /print-jobs` — Print job queue
- `GET/PATCH/DELETE /print-jobs/:id`
- `GET /dashboard/stats` — Summary stats
- `GET /dashboard/recent-print-jobs` — 5 most recent jobs
- `GET /dashboard/products-by-type` — Product count by type

## Frontend Pages

- `/dashboard` — Overview stats, recent print jobs, products by type
- `/products` — Product table with search/filter, CRUD, inline editing
- `/label-sheets` — Sheet template browser (OnlineLabels + custom); "Upload Template PDF" button triggers SSE-streaming 12-step analysis modal
- `/label-templates` — Layout zone editor with visual preview; supports safe area guides (bleed + text live area overlays) as an advanced per-template setting. Templates with safe area enabled show an "SA" badge in the sidebar.
- `/print-jobs` — Create/manage print batches, visual sheet preview, PDF/print
- `/brand-settings` — Design system editor (colors, fonts, logo, contact info)

## Seeded Data

- 7 label sheets: OL5225, OL1347, OL750, OL7850, OL775, OL800, OL875, plus CandleBliss custom (CB-4OZ-TIN). All PDF-verified OL templates have measurements extracted from PDF vector paths (not web-scraped). No Avery templates.
- 5 sample products (3 soy candles, 1 room spray, 1 room diffuser)
- 1 sample print job
- Design system with "Bloom & Ember" branding defaults
- 1 label template: "CandleBliss 4oz Tin Wrap" with safe area guides enabled (bleed 0.125", live area 0.125")

## PDF Template Analysis

- All OL measurements extracted from actual PDF vector drawing commands using Node.js `zlib.inflateSync`
- Two PDF modes handled: `re` operator (square corners) and Bezier paths (rounded corners)
- Y-flip coordinate transform (`1 0 0 -1 0 792 cm`) detected and handled automatically
- 12-step checklist streamed via SSE per file; measurements auto-computed and H/V math validated
- Reference doc: `docs/LABEL_SHEET_MEASUREMENT_PROTOCOL.md`
- Skill: `.local/skills/label-sheet-pdf/SKILL.md`

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` with `composite: true`. Run typechecks from root:
- `pnpm run typecheck` — full typecheck
- `pnpm --filter @workspace/api-spec run codegen` — regenerate from OpenAPI

## Packages

### `artifacts/api-server` (`@workspace/api-server`)
Express 5 API server. Routes in `src/routes/`. Uses `@workspace/api-zod` for validation and `@workspace/db` for persistence.

### `artifacts/label-studio` (`@workspace/label-studio`)
React + Vite frontend. Uses `@workspace/api-client-react` for all API calls.

### `lib/db` (`@workspace/db`)
Database layer. Push schema: `pnpm --filter @workspace/db run push`

### `lib/api-spec` (`@workspace/api-spec`)
OpenAPI spec + Orval codegen. Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `scripts` (`@workspace/scripts`)
Seed script: `pnpm --filter @workspace/scripts run seed`
