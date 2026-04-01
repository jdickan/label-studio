# Architecture

## Monorepo Overview

The project is a pnpm workspace with four categories of packages:

| Directory | Package name | Role |
|---|---|---|
| `artifacts/api-server` | `@workspace/api-server` | Express 5 HTTP API + PDF generation |
| `artifacts/label-studio` | `@workspace/label-studio` | React + Vite SPA (the UI) |
| `artifacts/mockup-sandbox` | `@workspace/mockup-sandbox` | Vite preview server for canvas component prototyping |
| `lib/api-spec` | `@workspace/api-spec` | OpenAPI 3.1 spec + Orval codegen config |
| `lib/api-client-react` | `@workspace/api-client-react` | Generated TanStack Query hooks (read-only, never hand-edited) |
| `lib/api-zod` | `@workspace/api-zod` | Generated Zod schemas for request/response validation (read-only) |
| `lib/db` | `@workspace/db` | Drizzle ORM schema, migrations, DB connection |
| `scripts` | `@workspace/scripts` | Database seed script |

All packages extend `tsconfig.base.json` with `composite: true`. TypeScript project references enforce clean build boundaries.

---

## Artifact Routing (Replit)

Replit routes incoming requests by path prefix. Each artifact registers a `previewPath`:

| Artifact | Preview path | Port env var |
|---|---|---|
| `api-server` | `/api-server` (internal) | `PORT` (8080 default) |
| `label-studio` | `/` (root) | `PORT` |
| `mockup-sandbox` | `/__mockup` | `PORT` |

The frontend Vite dev server proxies `/api/*` requests to the API server. In production, Replit's routing handles the same via `artifact.toml`.

---

## Database Schema

PostgreSQL via Drizzle ORM. All schema files are in `lib/db/src/schema/`.

### Tables

#### `design_system`
Singleton row (one per brand). Stores all brand identity configuration.

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | Always row 1 |
| `brand_name` | text | e.g. "Raven" |
| `tagline` | text | nullable |
| `logo_url` | text | nullable; direct URL |
| `website_url` | text | nullable |
| `address` | text | nullable |
| `phone_number` | text | nullable |
| `email` | text | nullable |
| `primary_color` | text | hex, e.g. "#2d2926" |
| `secondary_color` | text | hex |
| `accent_color` | text | hex |
| `background_color` | text | hex |
| `text_color` | text | hex |
| `heading_font` | text | CSS font family name |
| `body_font` | text | CSS font family name |
| `updated_at` | timestamp | auto-updated on PATCH |

