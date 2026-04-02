import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, rm, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { db, labelTemplatesTable, designSystemTable, labelSheetsTable, labelDesignsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const execAsync = promisify(exec);

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = "pending" | "running" | "pass" | "warn" | "fail";

interface AnalysisStep {
  label: string;
  status: StepStatus;
  detail?: string;
}

interface MagicUploadJob {
  steps: AnalysisStep[];
  events: string[];
  listeners: ((event: string) => void)[];
  complete: boolean;
  result?: MagicUploadResult;
  error?: string;
}

interface DetectedZone {
  id: string;
  role: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  fontSize: number;
  textAlign: "left" | "center" | "right";
  rotation: number;
  maxChars: number;
}

interface MagicUploadResult {
  dimensions: { widthInches: number; heightInches: number };
  backgroundColor: string;
  zones: DetectedZone[];
  brandName: string;
  websiteUrl: string;
  address: string;
  productType: string;
  layoutPattern: string;
  aestheticTag: string;
  fontStyle: string;
  fontSizeClass: string;
  dominantColors: string[];
  thumbnailDataUrl: string;
}

// ─── In-memory job store ──────────────────────────────────────────────────────

const jobs = new Map<string, MagicUploadJob>();

function emit(job: MagicUploadJob, event: object) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  job.events.push(line);
  job.listeners.forEach((fn) => fn(line));
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Allowed types ────────────────────────────────────────────────────────────

const ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"];

const ZONE_ROLES = [
  "brand-name", "product-name", "scent-notes", "product-type",
  "weight-volume", "address", "website", "disclaimer",
  "date", "photo-area", "logo-area", "decorative-bar",
] as const;

// ─── PDF conversion ───────────────────────────────────────────────────────────

async function pdfToBase64Png(buffer: Buffer): Promise<{ base64: string; mimeType: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), "magic-upload-"));
  const pdfPath = join(tmpDir, "input.pdf");
  const outBase = join(tmpDir, "page");
  try {
    await writeFile(pdfPath, buffer);
    await execAsync(`pdftoppm -r 150 -singlefile -png "${pdfPath}" "${outBase}"`);
    const pngPath = `${outBase}.png`;
    const pngBuffer = await readFile(pngPath);
    return { base64: pngBuffer.toString("base64"), mimeType: "image/png" };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

// ─── The 12 steps ─────────────────────────────────────────────────────────────

const STEPS = [
  "Validating file format",
  "Converting to image",
  "Detecting label boundaries",
  "Analyzing background color",
  "Mapping content zones",
  "Extracting text elements",
  "Reading typography",
  "Identifying brand elements",
  "Detecting product type",
  "Analyzing design style",
  "Building zone template",
  "Preparing import package",
];

// ─── maxChars helper ──────────────────────────────────────────────────────────

function maxChars(zone: Omit<DetectedZone, "maxChars">): number {
  return Math.max(1, Math.round(zone.w * zone.h * 10000 / (zone.fontSize * zone.fontSize * 0.6)));
}

// ─── Core analysis with GPT-4o ────────────────────────────────────────────────

const MAGIC_UPLOAD_PROMPT = `You are a label design analysis assistant specializing in scented product labels (soy candles, room sprays, reed diffusers).

Analyze the uploaded label image and return a JSON object with ALL of these fields:

{
  "widthInches": number,      // estimated label width in inches (use visual proportions + standard label sizes like 4", 4.5", 5", 6")
  "heightInches": number,     // estimated label height in inches
  "backgroundColor": string,  // dominant background hex color of the label (e.g. "#f5e6d0")
  "zones": [                  // all distinct content zones (aim for 5-12)
    {
      "role": string,         // one of: brand-name, product-name, scent-notes, product-type, weight-volume, address, website, disclaimer, date, photo-area, logo-area, decorative-bar
      "text": string,         // exact visible text or "" for image/decorative zones
      "x": number,            // left edge as 0-1 fraction of label width
      "y": number,            // top edge as 0-1 fraction of label height
      "w": number,            // zone width as 0-1 fraction
      "h": number,            // zone height as 0-1 fraction
      "color": string,        // dominant background hex of this zone
      "fontSize": number,     // estimated relative font size 6-24
      "textAlign": "left" | "center" | "right",
      "rotation": number      // text rotation in degrees (0, 90, -90, 180, or best estimate); 0 if horizontal, 90 if rotated clockwise, -90 if counter-clockwise
    }
  ],
  "brandName": string,        // brand/company name text if visible, else ""
  "websiteUrl": string,       // website URL if visible, else ""
  "address": string,          // address if visible, else ""
  "productType": string,      // one of: soy_candle, room_spray, room_diffuser, unknown
  "layoutPattern": string,    // one of: photo_right, photo_left, all_text, centered_hero, band_layout
  "aestheticTag": string,     // one of: minimalist, luxury, rustic, modern, botanical
  "fontStyle": string,        // one of: serif, sans, script, mixed
  "fontSizeClass": string,    // one of: small, medium, large
  "dominantColors": string[]  // array of 2-5 hex colors extracted from the label palette
}

Rules for zone detection:
- Always include a "product-name" zone — it is required
- x, y, w, h MUST be 0.0–1.0 fractions
- Identify ALL distinct content zones with visible TEXT or IMAGE content (typically 5-10)
- ONLY create zones for FUNCTIONAL content areas (brand names, product names, descriptions, ingredients, disclaimers, images, logos)
- DO NOT create zones for purely decorative visual elements like:
  * Background textures, patterns, or fills (diagonal stripes, gradients, decorative borders)
  * Dividing lines or decorative separators
  * Visual ornaments or flourishes that don't contain information
- Mark zones as "photo-area" or "logo-area" ONLY if they contain actual images, photos, or brand logo graphics
  * Never create "logo-area" zones that are actually rotated text — keep as text zone with rotation instead
- For angled/vertical text zones, estimate rotation accurately:
  * 0° = horizontal text (left-to-right)
  * -90° = text on the RIGHT side of the label that reads upward (bottom of text points right) — USE THIS for right-edge disclaimer, address, and legal text
  * 90° = text rotated 90° clockwise (reads downward, top of text points right) — rare
  * Preserve rotation for disclaimer/warning text on edges
- CRITICAL — right-side vertical zones (rotation −90°): the zone box coordinates describe where the ROTATED BOX sits on the canvas BEFORE rotation. For text on the right edge reading upward, set x close to the right edge (e.g. 0.85–0.95), and ENSURE x + w ≤ 1.0. The zone must fit WITHIN the label, not beyond it.
- CRITICAL — coordinate boundary: x + w MUST be ≤ 1.0 and y + h MUST be ≤ 1.0 for every zone. Clip or reduce w/h to enforce this.
- If text and image content overlap in the same area, create separate zones — prefer text zones over image zones when unsure
- Return ONLY the JSON object, no markdown, no explanation, no code fences`;

async function runAnalysis(jobId: string, filename: string, buffer: Buffer, mimeType: string) {
  const job = jobs.get(jobId);
  if (!job) return;

  const step = async (idx: number, status: StepStatus, detail?: string) => {
    job.steps[idx] = { label: STEPS[idx], status, detail };
    emit(job, { type: "step", stepIndex: idx, stepLabel: STEPS[idx], status, detail });
    await sleep(200);
  };

  try {
    // Step 0 — Validate file format
    await step(0, "running");
    if (!ALLOWED_MIME.includes(mimeType)) {
      await step(0, "fail", `Unsupported file type: ${mimeType}`);
      job.error = "Unsupported file type";
      job.complete = true;
      emit(job, { type: "error", message: "Unsupported file type" });
      return;
    }
    await step(0, "pass", `${mimeType} — accepted`);

    // Step 1 — Convert to image
    await step(1, "running");
    let base64: string;
    let imageMime: string;

    if (mimeType === "application/pdf") {
      try {
        const converted = await pdfToBase64Png(buffer);
        base64 = converted.base64;
        imageMime = converted.mimeType;
        await step(1, "pass", "PDF converted to PNG via pdftoppm");
      } catch (err: unknown) {
        const convMsg = err instanceof Error ? err.message : "pdftoppm conversion failed";
        await step(1, "fail", `PDF conversion failed: ${convMsg}`);
        job.error = convMsg;
        job.complete = true;
        emit(job, { type: "error", message: `PDF conversion failed — please upload a JPEG or PNG instead` });
        return;
      }
    } else {
      base64 = buffer.toString("base64");
      imageMime = mimeType;
      await step(1, "pass", "Raster image — no conversion needed");
    }

    const dataUrl = `data:${imageMime};base64,${base64}`;

    // Step 2 — Call GPT-4o for full analysis
    await step(2, "running");

    let parsed: Record<string, unknown>;
    try {
      const { openai } = await import("@workspace/integrations-openai-ai-server");
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_completion_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: MAGIC_UPLOAD_PROMPT },
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            ],
          },
        ],
      });

      const content = response.choices[0]?.message?.content ?? "";
      try {
        parsed = JSON.parse(content) as Record<string, unknown>;
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]) as Record<string, unknown>;
        } else {
          throw new Error("Could not parse JSON from AI response");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "AI analysis failed";
      await step(2, "fail", msg);
      job.error = msg;
      job.complete = true;
      emit(job, { type: "error", message: msg });
      return;
    }

    const widthInches = typeof parsed.widthInches === "number" ? Math.max(0.5, parsed.widthInches) : 4;
    const heightInches = typeof parsed.heightInches === "number" ? Math.max(0.5, parsed.heightInches) : 2;
    await step(2, "pass", `Estimated ${widthInches}" × ${heightInches}" — boundaries detected`);

    // Step 3 — Background color
    await step(3, "running");
    const backgroundColor = typeof parsed.backgroundColor === "string" ? parsed.backgroundColor : "#ffffff";
    await step(3, "pass", `Background color: ${backgroundColor}`);

    // Step 4 — Map zones
    await step(4, "running");
    const rawZones = Array.isArray(parsed.zones) ? parsed.zones as Record<string, unknown>[] : [];
    const zones: DetectedZone[] = rawZones
      .filter((z) => ZONE_ROLES.includes(z.role as typeof ZONE_ROLES[number]) && typeof z.x === "number")
      .map((z) => {
        const x = Math.max(0, Math.min(0.99, z.x as number));
        const y = Math.max(0, Math.min(0.99, z.y as number));
        const w = Math.max(0.01, Math.min(1 - x, z.w as number));
        const h = Math.max(0.01, Math.min(1 - y, z.h as number));
        const partial = {
          id: randomUUID(),
          role: z.role as string,
          text: typeof z.text === "string" ? z.text : "",
          x,
          y,
          w,
          h,
          color: typeof z.color === "string" ? z.color : "#ffffff",
          fontSize: Math.max(6, Math.min(32, typeof z.fontSize === "number" ? z.fontSize : 10)),
          textAlign: (["left", "center", "right"].includes(z.textAlign as string) ? z.textAlign : "left") as "left" | "center" | "right",
          rotation: typeof z.rotation === "number" ? Math.round(z.rotation) : 0,
        };
        return { ...partial, maxChars: maxChars(partial) };
      });
    await step(4, "pass", `${zones.length} content zones mapped`);

    // Step 5 — Validate text elements
    await step(5, "running");
    const textZones = zones.filter((z) => z.text.trim().length > 0);
    const hasProductName = zones.some((z) => z.role === "product-name");
    if (textZones.length === 0) {
      await step(5, "warn", "No text zones found — label may be image-only");
    } else if (!hasProductName) {
      await step(5, "warn", `${textZones.length} text zones found; product-name zone not detected`);
    } else {
      await step(5, "pass", `${textZones.length} text zones found including product-name`);
    }

    // Step 6 — Typography
    await step(6, "running");
    const fontStyle = typeof parsed.fontStyle === "string" ? parsed.fontStyle : "sans";
    const fontSizeClass = typeof parsed.fontSizeClass === "string" ? parsed.fontSizeClass : "medium";
    await step(6, "pass", `Font style: ${fontStyle}, size class: ${fontSizeClass}`);

    // Step 7 — Brand elements
    await step(7, "running");
    const brandName = typeof parsed.brandName === "string" ? parsed.brandName : "";
    const websiteUrl = typeof parsed.websiteUrl === "string" ? parsed.websiteUrl : "";
    const address = typeof parsed.address === "string" ? parsed.address : "";
    const brandFields: { label: string; value: string }[] = [
      { label: "brand name", value: brandName },
      { label: "website", value: websiteUrl },
      { label: "address", value: address },
    ].filter((f) => f.value.trim().length > 0);
    if (brandFields.length === 0) {
      await step(7, "warn", "No brand elements detected");
    } else {
      await step(7, "pass", `Found: ${brandFields.map((f) => f.label).join(", ")}`);
    }

    // Step 8 — Product type
    await step(8, "running");
    const productType = typeof parsed.productType === "string" ? parsed.productType : "unknown";
    const KNOWN_TYPES = ["soy_candle", "room_spray", "room_diffuser", "unknown"];
    const cleanProductType = KNOWN_TYPES.includes(productType) ? productType : "unknown";
    await step(8, productType === "unknown" ? "warn" : "pass", `Detected: ${cleanProductType}`);

    // Step 9 — Design style
    await step(9, "running");
    const layoutPattern = typeof parsed.layoutPattern === "string" ? parsed.layoutPattern : "all_text";
    const aestheticTag = typeof parsed.aestheticTag === "string" ? parsed.aestheticTag : "modern";
    await step(9, "pass", `Layout: ${layoutPattern}, aesthetic: ${aestheticTag}`);

    // Step 10 — Validate zone template
    await step(10, "running");
    if (zones.length < 3) {
      await step(10, "warn", `Only ${zones.length} zone(s) detected — template may be incomplete`);
    } else {
      await step(10, "pass", `Zone template ready: ${zones.length} zones`);
    }

    // Step 11 — Prepare import package
    await step(11, "running");
    const dominantColors = Array.isArray(parsed.dominantColors)
      ? (parsed.dominantColors as unknown[]).filter((c) => typeof c === "string").slice(0, 5) as string[]
      : [];
    const templateName = filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") + " (Magic Import)";
    const brandUpdates = [brandName && "brand name", websiteUrl && "website URL", address && "address"].filter(Boolean);
    const summaryParts = [
      `Template "${templateName}"`,
      brandUpdates.length > 0 ? `brand fields: ${brandUpdates.join(", ")}` : null,
      "master template flag available in review",
    ].filter(Boolean);
    await step(11, "pass", summaryParts.join(" — "));

    // Build result
    const result: MagicUploadResult = {
      dimensions: { widthInches, heightInches },
      backgroundColor,
      zones,
      brandName,
      websiteUrl,
      address,
      productType: cleanProductType,
      layoutPattern,
      aestheticTag,
      fontStyle,
      fontSizeClass,
      dominantColors,
      thumbnailDataUrl: `data:${imageMime};base64,${base64}`,
    };

    job.result = result;
    job.complete = true;
    emit(job, { type: "result", data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    job.error = message;
    job.complete = true;
    emit(job, { type: "error", message });
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post("/analyze", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const jobId = randomUUID();
  const job: MagicUploadJob = {
    steps: STEPS.map((label) => ({ label, status: "pending" as StepStatus })),
    events: [],
    listeners: [],
    complete: false,
  };
  jobs.set(jobId, job);

  res.json({ jobId });

  // Run analysis in background
  runAnalysis(jobId, req.file.originalname, req.file.buffer, req.file.mimetype).catch((err) => {
    const message = err instanceof Error ? err.message : "Analysis failed";
    job.error = message;
    job.complete = true;
    emit(job, { type: "error", message });
  });

  // Clean up after 10 minutes
  setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000);
});

