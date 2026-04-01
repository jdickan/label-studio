# Label Sheet Measurement Protocol

## Why This Exists

Web-scraped or manually-entered label sheet measurements are frequently wrong.
During initial setup, measurements sourced from the OnlineLabels website differed
from the actual PDF template files in several critical ways:

| Template | Issue Found |
|----------|-------------|
| OL5225 | leftMargin was 0.0625" (wrong), actually 0.25"; labels touch (0 gap, not 0.125") |
| OL1347 | Listed as 21-up / 7 rows — actually 18-up / 6 rows; topMargin was 0.25" not 1.0" |
| OL750 | Had cornerRadius 0.1" assigned — actually square corners |
| OL775 | topMargin was 0.5" (wrong), actually 0.25"; vGap was 0, actually 0.125" |
| OL800 | leftMargin was 0.25" (wrong), actually 0.375"; hGap was 0.25", actually 0.125" |

**Rule:** The PDF file is the authoritative source of truth. Always extract measurements
from the PDF's vector drawing commands, not from web pages or catalog descriptions.

## How PDF Templates Work

OnlineLabels and similar vendors provide blank PDF template files whose vector paths
define exactly where each label die-cut falls on the sheet. These paths contain the
precise physical coordinates of every label, which we can extract mathematically.

### Two Types of PDF Template

**Type 1 — Rectangle paths (`re` operator)**
Used by square-corner templates. The PDF draws each label as a simple rectangle
using the PDF `re` (rectangle) command: `x y w h re`

- (x, y) is the **bottom-left** corner in PDF point coordinates
- w and h are width and height in points (1 pt = 1/72 inch)
- These always have **square corners** (cornerRadius = null)

**Type 2 — Bezier rounded-rectangle paths**
Used by rounded-corner templates. Each label is drawn as 4 straight edges
connected by quarter-circle Bezier arcs at the corners.

- The corner radius `r` is visible in the arc control points
- Often uses a coordinate transform `1 0 0 -1 0 H cm` that flips the y-axis

## Extracting Measurements

### Page Dimensions
Look for `/MediaBox [0 0 W H]` in the PDF binary.
Convert: width_inches = W/72, height_inches = H/72.

### Decompression
PDF content streams are zlib-compressed. Use `zlib.inflateSync()` in Node.js
to decode each FlateDecode stream.

### Label Geometry
After decompression, parse the drawing commands:
- Count unique X positions → labelsAcross
- Count unique Y positions → labelsDown
- First label's width and height → labelWidth, labelHeight
- Minimum X position → leftMargin (in pts, divide by 72 for inches)
- Minimum Y position (after coordinate transform) → topMargin

### Coordinate System

For `re` (Type 1) PDFs — y increases upward from page bottom:
```
topMargin = (pageHeightPts - (highestLabel_Y + labelHeightPts)) / 72
```

For Bezier (Type 2) PDFs with y-flip transform — y increases downward:
```
topMargin = lowestLabel_Y_in_path_coords / 72
```

### Gap Calculation
```
horizontalGap = (secondColumn_X - firstColumn_X - labelWidthPts) / 72
verticalGap   = (secondRow_Y    - firstRow_Y    - labelHeightPts) / 72
```
A gap of 0 means labels share a border line (touching, no space between).

### Corner Radius
For Type 1 (`re`): always null (square corners).
For Type 2 (Bezier): `r = (first_m_point_x) - outer_left_x` in points, divide by 72.

## Validation

Before storing any measurements, verify the H and V math:

```
H: leftMargin + (labelsAcross × labelWidth) + ((labelsAcross-1) × hGap) + leftMargin = pageWidth
V: topMargin  + (labelsDown   × labelHeight) + ((labelsDown-1)   × vGap) + topMargin  = pageHeight
```

Tolerance: ±0.02" for floating-point rounding. If checks fail by more than 0.02",
review the extraction manually.

## The Upload Template Feature

The app includes an "Upload Template PDF" button on the Label Sheets page.
Uploading one or more PDF files triggers:

1. The PDF is sent to the API server
2. A 12-step analysis runs:
   - PDF format validation
   - Page dimension extraction
   - Stream decompression
   - Drawing command parsing
   - Label geometry extraction
   - Grid layout computation
   - Margin measurement
   - Gap measurement
   - Corner radius detection
   - H/V math validation
   - Template code identification
   - Import record preparation
3. Results stream back in real-time via Server-Sent Events
4. A checklist modal shows each step completing with details
5. After all files complete, the user reviews extracted measurements
6. User can edit any values before importing to the database

## Verified Measurements Reference

All 6 OL PDF templates verified from vector coordinates on 2026-04-01:

```
OL5225  2.0"×1.25"   4×8=32   LM=0.25"  TM=0.5"   HG=0"     VG=0"     CR=null
OL1347  2.25"×1.5"   3×6=18   LM=0.875" TM=1.0"   HG=0"     VG=0"     CR=null
OL750   2.833"×2.2"  3×5=15   LM=0"     TM=0"     HG=0"     VG=0"     CR=null (borderless)
OL7850  1.5"×2.0"    5×5=25   LM=0.25"  TM=0.25"  HG=0.125" VG=0.125" CR=0.125"
OL775   2.675"×2.0"  3×5=15   LM=0.1625" TM=0.25" HG=0.075" VG=0.125" CR=0.125"
OL800   2.5"×1.5625" 3×6=18   LM=0.375" TM=0.5"   HG=0.125" VG=0.125" CR=0.0625"
```

## Adding New Templates

1. Obtain the vendor's blank PDF template file
2. Use the "Upload Template PDF" button on the Label Sheets page
3. Review the auto-extracted measurements in the checklist modal
4. Verify the H and V math passes (green checkmark on step 10)
5. Edit the template name and code if needed
6. Click "Import" to save to the database

If auto-extraction fails (image-only PDF, non-standard format), fall back to
manual entry using the "Add Custom Sheet" form, noting measurements should be
verified against the physical label package specifications.