#### `label_sheets`
Physical label sheet geometry. One row per sheet format.

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `name` | text | Descriptive name |
| `brand` | text | "OnlineLabels", "CandleBliss", "Custom" |
| `code` | text | Vendor code, e.g. "OL5225" |
| `page_width` | real | Inches |
| `page_height` | real | Inches |
| `label_width` | real | Inches |
| `label_height` | real | Inches |
| `labels_across` | integer | Columns |
| `labels_down` | integer | Rows |
| `top_margin` | real | Inches from page top to first label row |
| `left_margin` | real | Inches from page left to first label column |
| `horizontal_gap` | real | Inches between label columns |
| `vertical_gap` | real | Inches between label rows |
| `shape` | text enum | `rectangle` / `circle` / `oval` |
| `corner_radius` | real | Inches; null = square corners |
| `is_custom` | boolean | False = vendor template; True = user-created |
| `safe_area_enabled` | boolean | Enables bleed + safe area guides |
| `bleed_inches` | real | Bleed amount in inches (default 0.125") |
| `safe_area_inches` | real | Inner safe area inset in inches (default 0.125") |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

#### `label_templates`
Layout zone definitions for a label design. Associated with a sheet.

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `name` | text | |
| `description` | text | nullable |
| `label_sheet_id` | integer FK | → `label_sheets.id`, SET NULL on delete |
| `zones` | jsonb | Zone layout map (see zone schema below) |
| `preview_notes` | text | nullable |
| `safe_area_enabled` | boolean | Per-template safe area toggle |
| `bleed_inches` | real | Default 0.125" |
| `safe_area_inches` | real | Default 0.125" |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Zone JSON structure** (current format — key is zone role name):
```json
{
  "brandName":   { "top": "8%",  "left": "5%", "width": "90%", "height": "18%", "align": "center", "fontSize": "7pt",  "bold": true },
  "productName": { "top": "30%", "left": "5%", "width": "90%", "height": "24%", "align": "center", "fontSize": "11pt", "bold": true },
  "scentNotes":  { "top": "56%", "left": "5%", "width": "90%", "height": "16%", "align": "center", "fontSize": "6pt" },
  "weight":      { "top": "76%", "left": "5%", "width": "42%", "height": "14%", "align": "left",   "fontSize": "5pt" },
  "website":     { "top": "76%", "left": "53%","width": "42%", "height": "14%", "align": "right",  "fontSize": "5pt" }
}
```
All position and size values are percentage strings relative to the label's physical dimensions. This ensures templates scale correctly across different sheet formats.

#### `products`
Product catalog. Three product types are supported.

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `product_type` | text enum | `soy_candle` / `room_spray` / `room_diffuser` |
| `name` | text | Product display name |
| `scent_name` | text | nullable; scent variant name |
| `scent_notes` | text | nullable; top/heart/base note description |
| `size` | text | nullable; e.g. "8 oz" |
| `weight` | text | nullable; label-ready weight string |
| `ingredients` | text | nullable |
| `instructions` | text | nullable |
| `burn_time` | text | nullable; candles only |
| `wax_type` | text | nullable; candles only |
| `warnings` | text | nullable |
| `location` | text | nullable; "Made in …" |
| `sku` | text | nullable |
| `is_active` | boolean | Default true |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

#### `print_jobs`
Batches products onto a label sheet for printing.

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `name` | text | e.g. "Weekend Batch" |
| `label_sheet_id` | integer FK | → `label_sheets.id` |
| `items` | jsonb | Array of `{ productId, quantity }` |
| `status` | text enum | `draft` / `queued` / `printing` / `done` |
| `notes` | text | nullable |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### Foreign Keys & Relationships

```
label_sheets ←──┬── label_templates.label_sheet_id  (SET NULL on delete)
                └── print_jobs.label_sheet_id        (no cascade)

design_system    (singleton, no foreign keys)
products         (standalone)
```

---

## API Structure

All routes are mounted under `/api` in `artifacts/api-server/src/routes/index.ts`.

| Module | File | Routes |
|---|---|---|
| Health | `health.ts` | `GET /healthz` |
| Label sheets | `labelSheets.ts` | `GET/POST /label-sheets`, `GET/PATCH/DELETE /label-sheets/:id`, `GET /label-sheets/:id/pdf` |
| PDF analysis | `pdfAnalysis.ts` | `POST /label-sheets/upload-pdf`, `GET /label-sheets/analyze/:jobId/events`, `POST /label-sheets/import` |
| Label templates | `labelTemplates.ts` | `GET/POST /label-templates`, `GET/PATCH/DELETE /label-templates/:id` |
| Design system | `designSystem.ts` | `GET/PATCH /design-system` |
| Products | `products.ts` | `GET/POST /products`, `GET/PATCH/DELETE /products/:id` |
| Print jobs | `printJobs.ts` | `GET/POST /print-jobs`, `GET/PATCH/DELETE /print-jobs/:id` |
| Dashboard | `dashboard.ts` | `GET /dashboard/stats`, `GET /dashboard/recent-print-jobs`, `GET /dashboard/products-by-type` |

Request body validation uses Zod schemas from `@workspace/api-zod` (generated from the OpenAPI spec). Responses are plain JSON.

---

## OpenAPI → Codegen Pipeline

```
lib/api-spec/openapi.yaml
        │
        ▼  pnpm --filter @workspace/api-spec run codegen  (Orval)
        │
        ├── lib/api-client-react/   ← TanStack Query hooks (useGetLabelSheets, etc.)
        └── lib/api-zod/            ← Zod validation schemas (CreateLabelSheetBody, etc.)
```

**Never hand-edit** files in `api-client-react/` or `api-zod/`. Always update `openapi.yaml` and re-run codegen. The API server imports `@workspace/api-zod` for request validation; the frontend imports `@workspace/api-client-react` for all data fetching.

---

## SSE Streaming — PDF Analysis

The PDF template upload flow uses Server-Sent Events to stream real-time analysis progress to the browser:

1. `POST /api/label-sheets/upload-pdf` — multer accepts one or more PDF files into memory; assigns a UUID `jobId` per file; kicks off analysis in the background; returns `{ jobs: [{ jobId, filename }] }`.
2. Frontend opens `EventSource` connections to `GET /api/label-sheets/analyze/:jobId/events` for each job.
3. The analysis function runs 12 sequential steps, emitting an SSE event after each step completes:
   ```
   data: {"step":1,"label":"PDF Format Validation","status":"done","detail":"..."}
   ```
4. On completion, the final event includes the extracted measurements.
5. Frontend closes the `EventSource`; the review modal shows a diff-editable form with extracted values.
6. User submits to `POST /api/label-sheets/import` which bulk-inserts the verified sheets.

SSE state is held in a `Map<string, AnalysisJob>` in-process. It is not persisted; a server restart clears in-flight jobs.

---

## PDF Generation (Download PDF)

`GET /api/label-sheets/:id/pdf` uses **pdf-lib** to build a two-layer PDF:

- **OCG "Label Borders"** (black, in print set) — stroked rectangles or rounded-rectangle Bezier paths tracing each label's die-cut outline.
- **OCG "Guides"** (cyan, excluded from print via `AS` event) — margin lines, safe-area insets, bleed marks.

The Bezier path construction mirrors the extraction logic in `pdfAnalysis.ts`: corner radius → quarter-circle cubic approximation using the constant `k = 0.552284749`.

---

## Key Design Decisions

**Why pdf-lib instead of Puppeteer/html2canvas?**
pdf-lib generates pure vector PDFs with no headless browser overhead. Label measurements are already in physical inches, making it straightforward to place paths precisely without pixel-to-point conversions or screenshot artifacts.

**Why a single-row `design_system` table?**
Brand settings are effectively a global config object. A singleton table (always `id = 1`) avoids the complexity of user accounts or multi-tenant data while keeping the data queryable and patchable via the standard REST pattern. The GET endpoint seeds defaults if the row is missing.

**Why OnlineLabels only (no Avery)?**
All seeded measurements were extracted from the vendor's own PDF template files. Avery templates were not verified and were intentionally excluded to avoid shipping incorrect measurements.

**Why Zod + Orval codegen?**
The OpenAPI spec is the single source of truth for the API contract. Orval generates both the frontend hooks and the backend validation schemas from the same file. This eliminates the drift that comes from hand-maintaining parallel type definitions on both sides.

**Why pnpm workspaces?**
Shared libraries (`db`, `api-spec`, `api-zod`, `api-client-react`) need to be consumed by both `api-server` and `label-studio`. A monorepo lets them be co-located and version-locked without a private registry.
