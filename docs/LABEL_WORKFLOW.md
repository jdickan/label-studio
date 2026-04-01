# Label Production Workflow

This document explains the end-to-end pipeline from brand identity configuration through to a finished print-ready PDF.

---

## Pipeline Overview

```
Brand Settings
     │
     ▼
Label Sheet Templates  ──────────────────┐
     │                                   │
     ▼                                   ▼
Label Templates (zones)          Print Job (queue)
     │                                   │
     └──────────────┬────────────────────┘
                    ▼
              Download PDF
```

Each stage is independently maintained. A label sheet can exist without any templates, and a template can exist without a print job. The stages feed each other but are not tightly coupled.

---

## Stage 1: Brand Settings

**Page:** `/brand-settings`  
**DB table:** `design_system` (singleton)  
**API:** `GET /api/design-system`, `PATCH /api/design-system`

The brand settings row is the central identity record for the business. Everything else (templates, PDFs, future exports) can reference it.

### Fields and their label use

| Setting | Label use |
|---|---|
| `brandName` | Printed in the brand name zone of every label |
| `tagline` | Optional secondary identity line |
| `logoUrl` | Image URL embedded in the logo zone |
| `address` | Regulatory / contact zone on labels |
| `websiteUrl` | Footer zone |
| `phoneNumber`, `email` | Contact zone on back-of-label designs |
| `primaryColor` | Default ink color for brand name zone |
| `secondaryColor` | Accent bars, dividers |
| `accentColor` | Highlight elements |
| `backgroundColor` | Label substrate color |
| `textColor` | Body copy ink color |
| `headingFont` | CSS font-family for brand name and product name |
| `bodyFont` | CSS font-family for scent notes, weight, address |

### Typography notes

The app globally enables CSS font kerning (`font-feature-settings: "kern" 1`). Two utility classes are available:
- `.kern-on` — explicit kerning enabled (inherits global setting)
- `.kern-off` — forces `font-kerning: none` to disable for a specific element

The Brand Settings page includes a **font specimen** panel that renders heading and body fonts at multiple sizes with realistic label copy, and a **kerning reference** panel showing common problem pairs (AV, AW, LT, TA) side-by-side with kerning on vs. off.

---

## Stage 2: Label Sheet Templates

**Page:** `/label-sheets`  
**DB table:** `label_sheets`  
**API:** `GET/POST /api/label-sheets`, `GET/PATCH/DELETE /api/label-sheets/:id`

A label sheet template defines the physical geometry of a blank sheet of labels as it comes from the manufacturer.

### Core measurements (all in inches)

```
┌─────────────────────────────────────┐
│            topMargin                │
│  ┌───────┐ hGap ┌───────┐ ...      │
│  │ label │      │ label │          │
│  │ w × h │      │ w × h │          │
│  └───────┘      └───────┘          │
│  vGap                               │
│  ┌───────┐      ┌───────┐          │
│  │       │      │       │          │
│  └───────┘      └───────┘          │
│            bottomMargin             │
└─────────────────────────────────────┘
```

**Math validation (H):**
```
leftMargin + (labelsAcross × labelWidth) + ((labelsAcross−1) × horizontalGap) + leftMargin = pageWidth
```

**Math validation (V):**
```
topMargin + (labelsDown × labelHeight) + ((labelsDown−1) × verticalGap) + topMargin = pageHeight
```

Note: left and right margins are assumed equal (symmetric grid). Same for top/bottom.

### Shape field

| Value | Meaning |
|---|---|
| `rectangle` | Square or rounded-corner rectangular die-cut |
| `circle` | Circular die-cut (labelWidth = labelHeight = diameter) |
| `oval` | Elliptical die-cut (labelWidth ≠ labelHeight, no corners) |

For `rectangle` shapes, `cornerRadius` stores the radius of the rounded corners in inches. `null` means square corners.

### Safe area and bleed

When `safeAreaEnabled = true`, the sheet carries two inset distances:

