import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, rm, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const ZONE_ROLES = [
  "brand-name", "product-name", "scent-notes", "product-type",
  "weight-volume", "address", "website", "disclaimer",
  "date", "photo-area", "logo-area", "decorative-bar",
] as const;

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const ANALYZE_PROMPT = `You are a label design analysis assistant for a scented products business (candles, room sprays, diffusers).

Analyze the provided label image and identify all distinct content zones. Return ONLY a valid JSON array of zone objects.

Each zone must have this exact structure:
{
  "role": string (one of the roles below),
  "text": string (the exact text visible in this zone, or "" for image/decorative zones),
  "x": number (left edge as 0-1 fraction of label width),
  "y": number (top edge as 0-1 fraction of label height),
  "w": number (zone width as 0-1 fraction of label width),
  "h": number (zone height as 0-1 fraction of label height),
  "color": string (dominant background hex color of this zone, e.g. "#ffffff"),
  "fontSize": number (estimated relative font size, 6-24),
  "textAlign": "left" | "center" | "right"
}

Allowed role values:
- "brand-name": the brand/company name
- "product-name": the product or scent name (usually largest text)
- "scent-notes": fragrance notes / scent description
- "product-type": product category (e.g. "Soy Candle", "Room Spray")
- "weight-volume": weight or volume text (e.g. "8 oz", "4 fl oz")
- "address": physical street address
- "website": website URL
- "disclaimer": safety warnings or legal text
- "date": batch date or best-by date
- "photo-area": a photograph or illustration area (no text)
- "logo-area": brand logo image area
- "decorative-bar": decorative stripe, border, or divider element

Rules:
- Identify ALL distinct zones you can see (typically 5-10 zones for a label)
- x, y, w, h MUST be 0.0 to 1.0 fractions (0=left/top edge, 1=right/bottom edge)
- For a zone spanning the full width: x=0, w=1.0
- Estimate positions carefully — the label's top-left corner is (0,0), bottom-right is (1,1)
- If text is rotated vertically (like a side address strip), still capture its bounding box
- The "photo-area" is typically the right portion of candle labels
- Return ONLY the JSON array, no markdown, no explanation, no code fences`;

function buildDefaultScaffold(): Zone[] {
  return [
    { id: randomUUID(), role: "brand-name",    text: "", x: 0.03, y: 0.03, w: 0.45, h: 0.12, color: "#ffffff", fontSize: 8,  textAlign: "left" },
    { id: randomUUID(), role: "product-name",  text: "", x: 0.03, y: 0.18, w: 0.45, h: 0.30, color: "#ffffff", fontSize: 18, textAlign: "left" },
    { id: randomUUID(), role: "scent-notes",   text: "", x: 0.03, y: 0.52, w: 0.45, h: 0.14, color: "#ffffff", fontSize: 9,  textAlign: "left" },
    { id: randomUUID(), role: "weight-volume", text: "", x: 0.03, y: 0.70, w: 0.45, h: 0.10, color: "#ffffff", fontSize: 8,  textAlign: "left" },
    { id: randomUUID(), role: "photo-area",    text: "", x: 0.55, y: 0.0,  w: 0.45, h: 1.0,  color: "#e0d8cc", fontSize: 8, textAlign: "center" },
  ];
}

type Zone = {
  id: string;
  role: typeof ZONE_ROLES[number];
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  fontSize: number;
  textAlign: "left" | "center" | "right";
};

async function pdfToBase64Png(buffer: Buffer): Promise<{ base64: string; mimeType: string }> {
  const tmpDir = await mkdtemp(join(tmpdir(), "label-analyze-"));
  const pdfPath = join(tmpDir, "input.pdf");
  const outBase = join(tmpDir, "page");

  try {
    await writeFile(pdfPath, buffer);
    // -r 150: 150 DPI, -singlefile: only page 1, -png: PNG output
    await execAsync(`pdftoppm -r 150 -singlefile -png "${pdfPath}" "${outBase}"`);

    // pdftoppm names the output file outBase + ".png" with -singlefile
    const pngPath = `${outBase}.png`;
    const pngBuffer = await readFile(pngPath);
    return { base64: pngBuffer.toString("base64"), mimeType: "image/png" };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

router.post("/analyze", upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No image file uploaded" });
    return;
  }

  if (!ALLOWED_MIME.includes(req.file.mimetype)) {
    res.status(400).json({ error: "File must be JPEG, PNG, WebP, or PDF" });
    return;
  }

  let base64: string;
  let mimeType: string;

  if (req.file.mimetype === "application/pdf") {
    try {
      const converted = await pdfToBase64Png(req.file.buffer);
      base64 = converted.base64;
      mimeType = converted.mimeType;
    } catch (err: unknown) {
      req.log.warn({ err }, "PDF conversion failed — returning default scaffold");
      res.json({ zones: buildDefaultScaffold(), brandMatches: {} });
      return;
    }
  } else {
    base64 = req.file.buffer.toString("base64");
    mimeType = req.file.mimetype;
  }

  const dataUrl = `data:${mimeType};base64,${base64}`;

  let zones: Zone[];
  const brandMatches: Record<string, string> = {};

  try {
    const { openai } = await import("@workspace/integrations-openai-ai-server");

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: ANALYZE_PROMPT },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "";

    let parsed: unknown[];
    try {
      parsed = JSON.parse(content) as unknown[];
      if (!Array.isArray(parsed)) throw new Error("Not an array");
    } catch {
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        parsed = JSON.parse(match[0]) as unknown[];
      } else {
        throw new Error("Could not parse zones from LLM response");
      }
    }

    zones = (parsed as Record<string, unknown>[])
      .filter((z) => ZONE_ROLES.includes(z.role as typeof ZONE_ROLES[number]) && typeof z.x === "number")
      .map((z) => ({
        id: randomUUID(),
        role: z.role as typeof ZONE_ROLES[number],
        text: typeof z.text === "string" ? z.text : "",
        x: Math.max(0, Math.min(1, z.x as number)),
        y: Math.max(0, Math.min(1, z.y as number)),
        w: Math.max(0.01, Math.min(1, z.w as number)),
        h: Math.max(0.01, Math.min(1, z.h as number)),
        color: typeof z.color === "string" ? z.color : "#ffffff",
        fontSize: Math.max(6, Math.min(32, typeof z.fontSize === "number" ? z.fontSize : 10)),
        textAlign: (["left", "center", "right"].includes(z.textAlign as string) ? z.textAlign : "left") as "left" | "center" | "right",
      }));

    if (zones.length === 0) {
      zones = buildDefaultScaffold();
    }

    for (const zone of zones) {
      if (zone.role === "brand-name" && zone.text) brandMatches["brandName"] = zone.text;
      if (zone.role === "address" && zone.text) brandMatches["address"] = zone.text;
      if (zone.role === "website" && zone.text) brandMatches["websiteUrl"] = zone.text;
    }

  } catch (err: unknown) {
    req.log.warn({ err }, "LLM analysis failed — returning default scaffold");
    zones = buildDefaultScaffold();
  }

  res.json({ zones, brandMatches });
});

export default router;
