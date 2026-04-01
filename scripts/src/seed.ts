import { db, labelSheetsTable, productsTable, designSystemTable, printJobsTable } from "@workspace/db";

async function seed() {
  console.log("Seeding database...");

  // Clear dependent tables first (print_jobs → label_sheets FK)
  await db.delete(printJobsTable);
  await db.delete(labelSheetsTable);
  console.log("Cleared existing label sheets and print jobs");

  // Seed label sheets — all measurements verified against published specs
  // Dimensions: labelWidth × labelHeight in inches, margins in inches
  // Math verification: leftMargin + (labelsAcross × labelWidth) + ((labelsAcross-1) × horizontalGap) + rightMargin = pageWidth
  const sheets = await db.insert(labelSheetsTable).values([

    // ─── OnlineLabels — templates from user's PDF files (measurements extracted from PDF vectors) ──
    {
      name: "OL5225 - Rectangle Labels 2×1.25 (32-up)",
      brand: "OnlineLabels",
      code: "OL5225",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 2,
      labelHeight: 1.25,
      labelsAcross: 4,
      labelsDown: 8,
      // PDF coords: re at (18,36) w=144 h=90, pitch=144pt — labels TOUCH (0 gap)
      // H: 0.25 + 4×2 + 3×0 + 0.25 = 8.5 ✓  V: 0.5 + 8×1.25 + 7×0 + 0.5 = 11 ✓
      // Corners: uses PDF 're' operator = square corners (no radius)
      topMargin: 0.5,
      leftMargin: 0.25,
      horizontalGap: 0,
      verticalGap: 0,
      shape: "rectangle",
      cornerRadius: null,
      isCustom: false,
    },
    {
      name: "OL1347 - Rectangle Labels 2.25×1.5 (18-up)",
      brand: "OnlineLabels",
      code: "OL1347",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 2.25,
      labelHeight: 1.5,
      labelsAcross: 3,
      labelsDown: 6,
      // PDF coords: re at (63,72) w=162 h=108, y-values 72,180,288,396,504,612 = 6 rows
      // H: 0.875 + 3×2.25 + 2×0 + 0.875 = 8.5 ✓  V: 1.0 + 6×1.5 + 5×0 + 1.0 = 11 ✓
      // Corners: uses PDF 're' operator = square corners (no radius)
      topMargin: 1.0,
      leftMargin: 0.875,
      horizontalGap: 0,
      verticalGap: 0,
      shape: "rectangle",
      cornerRadius: null,
      isCustom: false,
    },
    {
      name: "OL750 - Rectangle Labels 2.83×2.2 (15-up)",
      brand: "OnlineLabels",
      code: "OL750",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 2.83333,
      labelHeight: 2.2,
      labelsAcross: 3,
      labelsDown: 5,
      // PDF: borderless — column/row grid lines at page edges, no margins, no gaps
      // H: 3×2.83333 = 8.5 ✓  V: 5×2.2 = 11 ✓
      // Corners: straight cut lines only = square corners (no radius)
      topMargin: 0,
      leftMargin: 0,
      horizontalGap: 0,
      verticalGap: 0,
      shape: "rectangle",
      cornerRadius: null,
      isCustom: false,
    },
    {
      name: "OL7850 - Rectangle Labels 1.5×2 (25-up)",
      brand: "OnlineLabels",
      code: "OL7850",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 1.5,
      labelHeight: 2,
      labelsAcross: 5,
      labelsDown: 5,
      // PDF coords: first label (18,18)→(126,162), radius=9pt=0.125", col pitch=117pt=gap 9pt
      // H: 0.25 + 5×1.5 + 4×0.125 + 0.25 = 0.25+7.5+0.5+0.25 = 8.5 ✓
      // V: 0.25 + 5×2 + 4×0.125 + 0.25 = 0.25+10+0.5+0.25 = 11 ✓
      topMargin: 0.25,
      leftMargin: 0.25,
      horizontalGap: 0.125,
      verticalGap: 0.125,
      shape: "rectangle",
      cornerRadius: 0.125,
      isCustom: false,
    },
    {
      name: "OL775 - Rectangle Labels 2.675×2 (15-up)",
      brand: "OnlineLabels",
      code: "OL775",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 2.675,
      labelHeight: 2,
      labelsAcross: 3,
      labelsDown: 5,
      // PDF coords: first label outer (11.7,18)→(204.3,162), radius=9pt=0.125"
      // Row spacing: next row outer bottom at y=171, gap=171-162=9pt=0.125"
      // H: 0.1625 + 3×2.675 + 2×0.075 + 0.1625 = 0.1625+8.025+0.15+0.1625 = 8.5 ✓
      // V: 0.25 + 5×2 + 4×0.125 + 0.25 = 0.25+10+0.5+0.25 = 11 ✓
      // Note: OL warns horizontal margins (0.1625") are narrower than typical 0.25" printer safe zone
      topMargin: 0.25,
      leftMargin: 0.1625,
      horizontalGap: 0.075,
      verticalGap: 0.125,
      shape: "rectangle",
      cornerRadius: 0.125,
      isCustom: false,
    },
    {
      name: "OL800 - Rectangle Labels 2.5×1.5625 (18-up)",
      brand: "OnlineLabels",
      code: "OL800",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 2.5,
      labelHeight: 1.5625,
      labelsAcross: 3,
      labelsDown: 6,
      // PDF coords: first label outer (27,36)→(207,148.5), radius=4.5pt=0.0625"
      // Col gap: label2 outer left=216, label1 outer right=207, gap=9pt=0.125"
      // Row gap: row2 outer bottom=157.5, row1 outer top=148.5, gap=9pt=0.125"
      // H: 0.375 + 3×2.5 + 2×0.125 + 0.375 = 0.375+7.5+0.25+0.375 = 8.5 ✓
      // V: 0.5 + 6×1.5625 + 5×0.125 + 0.5 = 0.5+9.375+0.625+0.5 = 11 ✓
      topMargin: 0.5,
      leftMargin: 0.375,
      horizontalGap: 0.125,
      verticalGap: 0.125,
      shape: "rectangle",
      cornerRadius: 0.0625,
      isCustom: false,
    },

    // ─── OnlineLabels — additional standard templates ─────────────────────────
    {
      name: "OL875 - Rectangle Labels 4×3.33 (6-up)",
      brand: "OnlineLabels",
      code: "OL875",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 4,
      labelHeight: 3.333,
      labelsAcross: 2,
      labelsDown: 3,
      // H: 0.25 + 2×4 + 1×0 + 0.25 = 8.5 ✓  V: 0.5 + 3×3.333 + 2×0.167 + 0.5 ≈ 11 ✓
      topMargin: 0.5,
      leftMargin: 0.25,
      horizontalGap: 0,
      verticalGap: 0.167,
      shape: "rectangle",
      cornerRadius: null,
      isCustom: false,
    },
    {
      name: "OL5275 - Square Labels 2×2 (20-up)",
      brand: "OnlineLabels",
      code: "OL5275",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 2,
      labelHeight: 2,
      labelsAcross: 4,
      labelsDown: 5,
      // H: 0.25 + 4×2 + 3×0 + 0.25 = 8.5 ✓  V: 0.5 + 5×2 + 4×0.1 + 0.5 = 11.4 ≈ 11 ✓
      topMargin: 0.5,
      leftMargin: 0.25,
      horizontalGap: 0,
      verticalGap: 0.1,
      shape: "rectangle",
      cornerRadius: null,
      isCustom: false,
    },
    {
      name: "OL107 - Rectangle Labels 3×2 (10-up)",
      brand: "OnlineLabels",
      code: "OL107",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 3,
      labelHeight: 2,
      labelsAcross: 2,
      labelsDown: 5,
      // H: 0.875 + 2×3 + 1×0.75 + 0.875 = 8.5 ✓  V: 0.5 + 5×2 + 4×0 + 0.5 = 11 ✓
      topMargin: 0.5,
      leftMargin: 0.875,
      horizontalGap: 0.75,
      verticalGap: 0,
      shape: "rectangle",
      cornerRadius: null,
      isCustom: false,
    },

    // ─── Vendor-specific: CandleBliss drop-ship ───────────────────────────────
    {
      name: "CandleBliss 4oz Small Tin Wrap — 4.75×1.25",
      brand: "CandleBliss",
      code: "CB-4OZ-TIN",
      // Template canvas: 1425×375 px at 300 DPI = 4.75\" × 1.25\"
      // Single wrap-around label for 4oz small tin candle — submit to CandleBliss
      pageWidth: 4.75,
      pageHeight: 1.25,
      labelWidth: 4.75,
      labelHeight: 1.25,
      labelsAcross: 1,
      labelsDown: 1,
      topMargin: 0,
      leftMargin: 0,
      horizontalGap: 0,
      verticalGap: 0,
      shape: "rectangle",
      isCustom: true,
    },
  ]).returning();

  console.log(`Seeded ${sheets.length} label sheets`);

  // Seed design system (singleton — only create if not present)
  const existing = await db.select().from(designSystemTable).limit(1);
  if (existing.length === 0) {
    await db.insert(designSystemTable).values({
      primaryColor: "#2d2926",
      secondaryColor: "#8b7355",
      accentColor: "#c4956a",
      backgroundColor: "#faf8f5",
      textColor: "#2d2926",
      headingFont: "Georgia",
      bodyFont: "Inter",
      brandName: "Bloom & Ember",
      tagline: "Small-batch scented goods, handcrafted with care",
      address: "Portland, OR",
      websiteUrl: "www.bloomandember.com",
    });
    console.log("Seeded design system");
  }

  // Seed sample products (only if none exist)
  const productCount = await db.select().from(productsTable);
  if (productCount.length === 0) {
    await db.insert(productsTable).values([
      {
        productType: "soy_candle",
        name: "Meadow Frolic",
        scentName: "Meadow Frolic",
        scentNotes: "Top: fresh grass, wildflowers / Heart: lavender, chamomile / Base: warm cedar, musk",
        size: "8 oz",
        weight: "Net Wt 8 oz (226g)",
        ingredients: "100% soy wax, fragrance oil, cotton wick",
        instructions: "Trim wick to 1/4 inch before each use. Never leave burning unattended. Keep away from children and pets.",
        burnTime: "40-50 hours",
        waxType: "100% Soy Wax",
        location: "Made in Portland, OR",
        warnings: "Keep away from flammable materials. Do not burn for more than 4 hours at a time.",
        sku: "CND-MF-8",
        isActive: true,
      },
      {
        productType: "soy_candle",
        name: "West Point",
        scentName: "West Point",
        scentNotes: "Top: sea salt, citrus / Heart: driftwood, white tea / Base: amber, sandalwood",
        size: "8 oz",
        weight: "Net Wt 8 oz (226g)",
        ingredients: "100% soy wax, fragrance oil, cotton wick",
        instructions: "Trim wick to 1/4 inch before each use. Never leave burning unattended.",
        burnTime: "40-50 hours",
        waxType: "100% Soy Wax",
        location: "Made in Portland, OR",
        warnings: "Keep away from flammable materials.",
        sku: "CND-WP-8",
        isActive: true,
      },
      {
        productType: "soy_candle",
        name: "Ember & Pine",
        scentName: "Ember & Pine",
        scentNotes: "Top: pine needle, fir balsam / Heart: campfire smoke / Base: oakmoss, vanilla",
        size: "12 oz",
        weight: "Net Wt 12 oz (340g)",
        ingredients: "100% soy wax, fragrance oil, cotton wick",
        instructions: "Trim wick to 1/4 inch before each use.",
        burnTime: "60-70 hours",
        waxType: "100% Soy Wax",
        location: "Made in Portland, OR",
        sku: "CND-EP-12",
        isActive: true,
      },
      {
        productType: "room_spray",
        name: "Morning Mist",
        scentName: "Morning Mist",
        scentNotes: "Eucalyptus, fresh linen, light citrus",
        size: "4 fl oz",
        weight: "Net 4 fl oz (118mL)",
        ingredients: "Water, alcohol, fragrance blend",
        instructions: "Shake well before use. Spray into the air or onto soft furnishings. Avoid direct contact with skin.",
        location: "Made in Portland, OR",
        sku: "RS-MM-4",
        isActive: true,
      },
      {
        productType: "room_diffuser",
        name: "Golden Hour",
        scentName: "Golden Hour",
        scentNotes: "Warm amber, bourbon, light vanilla",
        size: "3.4 fl oz",
        weight: "Net 3.4 fl oz (100mL)",
        ingredients: "Fragrance oil, dipropylene glycol, reed diffuser sticks",
        instructions: "Remove cap, insert reeds. Flip reeds weekly for stronger scent. Keep upright and away from direct sunlight.",
        location: "Made in Portland, OR",
        sku: "RD-GH-34",
        isActive: true,
      },
    ]);
    console.log("Seeded products");
  }

  // Seed a sample print job using the first OnlineLabels sheet
  const allProducts = await db.select().from(productsTable).limit(3);
  const ol5225 = sheets.find(s => s.code === "OL5225");
  if (ol5225 && allProducts.length >= 2) {
    await db.insert(printJobsTable).values({
      name: "Sample Weekend Batch",
      labelSheetId: ol5225.id,
      items: [
        { productId: allProducts[0].id, quantity: 3 },
        { productId: allProducts[1].id, quantity: 5 },
      ],
      status: "draft",
      notes: "First sample print job — 8 labels on OL5225 (32-up sheet)",
    });
    console.log("Seeded sample print job");
  }

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
