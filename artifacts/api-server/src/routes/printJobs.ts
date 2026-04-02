import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, printJobsTable, labelSheetsTable, productsTable, labelTemplatesTable } from "@workspace/db";
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
  const blankSlotsArr = (job.blankSlots as number[]) || [];
  const validBlanks = blankSlotsArr.filter((s: number) => s >= 0 && s < labelsPerSheet).length;
  const usablePerSheet = labelsPerSheet - validBlanks;
  const totalSheets = usablePerSheet > 0 ? Math.ceil(totalLabels / usablePerSheet) : 0;

  let templateZones: unknown[] | null = null;
  let templateBgColor: string | null = null;
  if (job.labelTemplateId) {
    const [template] = await db.select().from(labelTemplatesTable).where(eq(labelTemplatesTable.id, job.labelTemplateId));
    if (template) {
      templateZones = Array.isArray(template.zones) ? template.zones : [];
      templateBgColor = template.labelBgColor || null;
    }
  }

  return {
    id: job.id,
    name: job.name,
    labelSheetId: job.labelSheetId,
    labelSheetName: sheet?.name || "",
    labelSheetBrand: sheet?.brand || "",
    labelSheetCode: sheet?.code || "",
    labelsPerSheet,
    items: enrichedItems,
    totalLabels,
    totalSheets,
    status: job.status,
    jobType: (job.jobType as "standard" | "reprint") || "standard",
    blankSlots: (job.blankSlots as number[]) || [],
    notes: job.notes,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    labelTemplateId: job.labelTemplateId ?? null,
    templateZones,
    templateBgColor,
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
    const labelTemplateId = typeof req.body.labelTemplateId === "number" ? req.body.labelTemplateId : null;
    const [job] = await db.insert(printJobsTable).values({
      name: body.name,
      labelSheetId: body.labelSheetId,
      labelTemplateId,
      items: body.items,
      jobType: body.jobType ?? "standard",
      blankSlots: body.blankSlots ?? [],
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
    if (body.jobType !== undefined) updateData.jobType = body.jobType;
    if (body.blankSlots !== undefined) updateData.blankSlots = body.blankSlots;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.status !== undefined) updateData.status = body.status;
    if ("labelTemplateId" in req.body) {
      updateData.labelTemplateId = typeof req.body.labelTemplateId === "number" ? req.body.labelTemplateId : null;
    }
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
