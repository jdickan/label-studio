import { Router } from "express";
import multer from "multer";
import zlib from "zlib";
import { randomUUID } from "crypto";
import { db, labelSheetsTable } from "@workspace/db";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── In-memory job store ──────────────────────────────────────────────────────

type StepStatus = "pending" | "running" | "pass" | "fail" | "warn";

interface AnalysisStep {
  label: string;
  status: StepStatus;
  detail?: string;
}

interface FileResult {
  filename: string;
  steps: AnalysisStep[];
  measurements?: ExtractedMeasurements;
  error?: string;
  done: boolean;
}

interface Job {
  files: FileResult[];
  events: string[];
  listeners: ((event: string) => void)[];
  complete: boolean;
}

interface ExtractedMeasurements {
  code: string;
  name: string;
  brand: string;
  pageWidth: number;
  pageHeight: number;
  labelWidth: number;
  labelHeight: number;
  labelsAcross: number;
  labelsDown: number;
  topMargin: number;
  leftMargin: number;
  horizontalGap: number;
  verticalGap: number;
  cornerRadius: number | null;
  shape: "rectangle";
  isCustom: boolean;
  validationH: string;
  validationV: string;
  passedValidation: boolean;
}

const jobs = new Map<string, Job>();

function emit(job: Job, event: object) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  job.events.push(line);
  job.listeners.forEach(fn => fn(line));
}

// ─── PDF Parsing utilities ────────────────────────────────────────────────────

function round4(n: number) { return Math.round(n * 10000) / 10000; }
function round2(n: number) { return Math.round(n * 100) / 100; }

function extractPageDimensions(buf: Buffer): { widthPts: number; heightPts: number } {
  const raw = buf.toString("latin1");
  const mb = raw.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (mb) {
    return { widthPts: parseFloat(mb[3]), heightPts: parseFloat(mb[4]) };
  }
  const xmp = raw.match(/<stDim:w>([\d.]+)<\/stDim:w>[\s\S]{0,200}<stDim:h>([\d.]+)<\/stDim:h>/);
  if (xmp) {
    return { widthPts: parseFloat(xmp[1]) * 72, heightPts: parseFloat(xmp[2]) * 72 };
  }
  return { widthPts: 612, heightPts: 792 };
}

function decompressStreams(buf: Buffer): string[] {
  const results: string[] = [];
  let pos = 0;
  while (pos < buf.length) {
    let idx = buf.indexOf("stream\r\n", pos);
    let skip = 8;
    const idx2 = buf.indexOf("stream\n", pos);
    if (idx === -1 || (idx2 !== -1 && idx2 < idx)) { idx = idx2; skip = 7; }
    if (idx === -1) break;
    const start = idx + skip;
    const end = buf.indexOf("endstream", start);
    if (end === -1) break;
    try {
      const decoded = zlib.inflateSync(buf.slice(start, end)).toString("latin1");
      results.push(decoded);
    } catch { /* not a zlib stream, skip */ }
    pos = end + 9;
  }
  return results;
}

interface LabelRect { x: number; y: number; w: number; h: number; r: number; }

