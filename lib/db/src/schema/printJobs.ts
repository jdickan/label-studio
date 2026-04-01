import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { labelSheetsTable } from "./labelSheets";

export const printJobsTable = pgTable("print_jobs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  labelSheetId: integer("label_sheet_id").notNull().references(() => labelSheetsTable.id),
  items: jsonb("items").notNull().default([]),
  status: text("status", { enum: ["draft", "ready", "printed"] }).notNull().default("draft"),
  jobType: text("job_type", { enum: ["standard", "reprint"] }).notNull().default("standard"),
  blankSlots: jsonb("blank_slots").notNull().default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPrintJobSchema = createInsertSchema(printJobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPrintJob = z.infer<typeof insertPrintJobSchema>;
export type PrintJob = typeof printJobsTable.$inferSelect;
