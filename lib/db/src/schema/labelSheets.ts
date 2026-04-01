import { pgTable, serial, text, real, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const labelSheetsTable = pgTable("label_sheets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand").notNull(),
  code: text("code").notNull(),
  pageWidth: real("page_width").notNull(),
  pageHeight: real("page_height").notNull(),
  labelWidth: real("label_width").notNull(),
  labelHeight: real("label_height").notNull(),
  labelsAcross: integer("labels_across").notNull(),
  labelsDown: integer("labels_down").notNull(),
  topMargin: real("top_margin").notNull(),
  leftMargin: real("left_margin").notNull(),
  horizontalGap: real("horizontal_gap").notNull(),
  verticalGap: real("vertical_gap").notNull(),
  shape: text("shape", { enum: ["rectangle", "circle", "oval"] }).notNull().default("rectangle"),
  isCustom: boolean("is_custom").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertLabelSheetSchema = createInsertSchema(labelSheetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLabelSheet = z.infer<typeof insertLabelSheetSchema>;
export type LabelSheet = typeof labelSheetsTable.$inferSelect;