function parseDrawingCommands(streams: string[], pageHeightPts: number): {
  labels: LabelRect[];
  drawMode: "rect" | "bezier" | "none";
  hasFlipTransform: boolean;
} {
  const allText = streams.join("\n");

  // Check for y-flip coordinate transform
  const hasFlipTransform = /1 0 0 -1 0 \d+(\.\d+)? cm/.test(allText);

  // Try rectangle operator first (square-corner templates)
  const rePattern = /(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)\s+re/g;
  const rects: LabelRect[] = [];
  let m: RegExpExecArray | null;
  while ((m = rePattern.exec(allText)) !== null) {
    const x = parseFloat(m[1]);
    const y = parseFloat(m[2]);
    const w = parseFloat(m[3]);
    const h = parseFloat(m[4]);
    if (w > 30 && h > 30 && w < 600 && h < 700) {
      rects.push({ x, y, w, h, r: 0 });
    }
  }
  if (rects.length > 0) {
    // Convert from PDF y-up to display y-down using page height
    const displayLabels = rects.map(rect => ({
      x: rect.x,
      y: pageHeightPts - rect.y - rect.h,
      w: rect.w,
      h: rect.h,
      r: 0,
    }));
    return { labels: displayLabels, drawMode: "rect", hasFlipTransform: false };
  }

  // Parse Bezier rounded-rectangle paths
  // Pattern: m ... l ... c ... (for each label)
  const bezierLabels: LabelRect[] = [];

  // Split streams into individual path segments
  for (const stream of streams) {
    const tokens = stream.trim().split(/\s+/);
    let i = 0;
    while (i < tokens.length) {
      if (tokens[i] === "m" && i >= 2) {
        const mx = parseFloat(tokens[i - 2]);
        const my = parseFloat(tokens[i - 1]);
        // Find the complete closed path for this label
        const pathTokens: string[] = [tokens[i - 2], tokens[i - 1], "m"];
        let j = i + 1;
        let endFound = false;
        while (j < tokens.length && j < i + 200) {
          pathTokens.push(tokens[j]);
          if (tokens[j] === "S" || tokens[j] === "f" || tokens[j] === "F" ||
              tokens[j] === "B" || tokens[j] === "n" || tokens[j] === "h") {
            endFound = true;
            break;
          }
          if (tokens[j] === "m" && j > i + 5) break; // next path
          j++;
        }
        if (!endFound && j < i + 200) { i++; continue; }

        // Extract all coordinate pairs from the path
        const nums: number[] = [];
        const ops: string[] = [];
        let k = 0;
        while (k < pathTokens.length) {
          if (/^-?[\d.]+$/.test(pathTokens[k])) {
            nums.push(parseFloat(pathTokens[k]));
          } else if (/^[mlcSsfFBn]$/.test(pathTokens[k])) {
            ops.push(pathTokens[k]);
          }
          k++;
        }

        if (nums.length < 8) { i++; continue; }

        // Extract bounding box from the path
        // For a rounded rect, the path starts at (x+r, y) on the bottom edge
        // The outer corners define the bounding box
        const allX: number[] = [];
        const allY: number[] = [];
        for (let n = 0; n < nums.length - 1; n += 2) {
          allX.push(nums[n]);
          allY.push(nums[n + 1]);
        }

        const minX = Math.min(...allX);
        const maxX = Math.max(...allX);
        const minY = Math.min(...allY);
        const maxY = Math.max(...allY);
        const w = maxX - minX;
        const h = maxY - minY;

        if (w < 30 || h < 30 || w > 600 || h > 700) { i++; continue; }

        // Detect corner radius: first point is (outer_x + r, outer_y)
        // mx is the inner point on the bottom edge, outer_x = minX
        // radius = mx - minX
        const r = Math.abs(mx - minX);

        // If y-flip transform is active, y already increases downward in path coords
        // So minY is the top of the label in display coordinates
        const displayY = hasFlipTransform ? minY : pageHeightPts - maxY;

        bezierLabels.push({ x: minX, y: displayY, w, h, r });
        i = j + 1;
        continue;
      }
      i++;
    }
  }

  if (bezierLabels.length > 0) {
    return { labels: bezierLabels, drawMode: "bezier", hasFlipTransform };
  }

  return { labels: [], drawMode: "none", hasFlipTransform };
}

function clusterValues(vals: number[], tol = 1): number[] {
  const sorted = [...vals].sort((a, b) => a - b);
  const clusters: number[] = [];
  for (const v of sorted) {
    if (clusters.length === 0 || v - clusters[clusters.length - 1] > tol) {
      clusters.push(v);
    }
  }
  return clusters;
}

