import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, labelSheetsTable } from "@workspace/db";
import {
  CreateLabelSheetBody,
  UpdateLabelSheetBody,
  GetLabelSheetParams,
  UpdateLabelSheetParams,
  DeleteLabelSheetParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ─── PDF template generator ───────────────────────────────────────────────────

type SheetForPdf = typeof labelSheetsTable.$inferSelect;

function generateTemplatePdf(sheet: SheetForPdf): Buffer {
  const W  = sheet.pageWidth   * 72;
  const H  = sheet.pageHeight  * 72;
  const lw = sheet.labelWidth  * 72;
  const lh = sheet.labelHeight * 72;
  const lm = sheet.leftMargin  * 72;
  const tm = sheet.topMargin   * 72;
  const hg = sheet.horizontalGap * 72;
  const vg = sheet.verticalGap   * 72;
  const cr = (sheet.cornerRadius ?? 0) * 72;
  const k  = 0.5523; // Bezier approximation of 90° arc

  const f = (n: number) => n.toFixed(3);

  // Build a single label's path (rounded or plain rectangle)
  function labelPath(x: number, y: number): string {
    if (cr < 0.5) {
      return `${f(x)} ${f(y)} ${f(lw)} ${f(lh)} re`;
    }
    const r  = cr;
    const kk = r * k;
    return [
      `${f(x + r)} ${f(y)} m`,
      `${f(x + lw - r)} ${f(y)} l`,
      `${f(x + lw - kk)} ${f(y)} ${f(x + lw)} ${f(y + kk)} ${f(x + lw)} ${f(y + r)} c`,
      `${f(x + lw)} ${f(y + lh - r)} l`,
      `${f(x + lw)} ${f(y + lh - kk)} ${f(x + lw - kk)} ${f(y + lh)} ${f(x + lw - r)} ${f(y + lh)} c`,
      `${f(x + r)} ${f(y + lh)} l`,
      `${f(x + kk)} ${f(y + lh)} ${f(x)} ${f(y + lh - kk)} ${f(x)} ${f(y + lh - r)} c`,
      `${f(x)} ${f(y + r)} l`,
      `${f(x)} ${f(y + kk)} ${f(x + kk)} ${f(y)} ${f(x + r)} ${f(y)} c`,
      `h`,
    ].join("\n");
  }

  // Collect all label paths (PDF y-axis increases upward)
  const paths: string[] = [];
  for (let row = 0; row < sheet.labelsDown; row++) {
    for (let col = 0; col < sheet.labelsAcross; col++) {
      const x = lm + col * (lw + hg);
      const yFromTop = tm + row * (lh + vg);
      const y = H - yFromTop - lh;
      paths.push(labelPath(x, y));
    }
  }
  const allPaths = paths.join("\n");

  // Content stream:
  //   OC1 (Label Borders) — black thin stroke, prints and displays
  //   OC2 (Guides)        — cyan stroke, displays only (non-printing via OCG AS)
  const contentLines = [
    "/OC /OC1 BDC",
    "0 0 0 RG",          // black stroke
    "0.72 w",            // ~1pt line width
    allPaths,
    "S",
    "EMC",
    "",
    "/OC /OC2 BDC",
    "0 0.502 1 RG",      // Illustrator guide blue (R=0 G=128 B=255)
    "0.5 w",             // thinner line
    allPaths,
    "S",
    "EMC",
  ];
  const content = contentLines.join("\n");

  // PDF object assembly with xref byte-offset tracking
  type PdfObj = { id: number; body: string };
  const objs: PdfObj[] = [];

  // 1 Catalog
  objs.push({ id: 1, body: "<</Type /Catalog /Pages 2 0 R /OCProperties 6 0 R>>" });
  // 2 Pages
  objs.push({ id: 2, body: "<</Type /Pages /Kids [3 0 R] /Count 1>>" });
  // 3 Page
  objs.push({
    id: 3,
    body: `<</Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W)} ${f(H)}] /Contents 4 0 R /Resources 5 0 R>>`,
  });
  // 4 Content stream
  objs.push({
    id: 4,
    body: `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
  });
  // 5 Resources (OCG property references for OC marks in stream)
  objs.push({ id: 5, body: "<</Properties <</OC1 7 0 R /OC2 8 0 R>>>>" });
  // 6 OCProperties — sets Guides (OC2) OFF for print events
  objs.push({
    id: 6,
    body: [
      "<<",
      "  /OCGs [7 0 R 8 0 R]",
      "  /D <<",
      "    /Name (Template Layers)",
      "    /Order [7 0 R 8 0 R]",
      "    /ON [7 0 R 8 0 R]",
      "    /AS [<</Event /Print /Category [/Print] /OCGs [8 0 R] /State /OFF>>]",
      "  >>",
      ">>",
    ].join("\n"),
  });
  // 7 OCG: Label Borders (printable)
  objs.push({ id: 7, body: "<</Type /OCG /Name (Label Borders) /Intent [/View /Design /Print]>>" });
  // 8 OCG: Guides (non-printing — excluded by AS above when printing)
  objs.push({ id: 8, body: "<</Type /OCG /Name (Guides) /Intent [/View /Design]>>" });

  // Serialize with accurate xref offsets
  let pdf = "%PDF-1.6\n%\xc2\xa9\n"; // binary comment signals binary content
  const offsets: number[] = [];

  for (const obj of objs) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
  }

  const xrefPos = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objs.length + 1}\n`;
  pdf += `0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<</Size ${objs.length + 1} /Root 1 0 R>>\n`;
  pdf += `startxref\n${xrefPos}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

router.get("/", async (req, res) => {
  try {
    const sheets = await db.select().from(labelSheetsTable).orderBy(labelSheetsTable.brand, labelSheetsTable.code);
    res.json(sheets);
  } catch (err) {
    req.log.error({ err }, "Failed to get label sheets");
    res.status(500).json({ error: "Failed to get label sheets" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = CreateLabelSheetBody.parse(req.body);
    const [sheet] = await db.insert(labelSheetsTable).values({ ...body, isCustom: true }).returning();
    res.status(201).json(sheet);
  } catch (err) {
    req.log.error({ err }, "Failed to create label sheet");
    res.status(400).json({ error: "Failed to create label sheet" });
  }
});

router.get("/:id/pdf", async (req, res) => {
  try {
    const { id } = GetLabelSheetParams.parse({ id: parseInt(req.params.id) });
    const [sheet] = await db.select().from(labelSheetsTable).where(eq(labelSheetsTable.id, id));
    if (!sheet) { res.status(404).json({ error: "Label sheet not found" }); return; }
    const pdfBuf = generateTemplatePdf(sheet);
    const filename = `${sheet.code.replace(/[^a-zA-Z0-9-]/g, "_")}-template.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuf.length);
    res.send(pdfBuf);
  } catch (err) {
    req.log.error({ err }, "Failed to generate PDF");
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = GetLabelSheetParams.parse({ id: parseInt(req.params.id) });
    const [sheet] = await db.select().from(labelSheetsTable).where(eq(labelSheetsTable.id, id));
    if (!sheet) return res.status(404).json({ error: "Label sheet not found" });
    res.json(sheet);
  } catch (err) {
    req.log.error({ err }, "Failed to get label sheet");
    res.status(500).json({ error: "Failed to get label sheet" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { id } = UpdateLabelSheetParams.parse({ id: parseInt(req.params.id) });
    const body = UpdateLabelSheetBody.parse(req.body);
    const [sheet] = await db.update(labelSheetsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(labelSheetsTable.id, id))
      .returning();
    if (!sheet) return res.status(404).json({ error: "Label sheet not found" });
    res.json(sheet);
  } catch (err) {
    req.log.error({ err }, "Failed to update label sheet");
    res.status(400).json({ error: "Failed to update label sheet" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = DeleteLabelSheetParams.parse({ id: parseInt(req.params.id) });
    await db.delete(labelSheetsTable).where(eq(labelSheetsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete label sheet");
    res.status(500).json({ error: "Failed to delete label sheet" });
  }
});

export default router;
