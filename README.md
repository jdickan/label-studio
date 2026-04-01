# Label Studio

A full-stack label management application for a scented products business (soy candles, room sprays, room diffusers). Built to manage the entire label production pipeline — from brand identity and physical sheet templates to designed label templates and a print queue.

---

## What It Does

Label Studio lets you:

- **Manage label sheet templates** — Store precise physical measurements (margins, gaps, label dimensions, corner radii) for OnlineLabels sheet formats. Upload a vendor's blank PDF template and the app extracts measurements automatically via vector path analysis.
- **Design label templates** — Define layout zones (brand name, product name, scent notes, weight/volume, address, etc.) on a per-sheet template with safe-area and bleed guides.
- **Maintain a product catalog** — Store product details (type, scent notes, weight, SKU, ingredients, warnings) ready to populate labels.
- **Queue print jobs** — Batch products onto a label sheet and preview the layout in the browser. Product-content PDF generation is planned for a future release. The sheet template border PDF (die-cut label outlines in two OCG layers for printing + on-screen guidance) is available separately via "Download PDF" on any sheet card.
- **Configure brand settings** — Store colors, fonts, logo, address, and contact info centrally so every template uses consistent branding.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Node.js | v24 |
| Language | TypeScript 5.9 (strict-leaning flags; `composite: true` for `lib/db`, `lib/api-client-react`, `lib/api-zod` only) |
| API server | Express 5 |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod (`zod/v4`), `drizzle-zod` |
| API contract | OpenAPI 3.1 → Orval codegen |
| Frontend | React 19 + Vite + Tailwind CSS + shadcn/ui + wouter |
| State / data fetching | TanStack Query v5 |
| PDF generation | Manual low-level PDF assembly (raw objects + xref; no library) |
| File uploads | multer (memory storage) |
| Streaming | Server-Sent Events (SSE) for real-time analysis progress |
| Platform | Replit |

---

## Workspace Structure

```
label-studio/
├── artifacts/
│   ├── api-server/          # Express 5 API server (@workspace/api-server)
│   └── label-studio/        # React + Vite frontend (@workspace/label-studio)
├── lib/
│   ├── api-spec/            # OpenAPI spec + Orval config (@workspace/api-spec)
│   ├── api-client-react/    # Generated TanStack Query hooks (@workspace/api-client-react)
│   ├── api-zod/             # Generated Zod request/response schemas (@workspace/api-zod)
│   └── db/                  # Drizzle ORM schema + DB connection (@workspace/db)
├── scripts/
│   └── src/seed.ts          # Database seed script (@workspace/scripts)
├── docs/                    # Project documentation
├── pnpm-workspace.yaml
├── tsconfig.base.json       # Shared TS config (strict-leaning flags; lib/* packages add composite: true)
└── package.json             # Root scripts
```

---

## Local Setup

### Prerequisites
- Node.js 24+
- pnpm 10+
- PostgreSQL (provided automatically on Replit)

### Steps

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Push the DB schema (creates tables)
pnpm --filter @workspace/db run push

# 3. Seed the database with sample data
pnpm --filter @workspace/scripts run seed

# 4. Start both services (Replit handles this via configured workflows)
#    API server:  pnpm --filter @workspace/api-server run dev
#    Frontend:    pnpm --filter @workspace/label-studio run dev
```

### After changing the OpenAPI spec

```bash
# Regenerate the React Query hooks and Zod schemas
pnpm --filter @workspace/api-spec run codegen
```

### After changing the DB schema

```bash
pnpm --filter @workspace/db run push
```

---

## Features

### Label Sheet Templates
Stores the physical geometry of a label sheet: page size, label dimensions, grid layout (rows × columns), margins, gaps, corner radius, shape (rectangle / circle / oval), safe-area, and bleed. Six verified OnlineLabels (OL-prefixed) sheets are seeded alongside one custom CandleBliss sheet (CB-4OZ-TIN, 1-up wrap). No Avery templates are included — measurements for Avery formats have not been independently verified. See [Label Sheet Measurement Protocol](docs/LABEL_SHEET_MEASUREMENT_PROTOCOL.md) for why PDF extraction is used instead of web scraping.

Key UI features:
- **Upload Template PDF** — drag-and-drop one or more PDF files; a 12-step SSE-streamed checklist extracts measurements and validates the H/V math before prompting for import
- **Download PDF** — generates a two-layer PDF (manual PDF assembly, no library). Both OCG layers draw the same label die-cut outlines: "Label Borders" (black, ~1pt, printable) and "Guides" (Illustrator guide blue, ~0.5pt, display-only — excluded from print output via OCG `AS` event). Margin/safe-area lines are not yet in the generated PDF (they appear in the browser preview only)
- **Add/Edit Custom Sheet** — manual form with full field set including corner radius and safe area/bleed section
- **"New" badge** — auto-applied to sheets updated today; expires at midnight

### Label Templates
Stores layout zone definitions — where each piece of content sits on a label. Zones use relative positioning (percentages of label width/height). Templates are associated with a specific label sheet and optionally enable safe area guides (bleed + live area insets).

### Product Catalog
Supports four product types: `soy_candle`, `room_spray`, `room_diffuser`, `other`. Stores: name (required), scent name (required), size (required), scent notes, SKU, weight, ingredients, burn time, wax type, warnings, location, active flag, linked label template.

### Print Jobs
Groups products onto a label sheet with a quantity per product. Generates a print-ready batch layout.

### Brand Settings
Single-row config table storing colors (primary, secondary, accent, text, background), fonts (heading, body), logo URL, brand name, tagline, website, address, phone, email. The Typography section includes font upload cards (session-local, using the browser `FontFace` API) and a font specimen panel. A kerning reference panel shows CSS `font-feature-settings: "kern"` behavior on common problem pairs (AV, AW, LT, TA).

### Dashboard
Summary stats (total sheets, templates, products, print jobs), recent print jobs, and a product breakdown by type.

---

## Known Gaps / Planned Work

- **Print-job content PDF** — print jobs currently produce a browser preview only; a content-rendered PDF (product fields mapped to label zones) is planned
- **Server-side font storage** — uploaded fonts are session-local via the browser `FontFace` API; persistent server-side font hosting is planned
- **Visual label template designer** — the current zone editor is a JSON textarea; an upload-driven visual editor (image → LLM zone detection → drag-to-resize) is planned
- **PDF guide lines** — margin, safe-area, and bleed geometry is shown in the browser sheet preview but not yet rendered into the downloaded PDF

## Documentation Index

- [Architecture](docs/ARCHITECTURE.md) — monorepo layout, DB schema, API structure, key design decisions
- [Label Workflow](docs/LABEL_WORKFLOW.md) — end-to-end production pipeline
- [Label Sheet Measurement Protocol](docs/LABEL_SHEET_MEASUREMENT_PROTOCOL.md) — PDF extraction methodology, verified measurements
