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
