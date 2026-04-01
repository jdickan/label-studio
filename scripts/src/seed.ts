import { db, labelSheetsTable, productsTable, designSystemTable, printJobsTable } from "@workspace/db";

async function seed() {
  console.log("Seeding database...");

  // Seed label sheets (common Avery codes)
  const sheets = await db.insert(labelSheetsTable).values([
    {
      name: "Avery 5160 - Address Labels",
      brand: "Avery",
      code: "5160",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 2.625,
      labelHeight: 1,
      labelsAcross: 3,
      labelsDown: 10,
      topMargin: 0.5,
      leftMargin: 0.1875,
      horizontalGap: 0.125,
      verticalGap: 0,
      shape: "rectangle",
      isCustom: false,
    },
    {
      name: "Avery 5163 - Shipping Labels",
      brand: "Avery",
      code: "5163",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 4,
      labelHeight: 2,
      labelsAcross: 2,
      labelsDown: 5,
      topMargin: 0.5,
      leftMargin: 0.15625,
      horizontalGap: 0.1875,
      verticalGap: 0,
      shape: "rectangle",
      isCustom: false,
    },
    {
      name: "Avery 22807 - Round Labels 1.5in",
      brand: "Avery",
      code: "22807",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 1.5,
      labelHeight: 1.5,
      labelsAcross: 4,
      labelsDown: 7,
      topMargin: 0.625,
      leftMargin: 0.625,
      horizontalGap: 0.25,
      verticalGap: 0.25,
      shape: "circle",
      isCustom: false,
    },
    {
      name: "Avery 5264 - Shipping Labels 3.5x5",
      brand: "Avery",
      code: "5264",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 3.5,
      labelHeight: 5,
      labelsAcross: 2,
      labelsDown: 2,
      topMargin: 0.5,
      leftMargin: 0.28125,
      horizontalGap: 0.375,
      verticalGap: 0.625,
      shape: "rectangle",
      isCustom: false,
    },
    {
      name: "OnlineLabels OL875 - 4x3.33 Candle Labels",
      brand: "OnlineLabels",
      code: "OL875",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 4,
      labelHeight: 3.333,
      labelsAcross: 2,
      labelsDown: 3,
      topMargin: 0.5,
      leftMargin: 0.25,
      horizontalGap: 0,
      verticalGap: 0.5,
      shape: "rectangle",
      isCustom: false,
    },
    {
      name: "OnlineLabels OL5275 - 2x2 Square Labels",
      brand: "OnlineLabels",
      code: "OL5275",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 2,
      labelHeight: 2,
      labelsAcross: 4,
      labelsDown: 5,
      topMargin: 0.5,
      leftMargin: 0.25,
      horizontalGap: 0.125,
      verticalGap: 0.125,
      shape: "rectangle",
      isCustom: false,
    },
    {
      name: "Avery 6796 - Round Labels 2in",
      brand: "Avery",
      code: "6796",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 2,
      labelHeight: 2,
      labelsAcross: 4,
      labelsDown: 5,
      topMargin: 0.5,
      leftMargin: 0.25,
      horizontalGap: 0.1875,
      verticalGap: 0.125,
      shape: "circle",
      isCustom: false,
    },
    {
      name: "OnlineLabels OL107 - 3x2 Rectangle",
      brand: "OnlineLabels",
      code: "OL107",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 3,
      labelHeight: 2,
      labelsAcross: 2,
      labelsDown: 5,
      topMargin: 0.5,
      leftMargin: 0.875,
      horizontalGap: 0.75,
      verticalGap: 0,
      shape: "rectangle",
      isCustom: false,
    },
  ]).returning().onConflictDoNothing();

  console.log(`Seeded ${sheets.length} label sheets`);

  // Seed design system
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

  // Seed sample products
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

  // Seed a sample print job if sheets and products exist
  const allSheets = await db.select().from(labelSheetsTable).limit(1);
  const allProducts = await db.select().from(productsTable).limit(3);
  const existingJobs = await db.select().from(printJobsTable);
  
  if (existingJobs.length === 0 && allSheets.length > 0 && allProducts.length >= 2) {
    await db.insert(printJobsTable).values({
      name: "Sample Weekend Batch",
      labelSheetId: allSheets[0].id,
      items: [
        { productId: allProducts[0].id, quantity: 3 },
        { productId: allProducts[1].id, quantity: 5 },
      ],
      status: "draft",
      notes: "First sample print job",
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
