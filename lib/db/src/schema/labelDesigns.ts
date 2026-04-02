import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { labelSheetsTable } from "./labelSheets";

export const labelDesignsTable = pgTable("label_designs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  labelSheetId: integer("label_sheet_id").references(() => labelSheetsTable.id, { onDelete: "set null" }),
  objects: jsonb("objects").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertLabelDesignSchema = createInsertSchema(labelDesignsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLabelDesign = z.infer<typeof insertLabelDesignSchema>;
export type LabelDesign = typeof labelDesignsTable.$inferSelect;
