import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, labelTemplatesTable } from "@workspace/db";
import {
  CreateLabelTemplateBody,
  UpdateLabelTemplateBody,
  GetLabelTemplateParams,
  UpdateLabelTemplateParams,
  DeleteLabelTemplateParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const templates = await db.select().from(labelTemplatesTable).orderBy(labelTemplatesTable.name);
    res.json(templates);
  } catch (err) {
    req.log.error({ err }, "Failed to get label templates");
    res.status(500).json({ error: "Failed to get label templates" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = CreateLabelTemplateBody.parse(req.body);
    const [template] = await db.insert(labelTemplatesTable).values(body).returning();
    res.status(201).json(template);
  } catch (err) {
    req.log.error({ err }, "Failed to create label template");
    res.status(400).json({ error: "Failed to create label template" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = GetLabelTemplateParams.parse({ id: parseInt(req.params.id) });
    const [template] = await db.select().from(labelTemplatesTable).where(eq(labelTemplatesTable.id, id));
    if (!template) return res.status(404).json({ error: "Label template not found" });
    res.json(template);
  } catch (err) {
    req.log.error({ err }, "Failed to get label template");
    res.status(500).json({ error: "Failed to get label template" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { id } = UpdateLabelTemplateParams.parse({ id: parseInt(req.params.id) });
    const body = UpdateLabelTemplateBody.parse(req.body);
    const [template] = await db.update(labelTemplatesTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(labelTemplatesTable.id, id))
      .returning();
    if (!template) return res.status(404).json({ error: "Label template not found" });
    res.json(template);
  } catch (err) {
    req.log.error({ err }, "Failed to update label template");
    res.status(400).json({ error: "Failed to update label template" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = DeleteLabelTemplateParams.parse({ id: parseInt(req.params.id) });
    await db.delete(labelTemplatesTable).where(eq(labelTemplatesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete label template");
    res.status(500).json({ error: "Failed to delete label template" });
  }
});

export default router;
