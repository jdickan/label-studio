import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const designSystemTable = pgTable("design_system", {
  id: serial("id").primaryKey(),
  primaryColor: text("primary_color").notNull().default("#1a1a2e"),
  secondaryColor: text("secondary_color").notNull().default("#16213e"),
  accentColor: text("accent_color").notNull().default("#e94560"),
  backgroundColor: text("background_color").notNull().default("#ffffff"),
  textColor: text("text_color").notNull().default("#1a1a2e"),
  headingFont: text("heading_font").notNull().default("Heinberg Textured"),
  bodyFont: text("body_font").notNull().default("Jost"),
  logoUrl: text("logo_url"),
  brandName: text("brand_name").notNull().default("My Scent Studio"),
  tagline: text("tagline"),
  websiteUrl: text("website_url"),
  address: text("address"),
  phoneNumber: text("phone_number"),
  email: text("email"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDesignSystemSchema = createInsertSchema(designSystemTable).omit({ id: true, updatedAt: true });
export type InsertDesignSystem = z.infer<typeof insertDesignSystemSchema>;
export type DesignSystem = typeof designSystemTable.$inferSelect;
