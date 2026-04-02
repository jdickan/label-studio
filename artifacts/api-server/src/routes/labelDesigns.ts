import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, labelDesignsTable } from "@workspace/db";
import {
  CreateLabelDesignBody,
  UpdateLabelDesignBody,
  GetLabelDesignParams,
  UpdateLabelDesignParams,
  DeleteLabelDesignParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const designs = await db.select().from(labelDesignsTable).orderBy(labelDesignsTable.updatedAt);
    res.json(designs);
  } catch (err) {
    req.log.error({ err }, "Failed to get label designs");
    res.status(500).json({ error: "Failed to get label designs" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = CreateLabelDesignBody.parse(req.body);
    const [design] = await db.insert(labelDesignsTable).values({
      ...body,
      objects: body.objects ?? [],
    }).returning();
    res.status(201).json(design);
  } catch (err) {
    req.log.error({ err }, "Failed to create label design");
    res.status(400).json({ error: "Failed to create label design" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = GetLabelDesignParams.parse({ id: parseInt(req.params.id) });
    const [design] = await db.select().from(labelDesignsTable).where(eq(labelDesignsTable.id, id));
    if (!design) return res.status(404).json({ error: "Label design not found" });
    res.json(design);
  } catch (err) {
    req.log.error({ err }, "Failed to get label design");
    res.status(500).json({ error: "Failed to get label design" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { id } = UpdateLabelDesignParams.parse({ id: parseInt(req.params.id) });
    const body = UpdateLabelDesignBody.parse(req.body);
    const [design] = await db.update(labelDesignsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(labelDesignsTable.id, id))
      .returning();
    if (!design) return res.status(404).json({ error: "Label design not found" });
    res.json(design);
  } catch (err) {
    req.log.error({ err }, "Failed to update label design");
    res.status(400).json({ error: "Failed to update label design" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = DeleteLabelDesignParams.parse({ id: parseInt(req.params.id) });
    await db.delete(labelDesignsTable).where(eq(labelDesignsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete label design");
    res.status(500).json({ error: "Failed to delete label design" });
  }
});

export default router;