function computeMeasurements(labels: LabelRect[], pageWidthPts: number, pageHeightPts: number): ExtractedMeasurements | null {
  if (labels.length === 0) return null;

  const xs = clusterValues(labels.map(l => l.x));
  const ys = clusterValues(labels.map(l => l.y));

  const labelsAcross = xs.length;
  const labelsDown = ys.length;

  const w = labels[0].w;
  const h = labels[0].h;
  const r = labels[0].r;

  const leftMarginPts = xs[0];
  const topMarginPts  = ys[0];

  const hGapPts = labelsAcross > 1 ? xs[1] - xs[0] - w : 0;
  const vGapPts = labelsDown > 1   ? ys[1] - ys[0] - h : 0;

  const labelWidth   = round4(w / 72);
  const labelHeight  = round4(h / 72);
  const leftMargin   = round4(leftMarginPts / 72);
  const topMargin    = round4(topMarginPts / 72);
  const horizontalGap = round4(Math.max(0, hGapPts) / 72);
  const verticalGap   = round4(Math.max(0, vGapPts) / 72);
  const cornerRadius  = r > 0.5 ? round4(r / 72) : null;

  const pageWidth  = round4(pageWidthPts / 72);
  const pageHeight = round4(pageHeightPts / 72);

  const hSum = leftMargin + labelsAcross * labelWidth + (labelsAcross - 1) * horizontalGap + leftMargin;
  const vSum = topMargin  + labelsDown   * labelHeight + (labelsDown - 1)   * verticalGap   + topMargin;

  const hOk = Math.abs(hSum - pageWidth)  < 0.02;
  const vOk = Math.abs(vSum - pageHeight) < 0.02;

  const validationH = `${round2(leftMargin)}" + ${labelsAcross}×${round2(labelWidth)}" + ${labelsAcross - 1}×${round2(horizontalGap)}" + ${round2(leftMargin)}" = ${round2(hSum)}" (page ${round2(pageWidth)}")`;
  const validationV = `${round2(topMargin)}" + ${labelsDown}×${round2(labelHeight)}" + ${labelsDown - 1}×${round2(verticalGap)}" + ${round2(topMargin)}" = ${round2(vSum)}" (page ${round2(pageHeight)}")`;

  return {
    code: "",
    name: "",
    brand: "OnlineLabels",
    pageWidth,
    pageHeight,
    labelWidth,
    labelHeight,
    labelsAcross,
    labelsDown,
    topMargin,
    leftMargin,
    horizontalGap,
    verticalGap,
    cornerRadius,
    shape: "rectangle",
    isCustom: false,
    validationH,
    validationV,
    passedValidation: hOk && vOk,
  };
}

function inferCodeFromFilename(filename: string): { code: string; brand: string; name: string } {
  const base = filename.replace(/\.[^.]+$/, "").replace(/_[\d]+$/, "").trim();
  const olMatch = base.match(/OL[-_]?(\d+[A-Z]?)/i);
  if (olMatch) {
    const code = `OL${olMatch[1].toUpperCase()}`;
    return { code, brand: "OnlineLabels", name: `${code} — Imported from PDF` };
  }
  const averyMatch = base.match(/(\d{4,5})/);
  if (averyMatch) {
    return { code: averyMatch[1], brand: "Avery", name: `${averyMatch[1]} — Imported from PDF` };
  }
  return { code: base.toUpperCase().replace(/\s+/g, "-"), brand: "Custom", name: `${base} — Imported from PDF` };
}

// ─── Core per-file analysis (with step-by-step SSE emissions) ─────────────────

