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

// ── Cascade layout from parent to all descendants ─────────────────────────────
// Only propagates layout properties from parent zones to child zones that are
// still marked `inheritedFromParent: true`. Overridden zones are left untouched.
// New zones added to the parent are added to children as inherited.
// Zones removed from the parent that were inherited are removed from children.

type ZoneShape = Record<string, unknown>;

const LAYOUT_KEYS = ["x", "y", "w", "h", "color", "fontSize", "textAlign", "lineHeight", "rotation", "textAlignY", "textColor", "role"];

function cascadeZonesToChild(parentZones: ZoneShape[], childZones: ZoneShape[]): ZoneShape[] {
  const result: ZoneShape[] = [];

  for (const pz of parentZones) {
    const cz = childZones.find((z) => z.role === pz.role);
    if (!cz) {
      // New zone in parent — add as inherited with empty text
      result.push({ ...pz, id: crypto.randomUUID(), text: "", imageUrl: undefined, inheritedFromParent: true });
    } else if (cz.inheritedFromParent === false) {
      // Child has explicitly overridden this zone — keep unchanged
      result.push(cz);
    } else {
      // Inherited zone — update layout from parent, preserve child-specific content
      const merged: ZoneShape = {};
      for (const k of LAYOUT_KEYS) if (k in pz) merged[k] = pz[k];
      merged.id = cz.id;
      merged.text = (cz.text as string) ?? "";
      merged.imageUrl = cz.imageUrl;
      merged.maxChars = cz.maxChars;
      merged.inheritedFromParent = true;
      result.push(merged);
    }
  }

  // Keep child-specific zones that are NOT inherited from parent
  for (const cz of childZones) {
    const inParent = parentZones.some((z) => z.role === cz.role);
    if (!inParent && cz.inheritedFromParent !== true) {
      result.push(cz);
    }
    // Zones that were inherited but parent removed them are dropped
  }

  return result;
}

router.post("/:id/cascade", async (req, res) => {
  try {
    const { id } = UpdateLabelTemplateParams.parse({ id: parseInt(req.params.id) });
    const [parent] = await db.select().from(labelTemplatesTable).where(eq(labelTemplatesTable.id, id));
    if (!parent) return res.status(404).json({ error: "Template not found" });

    const parentZones = Array.isArray(parent.zones) ? (parent.zones as ZoneShape[]) : [];
    let templatesUpdated = 0;

    async function cascadeToChildren(parentId: number, pZones: ZoneShape[]) {
      const children = await db
        .select()
        .from(labelTemplatesTable)
        .where(eq(labelTemplatesTable.parentTemplateId, parentId));

      for (const child of children) {
        const childZones = Array.isArray(child.zones) ? (child.zones as ZoneShape[]) : [];
        const updatedZones = cascadeZonesToChild(pZones, childZones);
        await db
          .update(labelTemplatesTable)
          .set({ zones: updatedZones as unknown, updatedAt: new Date() })
          .where(eq(labelTemplatesTable.id, child.id));
        templatesUpdated++;
        await cascadeToChildren(child.id, updatedZones);
      }
    }

    await cascadeToChildren(id, parentZones);
    res.json({ templatesUpdated });
  } catch (err) {
    req.log.error({ err }, "Failed to cascade template");
    res.status(500).json({ error: "Failed to cascade template" });
  }
});

export default router;
