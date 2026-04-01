# Architecture

> Last verified against codebase: April 2026. If schema, routes, or artifact config change, update this file.

## Notes on Original Task Scope

Two items mentioned in the original planning spec diverge from the current implementation and are documented here explicitly rather than in the original planned location:

- **pdf-lib**: The original task mentioned pdf-lib as the PDF generation library. In practice, the template border PDF is generated via a custom low-level PDF object emitter (< 200 lines in `labelSheets.ts`) with no external library. This was the implementation choice made during initial development.
- **brand_fonts table**: The original task referenced a `brand_fonts` database table. No such table exists in the current schema. Font management is session-local via the browser `FontFace` API (see the "Font Storage" section below).

---

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

All packages extend `tsconfig.base.json`. Three TypeScript library packages set `composite: true` and emit declaration files, enabling TypeScript project references:
- `lib/db` — composite + declarationMap
- `lib/api-client-react` — composite + declarationMap
- `lib/api-zod` — composite + declarationMap

`lib/api-spec` is a plain JavaScript/TypeScript tooling package (Orval config); it has no `tsconfig.json`. App/script packages (`artifacts/*`, `scripts`) use project `references` to consume the composite libs but do not set `composite` themselves.

The base config enables strict-leaning settings individually (`noImplicitAny`, `strictNullChecks`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitReturns`) rather than using the `strict` umbrella flag.

---

## Artifact Routing (Replit)

Replit routes incoming requests by path prefix. Each artifact registers a `previewPath`:

| Artifact | Preview path | Default local port |
|---|---|---|
| `api-server` | `/api` | 8080 (set via `PORT` env var injected by Replit) |
| `label-studio` | `/` (root) | 23804 (set via `PORT` env var injected by Replit) |
| `mockup-sandbox` | `/__mockup` | 8081 (set via `PORT` env var injected by Replit) |

Ports are runtime-configured by Replit via the `PORT` environment variable declared in each `artifact.toml`. The values above are the defaults defined there but are controlled by the platform.

**API routing in development and production:** Replit's path-based artifact routing forwards `/api/*` requests to the api-server artifact directly. The Vite dev server has **no proxy block** — the frontend uses root-relative `/api/...` URLs and relies entirely on platform routing, not a Vite proxy. This is consistent between development (Replit dev URLs) and production (`.replit.app` domain).

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
Product catalog. Four product types are supported.

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `product_type` | text enum | `soy_candle` / `room_spray` / `room_diffuser` / `other` |
| `name` | text | **required** — product display name |
| `scent_name` | text | **required** — scent variant name (e.g. "Meadow Frolic") |
| `scent_notes` | text | nullable; top/heart/base note description |
| `size` | text | **required** — e.g. "8 oz", "4 fl oz" |
| `weight` | text | nullable; label-ready weight string (e.g. "Net Wt 8 oz (226g)") |
| `ingredients` | text | nullable |
| `instructions` | text | nullable |
| `burn_time` | text | nullable; candles only |
| `wax_type` | text | nullable; candles only |
| `warnings` | text | nullable |
| `location` | text | nullable; "Made in …" |
| `sku` | text | nullable |
| `is_active` | boolean | Default true |
| `label_template_id` | integer FK | nullable; → `label_templates.id`, SET NULL on delete |
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
| `status` | text enum | `draft` / `ready` / `printed` |
| `notes` | text | nullable |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### Foreign Keys & Relationships

```
label_sheets ←──┬── label_templates.label_sheet_id  (SET NULL on delete)
                └── print_jobs.label_sheet_id        (no cascade, required FK)

label_templates ←── products.label_template_id      (SET NULL on delete, optional)

design_system    (singleton, no foreign keys)
```

### Font Storage — No `brand_fonts` Table

There is **no persistent `brand_fonts` database table**. Font management is session-local:

- The Brand Settings page provides `FontUploadCard` components that use the browser `FontFace` API to load uploaded font files (`FontFace(name, url(dataUrl))`).
- Loaded fonts are added to `document.fonts` and are active for the current browser session only.
- The font family names (`headingFont`, `bodyFont`) are stored as plain text strings in `design_system`. Users enter the CSS family name matching their uploaded or Google font.
- Font files themselves are not persisted to the server or database in the current implementation. Persistent server-side font storage is planned for a future task.

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

**Never hand-edit** files in `api-client-react/` or `api-zod/`. Always update `openapi.yaml` and re-run codegen.

**Where generated code is used:**
- The API server imports `@workspace/api-zod` schemas for request body validation on standard CRUD routes (label sheets, templates, products, print jobs, design system).
- The frontend imports `@workspace/api-client-react` TanStack Query hooks for all standard CRUD data fetching (e.g. `useGetLabelSheets`, `useDeleteLabelSheet`).

**Where manual HTTP is used (exceptions):**
- **PDF upload + SSE analysis**: the label-sheets page uses `fetch()` with `FormData` for `POST /api/label-sheets/upload-pdf` and `new EventSource(...)` for the SSE stream — these cannot use generated hooks because they involve multipart and streaming responses. The backend `pdfAnalysis.ts` routes parse request data manually (no generated Zod schemas for these routes).
- **Import endpoint**: `POST /api/label-sheets/import` is called via manual `fetch()` from the review modal.

---

## SSE Streaming — PDF Analysis

The PDF template upload flow uses Server-Sent Events to stream real-time analysis progress to the browser:

1. `POST /api/label-sheets/upload-pdf` — multer accepts one or more PDF files into memory as a single batch. One UUID `jobId` is assigned for the whole batch. Returns `{ jobId, fileCount, filenames[] }`.
2. Frontend opens **one** `EventSource` to `GET /api/label-sheets/analyze/:jobId/events` for the batch.
3. The server processes each file sequentially. Each SSE event includes `file` (original filename string) and `fileIndex` (0-based integer) so the frontend can route progress to the correct file's checklist panel. The 12 steps run per-file:
   ```
   data: {"type":"step","file":"OL5225.pdf","fileIndex":0,"stepIndex":0,"stepLabel":"PDF Format Validation","status":"pass","detail":"..."}
   ```
4. On completion of each file, a final event includes the extracted measurements for that file.
5. After all files complete, the frontend closes the `EventSource`; the review modal shows a diff-editable form with extracted values for each file.
6. User submits to `POST /api/label-sheets/import` which bulk-inserts the verified sheets.

SSE state is held in a `Map<string, Job>` in-process (each `Job` has a `FileResult[]` array). It is not persisted; a server restart clears in-flight jobs. Jobs auto-delete after 5 minutes.

---

## PDF Generation (Download PDF)

`GET /api/label-sheets/:id/pdf` generates a two-layer PDF via **manual low-level PDF object assembly** — no third-party library. The generator in `labelSheets.ts` builds raw PDF objects as strings, tracks cross-reference byte offsets, and writes the `xref` table and trailer block directly.

The output PDF (`%PDF-1.6`) has **two Optional Content Groups (OCGs) that both draw the same label outline paths**, distinguished only by stroke color and weight:

- **OCG "Label Borders"** — black stroke (~1pt), declared printable (`/Intent [/View /Design /Print]`). Draws all label die-cut outlines (rectangle `re` operators or Bezier `m/l/c/h` paths for rounded corners).
- **OCG "Guides"** — Illustrator guide blue stroke (R=0 G=128 B=255, ~0.5pt), declared display-only. Draws the **same** label outlines again in a thinner blue line. The `AS` event dictionary turns this OCG **OFF** when the print event fires, so these lines are visible on-screen for placement guidance but do not appear in print output.

> Note: margin lines, safe-area insets, and bleed marks are **not yet implemented** in the generated PDF — that geometry exists in the browser sheet-preview component but has not been ported to the PDF output layer.

For sheets with a `corner_radius`, each label is drawn as a rounded-rectangle Bezier path using the cubic approximation constant `k = 0.5523` (standard quarter-circle cubic). This mirrors the Bezier extraction logic in `pdfAnalysis.ts` to reverse-engineer corner radii from uploaded PDFs.

---

## Key Design Decisions

**Why manual PDF assembly instead of a library (pdf-lib / Puppeteer)?**
The template PDF only needs to draw rectangles and Bezier paths at precise physical coordinates — there is no text, no images, and no layout engine required. A hand-written PDF object emitter (< 200 lines) handles this more reliably than pulling in a large dependency. Label measurements are already in physical inches, making point-to-unit conversion trivial without library overhead or screenshot artifacts.

**Why a single-row `design_system` table?**
Brand settings are effectively a global config object. A singleton table (always `id = 1`) avoids the complexity of user accounts or multi-tenant data while keeping the data queryable and patchable via the standard REST pattern. The GET endpoint seeds defaults if the row is missing.

**Why OnlineLabels only (no Avery)?**
All seeded measurements were extracted from the vendor's own PDF template files. Avery templates were not verified and were intentionally excluded to avoid shipping incorrect measurements.

**Why Zod + Orval codegen?**
The OpenAPI spec is the single source of truth for the API contract. Orval generates both the frontend hooks and the backend validation schemas from the same file. This eliminates the drift that comes from hand-maintaining parallel type definitions on both sides.

**Why pnpm workspaces?**
Shared libraries (`db`, `api-spec`, `api-zod`, `api-client-react`) need to be consumed by both `api-server` and `label-studio`. A monorepo lets them be co-located and version-locked without a private registry.
