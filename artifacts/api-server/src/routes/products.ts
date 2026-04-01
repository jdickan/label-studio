import { Router, type IRouter } from "express";
import { eq, ilike, and, SQL } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import {
  CreateProductBody,
  UpdateProductBody,
  GetProductParams,
  UpdateProductParams,
  DeleteProductParams,
  GetProductsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const { productType, search } = GetProductsQueryParams.parse(req.query);
    const conditions: SQL[] = [];
    if (productType) conditions.push(eq(productsTable.productType, productType as "soy_candle" | "room_spray" | "room_diffuser" | "other"));
    if (search) conditions.push(ilike(productsTable.name, `%${search}%`));
    const products = await db.select().from(productsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(productsTable.name);
    res.json(products);
  } catch (err) {
    req.log.error({ err }, "Failed to get products");
    res.status(500).json({ error: "Failed to get products" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = CreateProductBody.parse(req.body);
    const [product] = await db.insert(productsTable).values(body).returning();
    res.status(201).json(product);
  } catch (err) {
    req.log.error({ err }, "Failed to create product");
    res.status(400).json({ error: "Failed to create product" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = GetProductParams.parse({ id: parseInt(req.params.id) });
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    req.log.error({ err }, "Failed to get product");
    res.status(500).json({ error: "Failed to get product" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { id } = UpdateProductParams.parse({ id: parseInt(req.params.id) });
    const body = UpdateProductBody.parse(req.body);
    const [product] = await db.update(productsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(productsTable.id, id))
      .returning();
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    req.log.error({ err }, "Failed to update product");
    res.status(400).json({ error: "Failed to update product" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = DeleteProductParams.parse({ id: parseInt(req.params.id) });
    await db.delete(productsTable).where(eq(productsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete product");
    res.status(500).json({ error: "Failed to delete product" });
  }
});

export default router;
