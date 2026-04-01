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
- `label_sheets` — Avery/OnlineLabels sheet templates with physical dimensions
- `label_templates` — Label layout zone templates (where logo, scent notes, etc. go)
- `design_system` — Brand settings (colors, fonts, logo URL, business info)
- `products` — Product catalog (soy candles, room sprays, room diffusers)
- `print_jobs` — Print job queue with product quantities and sheet selection

## API Endpoints

All routes prefixed with `/api`:
- `GET/POST /label-sheets` — Label sheet CRUD
- `GET/PATCH/DELETE /label-sheets/:id`
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
- `/label-sheets` — Sheet template browser (Avery, OnlineLabels, custom)
- `/label-templates` — Layout zone editor with visual preview
- `/print-jobs` — Create/manage print batches, visual sheet preview, PDF/print
- `/brand-settings` — Design system editor (colors, fonts, logo, contact info)

## Seeded Data

- 8 Avery/OnlineLabels sheet templates (5160, 5163, 22807, 5264, 6796, OL875, OL5275, OL107)
- 5 sample products (3 soy candles, 1 room spray, 1 room diffuser)
- 1 sample print job
- Design system with "Bloom & Ember" branding defaults

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