router.get("/analyze/:jobId/events", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  for (const event of job.events) {
    res.write(event);
  }

  if (job.complete) {
    res.end();
    return;
  }

  const listener = (event: string) => {
    res.write(event);
    if (event.includes('"type":"done"') || event.includes('"type":"error"') || event.includes('"type":"result"')) {
      res.end();
    }
  };
  job.listeners.push(listener);

  req.on("close", () => {
    const idx = job.listeners.indexOf(listener);
    if (idx !== -1) job.listeners.splice(idx, 1);
  });
});

router.post("/import", async (req, res) => {
  try {
    const {
      zones,
      dimensions,
      backgroundColor,
      brandName,
      websiteUrl,
      address,
      primaryColor,
      dominantColors,
      productType,
      isMasterTemplate,
      templateName,
      logoDataUrl,
    } = req.body as {
      zones: Record<string, unknown>[];
      dimensions: { widthInches: number; heightInches: number };
      backgroundColor: string;
      brandName: string;
      websiteUrl: string;
      address: string;
      primaryColor?: string;
      dominantColors?: string[];
      productType?: string;
      isMasterTemplate?: boolean;
      templateName: string;
      logoDataUrl?: string;
    };

    if (!templateName) {
      res.status(400).json({ error: "templateName is required" });
      return;
    }

    // Find or create a label sheet matching the detected dimensions
    const w = dimensions?.widthInches ?? 4;
    const h = dimensions?.heightInches ?? 2;
    const TOLERANCE = 0.1; // inches

    let labelSheetId: number | undefined;
    try {
      const allSheets = await db.select().from(labelSheetsTable);
      const match = allSheets.find(
        (s) => Math.abs(s.labelWidth - w) <= TOLERANCE && Math.abs(s.labelHeight - h) <= TOLERANCE
      );
      if (match) {
        labelSheetId = match.id;
      } else {
        // Create a custom 1-up sheet with the detected dimensions
        const margin = 0.25;
        const [newSheet] = await db.insert(labelSheetsTable).values({
          name: `${w}" × ${h}" Custom Label`,
          brand: "Custom",
          code: `CUSTOM-${w}x${h}`.replace(/\./g, "_"),
          pageWidth: w + margin * 2,
          pageHeight: h + margin * 2,
          labelWidth: w,
          labelHeight: h,
          labelsAcross: 1,
          labelsDown: 1,
          topMargin: margin,
          leftMargin: margin,
          horizontalGap: 0,
          verticalGap: 0,
          shape: "rectangle",
          isCustom: true,
        }).returning();
        labelSheetId = newSheet?.id;
      }
    } catch {
      // Non-fatal — template will just have no sheet linked
    }

    // Create label template
    const [template] = await db.insert(labelTemplatesTable).values({
      name: templateName,
      description: `Magic Import — ${productType ?? "unknown"} label, ${w}" × ${h}"`,
      zones: zones ?? [],
      labelBgColor: backgroundColor ?? "#ffffff",
      labelSheetId: labelSheetId ?? null,
    }).returning();

    // If this is master template, also create a visual design template
    let design = null;
    if (isMasterTemplate && template) {
      try {
        // Design editor stores x/y/w/h in INCHES (it multiplies by PPI internally for rendering)
        // Zone fractions (0‒1) × label size in inches = position in inches
        const designObjects = (zones ?? []).map((zone) => {
          const isImage = zone.role === "photo-area" || zone.role === "logo-area";
          const xIn = (zone.x ?? 0) * w;
          const yIn = (zone.y ?? 0) * h;
          const wIn = Math.max(0.05, (zone.w ?? 0.2) * w);
          const hIn = Math.max(0.05, (zone.h ?? 0.1) * h);

          if (isImage) {
            return {
              id: randomUUID(),
              type: "rect",
              x: xIn, y: yIn, w: wIn, h: hIn,
              locked: false, visible: true,
              fill: "#e5e7eb",
              stroke: "#9ca3af",
              strokeWidth: 1,
              borderRadius: 0,
            };
          }
          return {
            id: randomUUID(),
            type: "text",
            x: xIn, y: yIn, w: wIn, h: hIn,
            locked: false, visible: true,
            role: zone.role,
            content: zone.text || `[${String(zone.role).replace(/-/g, " ")}]`,
            fontFamily: "Arial",
            fontSize: Math.max(6, Math.min(72, zone.fontSize ?? 12)),
            bold: zone.role === "product-name" || zone.role === "brand-name",
            italic: false,
            underline: false,
            align: (["left", "center", "right"].includes(zone.textAlign ?? "") ? zone.textAlign : "left") as "left" | "center" | "right",
            letterSpacing: 0,
            color: "#000000",
          };
        });

        const [newDesign] = await db.insert(labelDesignsTable).values({
          name: templateName,
          description: `Master Design — ${productType ?? "unknown"} label, ${w}" × ${h}"`,
          labelSheetId: labelSheetId ?? null,
          objects: designObjects,
        }).returning();
        design = newDesign;
      } catch {
        // Non-fatal — design template creation failed but import succeeded
      }
    }

    // Patch design system
    const dsRows = await db.select().from(designSystemTable).limit(1);
    const dsExists = dsRows.length > 0;

    type DsUpdate = {
      updatedAt: Date;
      brandName?: string;
      websiteUrl?: string;
      address?: string;
      primaryColor?: string;
      logoUrl?: string;
      masterTemplateId?: number;
    };

    const dsUpdate: DsUpdate = { updatedAt: new Date() };
    if (brandName) dsUpdate.brandName = brandName;
    if (websiteUrl) dsUpdate.websiteUrl = websiteUrl;
    if (address) dsUpdate.address = address;
    if (primaryColor) dsUpdate.primaryColor = primaryColor;
    if (logoDataUrl) dsUpdate.logoUrl = logoDataUrl;
    if (isMasterTemplate && template) dsUpdate.masterTemplateId = template.id;

    let ds;
    if (dsExists) {
      [ds] = await db.update(designSystemTable)
        .set(dsUpdate)
        .returning();
    } else {
      [ds] = await db.insert(designSystemTable)
        .values({ brandName: brandName || "My Scent Studio", ...dsUpdate })
        .returning();
    }

    res.json({ template, design, designSystem: ds });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Import failed";
    res.status(500).json({ error: message });
  }
});

export default router;
