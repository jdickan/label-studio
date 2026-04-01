import { Router, type IRouter } from "express";
import { db, productsTable, labelSheetsTable, labelTemplatesTable, printJobsTable } from "@workspace/db";
import { count, sql, eq, gte } from "drizzle-orm";

const router: IRouter = Router();

router.get("/stats", async (req, res) => {
  try {
    const [totalProducts] = await db.select({ count: count() }).from(productsTable);
    const [activeProducts] = await db.select({ count: count() }).from(productsTable).where(eq(productsTable.isActive, true));
    const [totalLabelSheets] = await db.select({ count: count() }).from(labelSheetsTable);
    const [totalLabelTemplates] = await db.select({ count: count() }).from(labelTemplatesTable);
    const [totalPrintJobs] = await db.select({ count: count() }).from(printJobsTable);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthJobs = await db.select().from(printJobsTable).where(gte(printJobsTable.createdAt, startOfMonth));
    
    let labelsThisMonth = 0;
    let sheetsThisMonth = 0;
    for (const job of monthJobs) {
      const items = (job.items as { quantity: number }[]) || [];
      const labels = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
      labelsThisMonth += labels;
    }
    sheetsThisMonth = monthJobs.length;

    res.json({
      totalProducts: totalProducts.count,
      activeProducts: activeProducts.count,
      totalLabelSheets: totalLabelSheets.count,
      totalLabelTemplates: totalLabelTemplates.count,
      totalPrintJobs: totalPrintJobs.count,
      labelsThisMonth,
      sheetsThisMonth,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard stats");
    res.status(500).json({ error: "Failed to get dashboard stats" });
  }
});

router.get("/recent-print-jobs", async (req, res) => {
  try {
    const jobs = await db.select().from(printJobsTable).orderBy(sql`${printJobsTable.createdAt} DESC`).limit(5);
    
    const results = await Promise.all(jobs.map(async (job) => {
      const [sheet] = await db.select().from(labelSheetsTable).where(eq(labelSheetsTable.id, job.labelSheetId));
      const rawItems = (job.items as { productId: number; quantity: number }[]) || [];
      const totalLabels = rawItems.reduce((sum, i) => sum + (i.quantity || 0), 0);
      const labelsPerSheet = sheet ? sheet.labelsAcross * sheet.labelsDown : 1;
      const totalSheets = Math.ceil(totalLabels / labelsPerSheet);
      return {
        id: job.id,
        name: job.name,
        labelSheetId: job.labelSheetId,
        labelSheetName: sheet?.name || "",
        labelSheetCode: sheet?.code || "",
        labelsPerSheet,
        items: rawItems.map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          productName: "",
          productScentName: "",
          productType: "",
          productSize: "",
        })),
        totalLabels,
        totalSheets,
        status: job.status,
        notes: job.notes,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      };
    }));
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Failed to get recent print jobs");
    res.status(500).json({ error: "Failed to get recent print jobs" });
  }
});

router.get("/products-by-type", async (req, res) => {
  try {
    const results = await db
      .select({ productType: productsTable.productType, count: count() })
      .from(productsTable)
      .groupBy(productsTable.productType);
    res.json(results);
  } catch (err) {
    req.log.error({ err }, "Failed to get products by type");
    res.status(500).json({ error: "Failed to get products by type" });
  }
});

export default router;
