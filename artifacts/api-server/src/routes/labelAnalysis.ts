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

const ANALYZE_PROMPT = `You are a label design analysis assistant specializing in scented products (soy candles, room sprays, reed diffusers).

Analyze the provided label image and identify all distinct content zones. These labels typically follow a structured layout like this reference design:

Reference zone structure for a scented product label (approximate, adjust to what you actually see):
- brand-name: top-left area (x≈0.03, y≈0.03, w≈0.45, h≈0.12) — the company/brand name in small caps
- product-name: prominent center-left (x≈0.03, y≈0.18, w≈0.45, h≈0.30) — the scent/product name, largest text
- scent-notes: below product-name (x≈0.03, y≈0.52, w≈0.45, h≈0.14) — fragrance notes like "top: bergamot, base: sandalwood"
- product-type: narrow strip (x≈0.03, y≈0.68, w≈0.40, h≈0.08) — e.g. "Soy Candle" or "Room Spray"
- weight-volume: bottom-left (x≈0.03, y≈0.78, w≈0.35, h≈0.08) — e.g. "8 oz / 226g"
- photo-area: right half (x≈0.52, y≈0.0, w≈0.48, h≈1.0) — photo or illustration region
- website: bottom strip — brand URL
- address: small text near bottom — brand address

Return ONLY a valid JSON array of zone objects. Each object must have this exact shape:
{
  "role": string (one of the roles listed below),
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
- "product-name": the product or scent name (usually largest text) — REQUIRED, always identify this zone
- "scent-notes": fragrance notes / scent description
- "product-type": product category (e.g. "Soy Candle", "Room Spray")
- "weight-volume": weight or volume text (e.g. "8 oz", "4 fl oz")
- "address": physical street address
- "website": website URL
- "disclaimer": safety warnings or legal text
- "date": batch date or best-by date
- "photo-area": a photograph or illustration area (no text content)
- "logo-area": brand logo image area (no text content)
- "decorative-bar": decorative stripe, border, or divider element

Rules:
- Identify ALL distinct zones visible (typically 5-10 zones per label)
- x, y, w, h MUST be 0.0–1.0 fractions (label top-left = 0,0; bottom-right = 1,1)
- Always include a "product-name" zone — it is required even if the text is small
- If text is rotated vertically, still capture its bounding box normally
- Return ONLY the JSON array, no markdown, no explanation, no code fences`;

function maxChars(zone: Omit<Zone, "maxChars">): number {
  return Math.max(1, Math.round(zone.w * zone.h * 10000 / (zone.fontSize * zone.fontSize * 0.6)));
}

function withMaxChars(zone: Omit<Zone, "maxChars">): Zone {
  return { ...zone, maxChars: maxChars(zone) } as Zone;
}

function buildDefaultScaffold(): Zone[] {
  return [
    withMaxChars({ id: randomUUID(), role: "brand-name",    text: "", x: 0.03, y: 0.03, w: 0.45, h: 0.12, color: "#ffffff", fontSize: 8,  textAlign: "left"   }),
    withMaxChars({ id: randomUUID(), role: "product-name",  text: "", x: 0.03, y: 0.18, w: 0.45, h: 0.30, color: "#ffffff", fontSize: 18, textAlign: "left"   }),
    withMaxChars({ id: randomUUID(), role: "scent-notes",   text: "", x: 0.03, y: 0.52, w: 0.45, h: 0.14, color: "#ffffff", fontSize: 9,  textAlign: "left"   }),
    withMaxChars({ id: randomUUID(), role: "weight-volume", text: "", x: 0.03, y: 0.70, w: 0.45, h: 0.10, color: "#ffffff", fontSize: 8,  textAlign: "left"   }),
    withMaxChars({ id: randomUUID(), role: "photo-area",    text: "", x: 0.55, y: 0.0,  w: 0.45, h: 1.0,  color: "#e0d8cc", fontSize: 8, textAlign: "center" }),
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
  maxChars: number;
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
      req.log.warn({ err }, "PDF conversion failed — returning default scaffold for manual zone editing");
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
      model: "gpt-4o",
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
      .map((z) => {
        const partial = {
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
        };
        return withMaxChars(partial);
      });

    for (const zone of zones) {
      if (zone.role === "brand-name" && zone.text) brandMatches["brandName"] = zone.text;
      if (zone.role === "address" && zone.text) brandMatches["address"] = zone.text;
      if (zone.role === "website" && zone.text) brandMatches["websiteUrl"] = zone.text;
    }

  } catch (err: unknown) {
    req.log.warn({ err }, "LLM analysis failed — returning default scaffold with empty zones for manual editing");
    zones = buildDefaultScaffold();
  }

  res.json({ zones, brandMatches });
});

export default router;
