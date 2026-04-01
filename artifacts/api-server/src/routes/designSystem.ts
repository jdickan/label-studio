import { Router, type IRouter } from "express";
import { db, designSystemTable } from "@workspace/db";
import { UpdateDesignSystemBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const rows = await db.select().from(designSystemTable).limit(1);
    if (rows.length === 0) {
      // Seed with defaults
      const [ds] = await db.insert(designSystemTable).values({}).returning();
      return res.json(ds);
    }
    res.json(rows[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to get design system");
    res.status(500).json({ error: "Failed to get design system" });
  }
});

router.patch("/", async (req, res) => {
  try {
    const body = UpdateDesignSystemBody.parse(req.body);
    const rows = await db.select().from(designSystemTable).limit(1);
    let ds;
    if (rows.length === 0) {
      [ds] = await db.insert(designSystemTable).values({ ...body }).returning();
    } else {
      [ds] = await db.update(designSystemTable)
        .set({ ...body, updatedAt: new Date() })
        .returning();
    }
    res.json(ds);
  } catch (err) {
    req.log.error({ err }, "Failed to update design system");
    res.status(400).json({ error: "Failed to update design system" });
  }
});

export default router;
