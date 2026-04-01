import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { labelTemplatesTable } from "./labelTemplates";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  productType: text("product_type").notNull(),
  name: text("name").notNull(),
  scentName: text("scent_name").notNull(),
  scentNotes: text("scent_notes"),
  size: text("size").notNull(),
  weight: text("weight"),
  ingredients: text("ingredients"),
  instructions: text("instructions"),
  burnTime: text("burn_time"),
  waxType: text("wax_type"),
  location: text("location"),
  warnings: text("warnings"),
  sku: text("sku"),
  isActive: boolean("is_active").notNull().default(true),
  labelTemplateId: integer("label_template_id").references(() => labelTemplatesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