- **`bleedInches`** — how far artwork should extend beyond the die-cut line to account for cutting tolerance (typically 0.125")
- **`safeAreaInches`** — the inner "live area" inset where important content must stay to avoid being cut off (typically 0.125")

These are rendered as guide overlays in the browser sheet preview. Note: margin and safe-area lines are **not yet included** in the downloaded PDF — the generated PDF currently contains only the label die-cut outlines (see PDF layer description below).

### Adding new sheets

**Via PDF upload (recommended):**
1. Obtain the manufacturer's blank PDF template
2. Click "Upload Template PDF" on the Label Sheets page
3. The app decompresses PDF content streams and parses drawing commands (`re` operator for rectangles, Bezier paths for rounded corners)
4. A 12-step SSE-streamed checklist shows each extraction step in real-time
5. Extracted measurements are shown in a review form; H/V math validation runs automatically
6. Edit any values, then click "Import" to save

**Via manual entry:**
Use "Add Custom Sheet" for vendor-specific formats (e.g. CandleBliss drop-ship) or any sheet where no PDF template is available. The form includes all fields including corner radius and safe area settings.

See [Label Sheet Measurement Protocol](LABEL_SHEET_MEASUREMENT_PROTOCOL.md) for the full extraction methodology and why PDF extraction is used instead of web scraping.

### Downloading a sheet PDF

`GET /api/label-sheets/:id/pdf` returns a two-layer PDF:
- **OCG "Label Borders"** (black, ~1pt) — printable die-cut outlines; declared `/Intent [/View /Design /Print]`
- **OCG "Guides"** (Illustrator guide blue, ~0.5pt) — the **same** die-cut outline paths, drawn in a thinner blue line for on-screen placement guidance; excluded from print output via Acrobat's `AS` (Auto State) event dictionary

Both layers draw **identical geometry** — the label die-cut paths. Margin lines, safe-area insets, and bleed marks are **not yet rendered in the PDF output** (they are shown in the browser sheet-preview component but have not been ported to the PDF generator). Open in Acrobat or any OCG-aware viewer to toggle layers.

---

## Stage 3: Label Templates (Zone Definitions)

**Page:** `/label-templates`  
**DB table:** `label_templates`  
**API:** `GET/POST /api/label-templates`, `GET/PATCH/DELETE /api/label-templates/:id`

A label template maps content zones onto a specific label sheet's canvas. Each zone has a role and a position/size expressed as percentages of the label's physical dimensions.

### Zone roles

| Role key | Content |
|---|---|
| `brandName` | Manufacturer / brand identity name |
| `productName` | Product display name |
| `scentNotes` | Top / heart / base note description |
| `productType` | e.g. "Hand Poured Soy Candle", "Diffuser Oil" |
| `weight` | Weight or volume string (e.g. "4 oz · 113 g") |
| `address` | Business address (regulatory requirement) |
| `website` | Website URL |
| `disclaimer` | Safety / shake-first / do-not-ingest text |
| `date` | Manufacture or batch date |
| `photoArea` | Placeholder for a product photograph |
| `logoArea` | Placeholder for a logo image |
| `decorativeBar` | Solid color or divider element |

### Zone JSON structure

```json
{
  "brandName": {
    "top":    "8%",
    "left":   "5%",
    "width":  "90%",
    "height": "18%",
    "align":  "center",
    "fontSize": "7pt",
    "bold":   true
  }
}
```

All `top`, `left`, `width`, and `height` values are percentage strings relative to the label's rendered dimensions. This makes templates portable — the same zone definition renders correctly whether applied to a 2"×1.25" or a 4.75"×1.25" label, because the percentages scale with the label size.

### Safe area per template

Each template can independently enable safe-area guides (`safeAreaEnabled`, `bleedInches`, `safeAreaInches`). These are separate from (and additive to) the sheet-level safe area settings. Templates submitted to third-party printers (e.g. CandleBliss drop-ship) should always have safe area enabled.

### Advanced mode (JSON editor)

The Label Templates page exposes a raw JSON textarea for the `zones` field. This is intended for power users who want to hand-craft zone definitions or paste in LLM-generated zone JSON. The visual zone editor (upload-driven workflow) is the primary interface for most users.

---

## Stage 4: Print Jobs

**Page:** `/print-jobs`  
**DB table:** `print_jobs`  
**API:** `GET/POST /api/print-jobs`, `GET/PATCH/DELETE /api/print-jobs/:id`

A print job batches one or more products onto a specific label sheet.

### Items structure

The `items` JSONB column is an array of `{ productId, quantity }` objects:

```json
[
  { "productId": 12, "quantity": 4 },
  { "productId": 15, "quantity": 8 }
]
```

The total number of labels is the sum of all quantities. The label sheet's `labelsAcross × labelsDown` determines how many labels fit per sheet; the print job can span multiple sheets.

### Status lifecycle

```
draft → ready → printed
```

Jobs start as `draft`. The status is updated manually; there is no automated state machine.

### Print output

The print job page generates a visual sheet preview showing which product's label occupies each label slot. The download PDF feature is planned to render label content into each slot using the associated label template zones and product data pulled from the catalog.

---

## Data Flow Summary

```
User uploads PDF template
        │
        ▼
pdfAnalysis.ts extracts measurements (SSE-streamed)
        │
        ▼
label_sheets row created
        │
        ├──▶ User designs zones (label_templates row)
        │           │
        │           └──▶ Zones reference brand settings for colors/fonts
        │
        └──▶ User creates print job (print_jobs row)
                    │
                    ├── items: [{ productId, quantity }]
                    └── labelSheetId → sheet geometry for layout preview
```

The brand settings row (`design_system`) is an ambient global referenced by the frontend at render time — it is not stored as a foreign key on templates or jobs, but every rendering of a template applies the current brand identity.
