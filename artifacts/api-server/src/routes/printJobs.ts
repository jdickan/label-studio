import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, printJobsTable, labelSheetsTable, productsTable } from "@workspace/db";
import {
  CreatePrintJobBody,
  UpdatePrintJobBody,
  GetPrintJobParams,
  UpdatePrintJobParams,
  DeletePrintJobParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

type PrintJobItemInput = { productId: number; quantity: number };

async function buildPrintJobResponse(job: typeof printJobsTable.$inferSelect) {
  const sheet = await db.select().from(labelSheetsTable).where(eq(labelSheetsTable.id, job.labelSheetId)).then(r => r[0]);
  const rawItems = (job.items as PrintJobItemInput[]) || [];
  
  const enrichedItems = await Promise.all(rawItems.map(async (item) => {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, item.productId));
    return {
      productId: item.productId,
      quantity: item.quantity,
      productName: product?.name || "Unknown",
      productScentName: product?.scentName || "",
      productType: product?.productType || "",
      productSize: product?.size || "",
    };
  }));

  const totalLabels = enrichedItems.reduce((sum, i) => sum + i.quantity, 0);
  const labelsPerSheet = sheet ? sheet.labelsAcross * sheet.labelsDown : 1;
  const totalSheets = Math.ceil(totalLabels / labelsPerSheet);

  return {
    id: job.id,
    name: job.name,
    labelSheetId: job.labelSheetId,
    labelSheetName: sheet?.name || "",
    labelSheetCode: sheet?.code || "",
    labelsPerSheet,
    items: enrichedItems,
    totalLabels,
    totalSheets,
    status: job.status,
    notes: job.notes,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const jobs = await db.select().from(printJobsTable).orderBy(printJobsTable.createdAt);
    const results = await Promise.all(jobs.map(buildPrintJobResponse));
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Failed to get print jobs");
    res.status(500).json({ error: "Failed to get print jobs" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = CreatePrintJobBody.parse(req.body);
    const [job] = await db.insert(printJobsTable).values({
      name: body.name,
      labelSheetId: body.labelSheetId,
      items: body.items,
      notes: body.notes,
      status: "draft",
    }).returning();
    const result = await buildPrintJobResponse(job);
    res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to create print job");
    res.status(400).json({ error: "Failed to create print job" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = GetPrintJobParams.parse({ id: parseInt(req.params.id) });
    const [job] = await db.select().from(printJobsTable).where(eq(printJobsTable.id, id));
    if (!job) return res.status(404).json({ error: "Print job not found" });
    const result = await buildPrintJobResponse(job);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get print job");
    res.status(500).json({ error: "Failed to get print job" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { id } = UpdatePrintJobParams.parse({ id: parseInt(req.params.id) });
    const body = UpdatePrintJobBody.parse(req.body);
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.labelSheetId !== undefined) updateData.labelSheetId = body.labelSheetId;
    if (body.items !== undefined) updateData.items = body.items;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.status !== undefined) updateData.status = body.status;
    const [job] = await db.update(printJobsTable)
      .set(updateData)
      .where(eq(printJobsTable.id, id))
      .returning();
    if (!job) return res.status(404).json({ error: "Print job not found" });
    const result = await buildPrintJobResponse(job);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to update print job");
    res.status(400).json({ error: "Failed to update print job" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = DeletePrintJobParams.parse({ id: parseInt(req.params.id) });
    await db.delete(printJobsTable).where(eq(printJobsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete print job");
    res.status(500).json({ error: "Failed to delete print job" });
  }
});

export default router;
