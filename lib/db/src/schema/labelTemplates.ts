import { pgTable, serial, text, integer, jsonb, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { labelSheetsTable } from "./labelSheets";

export const labelTemplatesTable = pgTable("label_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  labelSheetId: integer("label_sheet_id").references(() => labelSheetsTable.id, { onDelete: "set null" }),
  zones: jsonb("zones").notNull().default({}),
  previewNotes: text("preview_notes"),
  safeAreaEnabled: boolean("safe_area_enabled").notNull().default(false),
  bleedInches: real("bleed_inches").notNull().default(0.125),
  safeAreaInches: real("safe_area_inches").notNull().default(0.125),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertLabelTemplateSchema = createInsertSchema(labelTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLabelTemplate = z.infer<typeof insertLabelTemplateSchema>;
export type LabelTemplate = typeof labelTemplatesTable.$inferSelect;