const STEPS = [
  "Validating PDF format",
  "Reading page dimensions",
  "Decompressing PDF streams",
  "Parsing drawing commands",
  "Extracting label geometry",
  "Computing grid layout",
  "Measuring margins",
  "Measuring gaps",
  "Detecting corner radius",
  "Validating H/V math",
  "Identifying template code",
  "Preparing import record",
];

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function analyzeFile(job: Job, fileIndex: number, filename: string, buf: Buffer) {
  const fileResult = job.files[fileIndex];

  const step = async (idx: number, status: StepStatus, detail?: string) => {
    fileResult.steps[idx] = { label: STEPS[idx], status, detail };
    emit(job, { type: "step", file: filename, fileIndex, stepIndex: idx, stepLabel: STEPS[idx], status, detail });
    await sleep(180);
  };

  try {
    // Step 0 — Validate PDF
    await step(0, "running");
    const header = buf.slice(0, 8).toString("ascii");
    if (!header.startsWith("%PDF-")) {
      await step(0, "fail", "Not a valid PDF file");
      fileResult.error = "Invalid PDF";
      fileResult.done = true;
      emit(job, { type: "error", file: filename, fileIndex, message: "Not a valid PDF file" });
      return;
    }
    const version = header.slice(5, 8);
    await step(0, "pass", `PDF ${version}`);

    // Step 1 — Page dimensions
    await step(1, "running");
    const { widthPts, heightPts } = extractPageDimensions(buf);
    await step(1, "pass", `${round4(widthPts / 72)}" × ${round4(heightPts / 72)}" (${widthPts} × ${heightPts} pts)`);

    // Step 2 — Decompress streams
    await step(2, "running");
    const streams = decompressStreams(buf);
    if (streams.length === 0) {
      await step(2, "warn", "No compressed streams found — may be uncompressed or image-only PDF");
    } else {
      await step(2, "pass", `${streams.length} stream${streams.length > 1 ? "s" : ""} decompressed`);
    }

    // Step 3 — Parse drawing commands
    await step(3, "running");
    const { labels, drawMode, hasFlipTransform } = parseDrawingCommands(streams, heightPts);
    if (drawMode === "none" || labels.length === 0) {
      await step(3, "fail", "No recognizable label paths found in PDF");
      fileResult.error = "No label paths detected";
      fileResult.done = true;
      emit(job, { type: "error", file: filename, fileIndex, message: "No label paths detected in PDF" });
      return;
    }
    const modeDesc = drawMode === "rect" ? "rectangle (re) commands — square corners" : `Bezier paths${hasFlipTransform ? " + y-flip transform" : ""}`;
    await step(3, "pass", `${modeDesc}, ${labels.length} label outlines found`);

    // Step 4 — Extract geometry
    await step(4, "running");
    const widths = [...new Set(labels.map(l => round4(l.w)))];
    const heights = [...new Set(labels.map(l => round4(l.h)))];
    if (widths.length > 2 || heights.length > 2) {
      await step(4, "warn", `Multiple label sizes detected: ${widths.join(", ")} wide — using first`);
    } else {
      await step(4, "pass", `${round4(labels[0].w / 72)}" × ${round4(labels[0].h / 72)}" label size`);
    }

    // Step 5 — Compute grid
    await step(5, "running");
    const xs = clusterValues(labels.map(l => l.x));
    const ys = clusterValues(labels.map(l => l.y));
    await step(5, "pass", `${xs.length} columns × ${ys.length} rows = ${xs.length * ys.length} labels/sheet`);

    // Step 6 — Margins
    await step(6, "running");
    const leftM = round4(xs[0] / 72);
    const topM  = round4(ys[0] / 72);
    await step(6, "pass", `Left ${leftM}", Top ${topM}"`);

    // Step 7 — Gaps
    await step(7, "running");
    const hGap = xs.length > 1 ? round4(Math.max(0, (xs[1] - xs[0] - labels[0].w) / 72)) : 0;
    const vGap = ys.length > 1 ? round4(Math.max(0, (ys[1] - ys[0] - labels[0].h) / 72)) : 0;
    const gapDesc = hGap === 0 && vGap === 0 ? "labels touch (0 gap)" : `H gap ${hGap}", V gap ${vGap}"`;
    await step(7, "pass", gapDesc);

    // Step 8 — Corner radius
    await step(8, "running");
    const r = labels[0].r;
    const crInches = r > 0.5 ? round4(r / 72) : null;
    if (drawMode === "rect") {
      await step(8, "pass", "Square corners (PDF uses rectangle operator)");
    } else if (crInches) {
      await step(8, "pass", `${crInches}" (${Math.round(crInches * 25.4 * 10) / 10}mm) rounded corners`);
    } else {
      await step(8, "warn", "Could not determine corner radius — defaulting to square");
    }

    // Step 9 — Validate math
    await step(9, "running");
    const meas = computeMeasurements(labels, widthPts, heightPts)!;
    if (meas.passedValidation) {
      await step(9, "pass", `H: ${meas.validationH} ✓  |  V: ${meas.validationV} ✓`);
    } else {
      await step(9, "warn", `H: ${meas.validationH}  |  V: ${meas.validationV} — small rounding error, check manually`);
    }

    // Step 10 — Identify code
    await step(10, "running");
    const { code, brand, name } = inferCodeFromFilename(filename);
    meas.code = code;
    meas.brand = brand;
    meas.name = name;
    await step(10, "pass", `${brand} ${code}`);

    // Step 11 — Ready
    await step(11, "running");
    await step(11, "pass", `${xs.length * ys.length}-up sheet — ready to import`);

    fileResult.measurements = meas;
    fileResult.done = true;
    emit(job, { type: "result", file: filename, fileIndex, data: meas });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    fileResult.error = message;
    fileResult.done = true;
    emit(job, { type: "error", file: filename, fileIndex, message });
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post("/upload-pdf", upload.array("files", 20), async (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ error: "No PDF files uploaded" });
    return;
  }

  const jobId = randomUUID();
  const job: Job = {
    files: files.map(f => ({
      filename: f.originalname,
      steps: STEPS.map(label => ({ label, status: "pending" as StepStatus })),
      done: false,
    })),
    events: [],
    listeners: [],
    complete: false,
  };
  jobs.set(jobId, job);

  res.json({ jobId, fileCount: files.length, filenames: files.map(f => f.originalname) });

  // Process files sequentially in background
  (async () => {
    for (let i = 0; i < files.length; i++) {
      emit(job, { type: "file_start", file: files[i].originalname, fileIndex: i });
      await analyzeFile(job, i, files[i].originalname, files[i].buffer);
      await sleep(300);
    }
    job.complete = true;
    emit(job, { type: "done" });
    // Clean up job after 5 minutes
    setTimeout(() => jobs.delete(jobId), 5 * 60 * 1000);
  })();
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

  // Send buffered events first
  for (const event of job.events) {
    res.write(event);
  }

  if (job.complete) {
    res.end();
    return;
  }

  const listener = (event: string) => {
    res.write(event);
    if (event.includes('"type":"done"')) {
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
    const { sheets } = req.body as { sheets: ExtractedMeasurements[] };
    if (!Array.isArray(sheets) || sheets.length === 0) {
      res.status(400).json({ error: "No sheets to import" });
      return;
    }
    const inserted = await db.insert(labelSheetsTable).values(
      sheets.map(s => ({
        name: s.name,
        brand: s.brand,
        code: s.code,
        pageWidth: s.pageWidth,
        pageHeight: s.pageHeight,
        labelWidth: s.labelWidth,
        labelHeight: s.labelHeight,
        labelsAcross: s.labelsAcross,
        labelsDown: s.labelsDown,
        topMargin: s.topMargin,
        leftMargin: s.leftMargin,
        horizontalGap: s.horizontalGap,
        verticalGap: s.verticalGap,
        cornerRadius: s.cornerRadius,
        shape: s.shape,
        isCustom: false,
      }))
    ).returning();
    res.json({ imported: inserted.length, sheets: inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    res.status(500).json({ error: message });
  }
});

export default router;
