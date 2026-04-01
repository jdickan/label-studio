import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const ZONE_ROLES = [
  "brand-name", "product-name", "scent-notes", "product-type",
  "weight-volume", "address", "website", "disclaimer",
  "date", "photo-area", "logo-area", "decorative-bar",
] as const;

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

function buildDefaultScaffold(): any[] {
  return [
    { id: randomUUID(), role: "brand-name", text: "", x: 0.03, y: 0.03, w: 0.45, h: 0.12, color: "#ffffff", fontSize: 8, textAlign: "left" },
    { id: randomUUID(), role: "product-name", text: "", x: 0.03, y: 0.18, w: 0.45, h: 0.30, color: "#ffffff", fontSize: 18, textAlign: "left" },
    { id: randomUUID(), role: "scent-notes", text: "", x: 0.03, y: 0.52, w: 0.45, h: 0.14, color: "#ffffff", fontSize: 9, textAlign: "left" },
    { id: randomUUID(), role: "weight-volume", text: "", x: 0.03, y: 0.70, w: 0.45, h: 0.10, color: "#ffffff", fontSize: 8, textAlign: "left" },
    { id: randomUUID(), role: "photo-area", text: "", x: 0.55, y: 0.0, w: 0.45, h: 1.0, color: "#e0d8cc", fontSize: 8, textAlign: "center" },
  ];
}

router.post("/analyze", upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No image file uploaded" });
    return;
  }

  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(req.file.mimetype)) {
    res.status(400).json({ error: "Image must be JPEG, PNG, or WebP" });
    return;
  }

  const base64 = req.file.buffer.toString("base64");
  const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

  let zones: any[];
  let brandMatches: Record<string, string> = {};

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

    let parsed: any[];
    try {
      parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) throw new Error("Not an array");
    } catch {
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error("Could not parse zones from LLM response");
      }
    }

    zones = parsed
      .filter((z: any) => ZONE_ROLES.includes(z.role) && typeof z.x === "number")
      .map((z: any) => ({
        id: randomUUID(),
        role: z.role,
        text: z.text ?? "",
        x: Math.max(0, Math.min(1, z.x)),
        y: Math.max(0, Math.min(1, z.y)),
        w: Math.max(0.01, Math.min(1, z.w)),
        h: Math.max(0.01, Math.min(1, z.h)),
        color: z.color ?? "#ffffff",
        fontSize: Math.max(6, Math.min(32, z.fontSize ?? 10)),
        textAlign: ["left", "center", "right"].includes(z.textAlign) ? z.textAlign : "left",
      }));

    if (zones.length === 0) {
      zones = buildDefaultScaffold();
    }

    // Build brandMatches: map detected text to known brand fields
    for (const zone of zones) {
      if (zone.role === "brand-name" && zone.text) brandMatches["brandName"] = zone.text;
      if (zone.role === "address" && zone.text) brandMatches["address"] = zone.text;
      if (zone.role === "website" && zone.text) brandMatches["websiteUrl"] = zone.text;
    }

  } catch (err: unknown) {
    req.log?.warn({ err }, "LLM analysis failed — returning default scaffold");
    zones = buildDefaultScaffold();
  }

  res.json({ zones, brandMatches });
});

export default router;
