import { z } from "zod";

const idParam = z.object({ id: z.number() });

export const GetProductParams = idParam;
export const UpdateProductParams = idParam;
export const DeleteProductParams = idParam;

export const GetProductsQueryParams = z.object({
  search: z.string().optional(),
  productType: z.string().optional(),
  scentName: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
}).optional().default({});

export const CreateProductBody = z.object({
  name: z.string(),
  scentName: z.string().optional(),
  productType: z.string().optional(),
  size: z.string().optional(),
  sku: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  isActive: z.boolean().optional(),
}).passthrough();

export const UpdateProductBody = CreateProductBody.partial();

export const GetLabelSheetParams = idParam;
export const UpdateLabelSheetParams = idParam;
export const DeleteLabelSheetParams = idParam;

export const CreateLabelSheetBody = z.object({
  name: z.string(),
  brand: z.string().optional(),
  code: z.string().optional(),
  pageWidth: z.number(),
  pageHeight: z.number(),
  labelsAcross: z.number(),
  labelsDown: z.number(),
  labelWidth: z.number(),
  labelHeight: z.number(),
  topMargin: z.number().optional(),
  leftMargin: z.number().optional(),
  horizontalGap: z.number().optional(),
  verticalGap: z.number().optional(),
  cornerRadius: z.number().optional(),
  shape: z.string().optional(),
}).passthrough();

export const UpdateLabelSheetBody = CreateLabelSheetBody.partial();

export const GetLabelTemplateParams = idParam;
export const UpdateLabelTemplateParams = idParam;
export const DeleteLabelTemplateParams = idParam;

export const CreateLabelTemplateBody = z.object({
  name: z.string(),
  labelSheetId: z.number().optional(),
  zones: z.array(z.any()).optional(),
  labelBgColor: z.string().nullable().optional(),
  notes: z.string().optional(),
}).passthrough();

export const UpdateLabelTemplateBody = CreateLabelTemplateBody.partial();

export const GetPrintJobParams = idParam;
export const UpdatePrintJobParams = idParam;
export const DeletePrintJobParams = idParam;

export const CreatePrintJobBody = z.object({
  name: z.string(),
  labelSheetId: z.number(),
  labelTemplateId: z.number().nullable().optional(),
  jobType: z.enum(["standard", "reprint"]).optional(),
  blankSlots: z.array(z.number()).optional(),
  items: z.array(z.object({ productId: z.number(), quantity: z.number() })),
  notes: z.string().optional(),
}).passthrough();

export const UpdatePrintJobBody = CreatePrintJobBody.partial();

export const UpdateDesignSystemBody = z.object({
  primaryFont: z.string().optional(),
  secondaryFont: z.string().optional(),
  accentFont: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  logoUrl: z.string().optional(),
  brandName: z.string().optional(),
}).passthrough();
