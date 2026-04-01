import { useState, useRef, useCallback } from "react";
import { 
  useGetLabelSheets, 
  useCreateLabelSheet, 
  useUpdateLabelSheet, 
  useDeleteLabelSheet,
  getGetLabelSheetsQueryKey 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  Layers, Plus, Maximize, Grip, Trash2, Edit2, ZoomIn, Download,
  Upload, FileText, CheckCircle2, XCircle, AlertTriangle,
  Loader2, ArrowRight, RotateCcw, Crosshair
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type LabelSheet = {
  id: number;
  name: string;
  brand: string;
  code: string;
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
  shape: "rectangle" | "circle" | "oval";
  cornerRadius?: number | null;
  isCustom: boolean;
  safeAreaEnabled?: boolean;
  bleedInches?: number;
  safeAreaInches?: number;
  updatedAt?: string | null;
};

function isNewSheet(updatedAt?: string | null): boolean {
  if (!updatedAt) return false;
  const today = new Date();
  const updated = new Date(updatedAt);
  return updated.toDateString() === today.toDateString();
}

type ExtractedMeasurements = {
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
};

type StepStatus = "pending" | "running" | "pass" | "fail" | "warn";

type AnalysisStep = {
  label: string;
  status: StepStatus;
  detail?: string;
};

type FileResult = {
  filename: string;
  steps: AnalysisStep[];
  measurements?: ExtractedMeasurements;
  error?: string;
  done: boolean;
};

const STEP_LABELS = [
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

// ─── SheetPreview ─────────────────────────────────────────────────────────────

function SheetPreview({ sheet }: { sheet: LabelSheet | ExtractedMeasurements }) {
  const PREVIEW_W = 480;
  const PREVIEW_H = Math.round(PREVIEW_W * (sheet.pageHeight / sheet.pageWidth));

  const scale = PREVIEW_W / sheet.pageWidth;

  const topMarginPx    = sheet.topMargin    * scale;
  const leftMarginPx   = sheet.leftMargin   * scale;
  const labelWidthPx   = sheet.labelWidth   * scale;
  const labelHeightPx  = sheet.labelHeight  * scale;
  const hGapPx         = sheet.horizontalGap * scale;
  const vGapPx         = sheet.verticalGap  * scale;

  const labels: { x: number; y: number }[] = [];
  for (let row = 0; row < sheet.labelsDown; row++) {
    for (let col = 0; col < sheet.labelsAcross; col++) {
      labels.push({
        x: leftMarginPx + col * (labelWidthPx + hGapPx),
        y: topMarginPx  + row * (labelHeightPx + vGapPx),
      });
    }
  }

  const cornerRadius = "cornerRadius" in sheet ? sheet.cornerRadius : null;
  const cornerRadiusPx = (cornerRadius ?? 0) * scale;
  const borderRadius =
    sheet.shape === "circle" ? "50%"
    : sheet.shape === "oval"  ? "50%"
    : cornerRadiusPx > 0 ? `${cornerRadiusPx}px`
    : "0px";

  const pctScale = Math.round((PREVIEW_W / (sheet.pageWidth * 96)) * 100);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative bg-white shadow-[0_4px_24px_rgba(0,0,0,0.18)] border border-gray-200 flex-shrink-0"
        style={{ width: PREVIEW_W, height: PREVIEW_H }}
      >
        <div className="absolute inset-0 bg-[#f5f5f0]" />
        {labels.map((lbl, i) => (
          <div
            key={i}
            className="absolute border border-[#9ab0cc] bg-white"
            style={{
              left:   lbl.x,
              top:    lbl.y,
              width:  labelWidthPx,
              height: labelHeightPx,
              borderRadius,
              boxSizing: "border-box",
            }}
          >
            <svg
              className="absolute inset-0 w-full h-full text-[#9ab0cc] opacity-40 pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <line x1="0" y1="50" x2="8" y2="50" strokeWidth="1.5" stroke="currentColor"/>
              <line x1="50" y1="0" x2="50" y2="8" strokeWidth="1.5" stroke="currentColor"/>
              <line x1="100" y1="50" x2="92" y2="50" strokeWidth="1.5" stroke="currentColor"/>
              <line x1="50" y1="100" x2="50" y2="92" strokeWidth="1.5" stroke="currentColor"/>
            </svg>
          </div>
        ))}
        <div className="absolute bottom-1.5 right-2 text-[9px] text-gray-400 font-mono select-none">
          {sheet.pageWidth}" × {sheet.pageHeight}"
        </div>
      </div>

      <div className="w-full max-w-[480px] rounded-lg border bg-muted/30 text-sm overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-y divide-border">
          {[
            ["Label Size",       `${sheet.labelWidth}" × ${sheet.labelHeight}"`],
            ["Shape",            sheet.shape.charAt(0).toUpperCase() + sheet.shape.slice(1)],
            ["Corner Radius",    cornerRadius ? `${cornerRadius}" (${Math.round(cornerRadius * 25.4 * 10) / 10}mm)` : 'Square corners (0")'],
            ["Labels per Sheet", `${sheet.labelsAcross * sheet.labelsDown} (${sheet.labelsAcross} × ${sheet.labelsDown})`],
            ["Page Size",        `${sheet.pageWidth}" × ${sheet.pageHeight}"`],
            ["Top Margin",       `${sheet.topMargin}"`],
            ["Left Margin",      `${sheet.leftMargin}"`],
            ["Horizontal Gap",   sheet.horizontalGap > 0 ? `${sheet.horizontalGap}"` : `0" (labels touch)`],
            ["Vertical Gap",     sheet.verticalGap > 0 ? `${sheet.verticalGap}"` : `0" (labels touch)`],
          ].map(([k, v]) => (
            <div key={k} className="px-3 py-2 border-border">
              <div className="text-muted-foreground text-xs">{k}</div>
              <div className="font-medium font-mono text-sm">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Preview shown at approximately {pctScale}% of actual size
      </p>
    </div>
  );
}

// ─── Step icon helper ─────────────────────────────────────────────────────────

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "running") return <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />;
  if (status === "pass")    return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
  if (status === "fail")    return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
  if (status === "warn")    return <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />;
  return <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />;
}

// ─── PDF Upload Modal ─────────────────────────────────────────────────────────

type UploadStage = "select" | "processing" | "review";

function PdfUploadModal({ open, onClose, onImported }: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [stage, setStage] = useState<UploadStage>("select");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileResults, setFileResults] = useState<FileResult[]>([]);
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [importSelections, setImportSelections] = useState<boolean[]>([]);
  const [editedMeasurements, setEditedMeasurements] = useState<(ExtractedMeasurements | null)[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const reset = () => {
    setStage("select");
    setFiles([]);
    setDragging(false);
    setUploading(false);
    setFileResults([]);
    setActiveFileIdx(0);
    setImportSelections([]);
    setEditedMeasurements([]);
    setImporting(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const pdfs = Array.from(incoming).filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) { toast({ title: "Only PDF files are accepted", variant: "destructive" }); return; }
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...pdfs.filter(f => !names.has(f.name))];
    });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);

    // Initialize file results
    const initial: FileResult[] = files.map(f => ({
      filename: f.name,
      steps: STEP_LABELS.map(label => ({ label, status: "pending" as StepStatus })),
      done: false,
    }));
    setFileResults(initial);
    setStage("processing");
    setActiveFileIdx(0);

    try {
      const formData = new FormData();
      files.forEach(f => formData.append("files", f));

      const uploadRes = await fetch("/api/label-sheets/upload-pdf", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { jobId } = await uploadRes.json() as { jobId: string };

      const es = new EventSource(`/api/label-sheets/analyze/${jobId}/events`);

      es.onmessage = (e) => {
        const event = JSON.parse(e.data) as {
          type: string;
          file?: string;
          fileIndex?: number;
          stepIndex?: number;
          stepLabel?: string;
          status?: StepStatus;
          detail?: string;
          data?: ExtractedMeasurements;
          message?: string;
        };

        if (event.type === "file_start") {
          setActiveFileIdx(event.fileIndex ?? 0);
        }

        if (event.type === "step" && event.fileIndex !== undefined && event.stepIndex !== undefined) {
          setFileResults(prev => {
            const next = [...prev];
            const f = { ...next[event.fileIndex!] };
            const steps = [...f.steps];
            steps[event.stepIndex!] = {
              label: event.stepLabel ?? steps[event.stepIndex!].label,
              status: event.status ?? "pending",
              detail: event.detail,
            };
            f.steps = steps;
            next[event.fileIndex!] = f;
            return next;
          });
        }

        if (event.type === "result" && event.fileIndex !== undefined && event.data) {
          setFileResults(prev => {
            const next = [...prev];
            next[event.fileIndex!] = { ...next[event.fileIndex!], measurements: event.data, done: true };
            return next;
          });
        }

        if (event.type === "error" && event.fileIndex !== undefined) {
          setFileResults(prev => {
            const next = [...prev];
            next[event.fileIndex!] = { ...next[event.fileIndex!], error: event.message, done: true };
            return next;
          });
        }

        if (event.type === "done") {
          es.close();
          setFileResults(prev => {
            const sel = prev.map(r => !!r.measurements);
            const meas = prev.map(r => r.measurements ?? null);
            setImportSelections(sel);
            setEditedMeasurements(meas);
            return prev;
          });
          setStage("review");
          setActiveFileIdx(0);
          setUploading(false);
        }
      };

      es.onerror = () => {
        es.close();
        setUploading(false);
        toast({ title: "Connection lost during analysis", variant: "destructive" });
      };
    } catch (err) {
      setUploading(false);
      toast({ title: "Upload failed", description: String(err), variant: "destructive" });
    }
  };

  const handleImport = async () => {
    const toImport = editedMeasurements.filter((m, i) => m && importSelections[i]) as ExtractedMeasurements[];
    if (toImport.length === 0) { toast({ title: "Nothing selected to import" }); return; }

    setImporting(true);
    try {
      const res = await fetch("/api/label-sheets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheets: toImport }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { imported } = await res.json() as { imported: number };
      toast({ title: `${imported} template${imported !== 1 ? "s" : ""} imported successfully` });
      onImported();
      handleClose();
    } catch (err) {
      toast({ title: "Import failed", description: String(err), variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const successCount = fileResults.filter(r => r.measurements).length;
  const doneCount    = fileResults.filter(r => r.done).length;
  const allDone      = fileResults.length > 0 && doneCount === fileResults.length;

  const currentResult = fileResults[activeFileIdx];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className={cn("max-h-[92vh] overflow-hidden flex flex-col", stage === "review" ? "max-w-[700px]" : "max-w-[560px]")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            {stage === "select" ? "Upload Template PDFs" : stage === "processing" ? "Analyzing Templates…" : "Review & Import"}
          </DialogTitle>
          <DialogDescription>
            {stage === "select"   && "Upload one or more OnlineLabels template PDF files. Measurements will be extracted automatically from the vector paths."}
            {stage === "processing" && `Processing ${files.length} file${files.length !== 1 ? "s" : ""} — running ${STEP_LABELS.length} checks per template.`}
            {stage === "review"   && `${successCount} of ${files.length} file${files.length !== 1 ? "s" : ""} analyzed successfully. Review measurements before importing.`}
          </DialogDescription>
        </DialogHeader>

        {/* ── SELECT STAGE ─────────────────────────────────────────────── */}
        {stage === "select" && (
          <div className="flex flex-col gap-4 overflow-y-auto py-2">
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
                dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/20"
              )}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Drop PDF files here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Batch upload supported — select as many OL template PDFs as needed</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                className="hidden"
                onChange={e => addFiles(e.target.files)}
              />
            </div>

            {files.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{files.length} file{files.length !== 1 ? "s" : ""} selected</p>
                {files.map((f, i) => (
                  <div key={f.name} className="flex items-center gap-2 text-sm bg-muted/30 rounded-md px-3 py-2">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate font-mono text-xs">{f.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removeFile(i)} className="ml-1 text-muted-foreground hover:text-destructive transition-colors">
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PROCESSING STAGE ─────────────────────────────────────────── */}
        {stage === "processing" && (
          <div className="flex flex-col gap-3 overflow-hidden flex-1 min-h-0">
            {/* File tabs */}
            {files.length > 1 && (
              <div className="flex gap-1.5 flex-wrap">
                {fileResults.map((fr, i) => {
                  const isDone = fr.done;
                  const hasFail = fr.error || fr.steps.some(s => s.status === "fail");
                  const hasWarn = fr.steps.some(s => s.status === "warn");
                  return (
                    <button
                      key={fr.filename}
                      onClick={() => setActiveFileIdx(i)}
                      className={cn(
                        "px-2.5 py-1 rounded text-xs font-mono transition-colors border",
                        activeFileIdx === i ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50",
                        isDone && !hasFail && !hasWarn && activeFileIdx !== i && "border-green-400/50 text-green-700",
                        isDone && hasFail && activeFileIdx !== i && "border-red-400/50 text-red-700",
                        isDone && hasWarn && !hasFail && activeFileIdx !== i && "border-yellow-400/50 text-yellow-700",
                      )}
                    >
                      {fr.filename.replace(/\.[^.]+$/, "").replace(/_\d+$/, "")}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Checklist for active file */}
            {currentResult && (
              <div className="flex-1 overflow-y-auto space-y-1">
                <p className="text-xs font-mono text-muted-foreground mb-3 truncate">{currentResult.filename}</p>
                {currentResult.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-start gap-2.5 px-3 py-2 rounded-md transition-colors text-sm",
                      step.status === "running" && "bg-blue-50 border border-blue-200",
                      step.status === "pass"    && "bg-green-50/50",
                      step.status === "fail"    && "bg-red-50 border border-red-200",
                      step.status === "warn"    && "bg-yellow-50/50",
                      step.status === "pending" && "opacity-40",
                    )}
                  >
                    <div className="mt-0.5">
                      <StepIcon status={step.status} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={cn(
                        "font-medium",
                        step.status === "running" && "text-blue-700",
                        step.status === "pass"    && "text-green-700",
                        step.status === "fail"    && "text-red-700",
                        step.status === "warn"    && "text-yellow-700",
                        step.status === "pending" && "text-muted-foreground",
                      )}>
                        {step.label}
                      </span>
                      {step.detail && (
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono break-all leading-relaxed">
                          {step.detail}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                {currentResult.error && !currentResult.steps.some(s => s.status === "fail") && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
                    <XCircle className="w-4 h-4 shrink-0" />
                    {currentResult.error}
                  </div>
                )}
              </div>
            )}

            {/* Overall progress bar */}
            {fileResults.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{doneCount}/{fileResults.length} files complete</span>
                  {allDone && <span className="text-green-600 font-medium">{successCount} ready to import</span>}
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${fileResults.length > 0 ? (doneCount / fileResults.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── REVIEW STAGE ─────────────────────────────────────────────── */}
        {stage === "review" && (
          <div className="flex flex-col gap-3 overflow-hidden flex-1 min-h-0">
            {/* File tabs */}
            {files.length > 1 && (
              <div className="flex gap-1.5 flex-wrap">
                {fileResults.map((fr, i) => (
                  <button
                    key={fr.filename}
                    onClick={() => setActiveFileIdx(i)}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs font-mono transition-colors border",
                      activeFileIdx === i ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50",
                      fr.measurements && activeFileIdx !== i && "border-green-400/50",
                      fr.error && activeFileIdx !== i && "border-red-400/50",
                    )}
                  >
                    {fr.filename.replace(/\.[^.]+$/, "").replace(/_\d+$/, "")}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-4">
              {fileResults.map((fr, i) => {
                if (i !== activeFileIdx) return null;
                const meas = editedMeasurements[i];

                if (fr.error || !fr.measurements) {
                  return (
                    <div key={i} className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      <p className="font-medium mb-1">Could not extract measurements</p>
                      <p className="text-xs">{fr.error ?? "Unknown error — try a different PDF"}</p>
                    </div>
                  );
                }

                return (
                  <div key={i} className="space-y-3">
                    {/* Editable name/code */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Template Code</Label>
                        <Input
                          className="font-mono text-sm h-8"
                          value={meas?.code ?? ""}
                          onChange={e => {
                            const next = [...editedMeasurements];
                            if (next[i]) next[i] = { ...next[i]!, code: e.target.value };
                            setEditedMeasurements(next);
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Brand</Label>
                        <Input
                          className="text-sm h-8"
                          value={meas?.brand ?? ""}
                          onChange={e => {
                            const next = [...editedMeasurements];
                            if (next[i]) next[i] = { ...next[i]!, brand: e.target.value };
                            setEditedMeasurements(next);
                          }}
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Display Name</Label>
                        <Input
                          className="text-sm h-8"
                          value={meas?.name ?? ""}
                          onChange={e => {
                            const next = [...editedMeasurements];
                            if (next[i]) next[i] = { ...next[i]!, name: e.target.value };
                            setEditedMeasurements(next);
                          }}
                        />
                      </div>
                    </div>

                    {/* Validation result */}
                    {meas && (
                      <div className={cn(
                        "rounded-md border px-3 py-2 text-xs font-mono space-y-0.5",
                        meas.passedValidation ? "border-green-300 bg-green-50 text-green-800" : "border-yellow-300 bg-yellow-50 text-yellow-800"
                      )}>
                        <div className="flex items-center gap-1.5 mb-1 font-sans font-medium text-sm">
                          {meas.passedValidation
                            ? <><CheckCircle2 className="w-4 h-4 text-green-600" /> Math validation passed</>
                            : <><AlertTriangle className="w-4 h-4 text-yellow-600" /> Math validation — review recommended</>}
                        </div>
                        <div>H: {meas.validationH}</div>
                        <div>V: {meas.validationV}</div>
                      </div>
                    )}

                    {/* Spec table */}
                    {meas && (
                      <div className="rounded-lg border bg-muted/30 text-sm overflow-hidden">
                        <div className="grid grid-cols-2 divide-x divide-y divide-border">
                          {[
                            ["Label Size",       `${meas.labelWidth}" × ${meas.labelHeight}"`],
                            ["Labels per Sheet", `${meas.labelsAcross * meas.labelsDown} (${meas.labelsAcross} × ${meas.labelsDown})`],
                            ["Page Size",        `${meas.pageWidth}" × ${meas.pageHeight}"`],
                            ["Corner Radius",    meas.cornerRadius ? `${meas.cornerRadius}" rounded` : "Square corners"],
                            ["Top Margin",       `${meas.topMargin}"`],
                            ["Left Margin",      `${meas.leftMargin}"`],
                            ["Horizontal Gap",   meas.horizontalGap > 0 ? `${meas.horizontalGap}"` : `0" (touch)`],
                            ["Vertical Gap",     meas.verticalGap   > 0 ? `${meas.verticalGap}"`   : `0" (touch)`],
                          ].map(([k, v]) => (
                            <div key={k} className="px-3 py-2 border-border">
                              <div className="text-muted-foreground text-xs">{k}</div>
                              <div className="font-medium font-mono text-sm">{v}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Import toggle */}
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={importSelections[i] ?? false}
                        onChange={e => {
                          const next = [...importSelections];
                          next[i] = e.target.checked;
                          setImportSelections(next);
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">Include this template in import</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <DialogFooter className="pt-3 border-t gap-2">
          {stage === "select" && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleUpload} disabled={files.length === 0 || uploading}>
                <ArrowRight className="w-4 h-4 mr-2" />
                Analyze {files.length > 0 ? `${files.length} file${files.length !== 1 ? "s" : ""}` : ""}
              </Button>
            </>
          )}

          {stage === "processing" && (
            <>
              <Button variant="outline" onClick={handleClose} disabled={uploading && !allDone}>Cancel</Button>
              {allDone && (
                <Button onClick={() => { setStage("review"); setActiveFileIdx(0); }}>
                  Review Results <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </>
          )}

          {stage === "review" && (
            <>
              <Button variant="outline" onClick={reset} className="mr-auto">
                <RotateCcw className="w-4 h-4 mr-2" /> Start Over
              </Button>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleImport}
                disabled={importing || importSelections.filter(Boolean).length === 0}
              >
                {importing
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing…</>
                  : <>Import {importSelections.filter(Boolean).length} Template{importSelections.filter(Boolean).length !== 1 ? "s" : ""}</>
                }
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main LabelSheets page ────────────────────────────────────────────────────

export default function LabelSheets() {
  const { data: sheets, isLoading } = useGetLabelSheets({ query: { queryKey: getGetLabelSheetsQueryKey() } });
  const [isDialogOpen, setIsDialogOpen]       = useState(false);
  const [previewSheet, setPreviewSheet]        = useState<LabelSheet | null>(null);
  const [editingId, setEditingId]              = useState<number | null>(null);
  const [isPdfUploadOpen, setIsPdfUploadOpen]  = useState(false);
  const { toast }    = useToast();
  const queryClient  = useQueryClient();

  const createMutation = useCreateLabelSheet({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetLabelSheetsQueryKey() });
        toast({ title: "Label sheet created" });
        setIsDialogOpen(false);
      }
    }
  });

  const updateMutation = useUpdateLabelSheet({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetLabelSheetsQueryKey() });
        toast({ title: "Label sheet updated" });
        setIsDialogOpen(false);
      }
    }
  });

  const deleteMutation = useDeleteLabelSheet({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetLabelSheetsQueryKey() });
        toast({ title: "Label sheet deleted" });
      }
    }
  });

  const [formData, setFormData] = useState({
    name: "",
    brand: "OnlineLabels",
    code: "",
    pageWidth: 8.5,
    pageHeight: 11,
    labelWidth: 2,
    labelHeight: 2,
    labelsAcross: 4,
    labelsDown: 5,
    topMargin: 0.5,
    leftMargin: 0.25,
    horizontalGap: 0,
    verticalGap: 0,
    shape: "rectangle" as "rectangle" | "circle" | "oval",
    cornerRadius: null as number | null,
    safeAreaEnabled: false,
    bleedInches: 0.125,
    safeAreaInches: 0.125,
  });

  const handleEdit = (sheet: LabelSheet) => {
    setFormData({
      name: sheet.name,
      brand: sheet.brand,
      code: sheet.code,
      pageWidth: sheet.pageWidth,
      pageHeight: sheet.pageHeight,
      labelWidth: sheet.labelWidth,
      labelHeight: sheet.labelHeight,
      labelsAcross: sheet.labelsAcross,
      labelsDown: sheet.labelsDown,
      topMargin: sheet.topMargin,
      leftMargin: sheet.leftMargin,
      horizontalGap: sheet.horizontalGap,
      verticalGap: sheet.verticalGap,
      shape: sheet.shape,
      cornerRadius: sheet.cornerRadius ?? null,
      safeAreaEnabled: sheet.safeAreaEnabled ?? false,
      bleedInches: sheet.bleedInches ?? 0.125,
      safeAreaInches: sheet.safeAreaInches ?? 0.125,
    });
    setEditingId(sheet.id);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setFormData({
      name: "",
      brand: "Custom",
      code: "",
      pageWidth: 8.5,
      pageHeight: 11,
      labelWidth: 2,
      labelHeight: 2,
      labelsAcross: 4,
      labelsDown: 5,
      topMargin: 0.5,
      leftMargin: 0.25,
      horizontalGap: 0,
      verticalGap: 0,
      shape: "rectangle",
      cornerRadius: null as number | null,
      safeAreaEnabled: false,
      bleedInches: 0.125,
      safeAreaInches: 0.125,
    });
    setEditingId(null);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cr = formData.cornerRadius;
    const payload = {
      ...formData,
      pageWidth:      Number(formData.pageWidth),
      pageHeight:     Number(formData.pageHeight),
      labelWidth:     Number(formData.labelWidth),
      labelHeight:    Number(formData.labelHeight),
      labelsAcross:   Number(formData.labelsAcross),
      labelsDown:     Number(formData.labelsDown),
      topMargin:      Number(formData.topMargin),
      leftMargin:     Number(formData.leftMargin),
      horizontalGap:  Number(formData.horizontalGap),
      verticalGap:    Number(formData.verticalGap),
      cornerRadius:   (cr !== null && String(cr) !== "" && Number(cr) > 0) ? Number(cr) : null,
      safeAreaEnabled: formData.safeAreaEnabled,
      bleedInches:    Number(formData.bleedInches),
      safeAreaInches: Number(formData.safeAreaInches),
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Label Sheets</h1>
          <p className="text-muted-foreground mt-1">Manage physical paper dimensions and templates.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsPdfUploadOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload Template PDF
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Add Custom Sheet
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          [1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse h-64 border-muted" />
          ))
        ) : sheets?.map((sheet) => (
          <Card key={sheet.id} className="flex flex-col overflow-hidden hover:shadow-md transition-shadow group">
            <CardHeader className="bg-secondary/40 pb-4">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    <Badge variant="outline" className="bg-background">{sheet.brand}</Badge>
                    {isNewSheet((sheet as LabelSheet).updatedAt) && (
                      <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px] px-1.5 py-0 leading-4 font-semibold uppercase tracking-wide">
                        New
                      </Badge>
                    )}
                    {(sheet as LabelSheet).safeAreaEnabled && (
                      <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-[10px] px-1.5 py-0 leading-4 font-semibold uppercase tracking-wide gap-1">
                        <Crosshair className="w-2.5 h-2.5" /> SA
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg leading-snug">{sheet.name}</CardTitle>
                  <CardDescription className="font-mono mt-1">{sheet.code}</CardDescription>
                </div>

                <button
                  onClick={() => setPreviewSheet(sheet as LabelSheet)}
                  className="relative w-12 h-16 bg-white border shadow-sm rounded-sm p-1 flex-shrink-0 hover:shadow-md hover:border-primary/50 transition-all group/thumb focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                  title="Preview sheet layout"
                  aria-label={`Preview layout for ${sheet.name}`}
                >
                  <div className="w-full h-full border border-dashed border-gray-300 rounded-[1px] relative overflow-hidden">
                    <div
                      className="absolute inset-0 m-0.5 grid gap-px opacity-40"
                      style={{
                        gridTemplateColumns: `repeat(${sheet.labelsAcross}, 1fr)`,
                        gridTemplateRows:    `repeat(${sheet.labelsDown}, 1fr)`,
                      }}
                    >
                      {Array.from({ length: Math.min(sheet.labelsAcross * sheet.labelsDown, 50) }).map((_, i) => (
                        <div
                          key={i}
                          className={`bg-primary ${sheet.shape === "circle" ? "rounded-full" : "rounded-[1px]"}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover/thumb:opacity-100 transition-opacity rounded-sm flex items-center justify-center">
                    <ZoomIn className="w-4 h-4 text-primary" />
                  </div>
                </button>
              </div>
            </CardHeader>

            <CardContent className="py-4 flex-1">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground flex items-center gap-1.5 mb-1">
                    <Maximize className="w-3.5 h-3.5" /> Dimensions
                  </div>
                  <div className="font-medium">{sheet.labelWidth}" × {sheet.labelHeight}"</div>
                  <div className="text-xs text-muted-foreground mt-0.5 capitalize">{sheet.shape}</div>
                </div>
                <div>
                  <div className="text-muted-foreground flex items-center gap-1.5 mb-1">
                    <Grip className="w-3.5 h-3.5" /> Layout
                  </div>
                  <div className="font-medium">{sheet.labelsAcross} × {sheet.labelsDown}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {sheet.labelsAcross * sheet.labelsDown} labels/sheet
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="bg-secondary/10 border-t py-3 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(sheet as LabelSheet)}>
                  <Edit2 className="w-4 h-4 mr-2" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => { window.location.href = `/api/label-sheets/${sheet.id}/pdf`; }}
                  title="Download PDF template"
                >
                  <Download className="w-4 h-4 mr-2" /> PDF
                </Button>
              </div>
              {sheet.isCustom && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (window.confirm("Delete this label sheet?")) {
                      deleteMutation.mutate({ id: sheet.id });
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* ── PDF Upload Modal ───────────────────────────────────────────────── */}
      <PdfUploadModal
        open={isPdfUploadOpen}
        onClose={() => setIsPdfUploadOpen(false)}
        onImported={() => queryClient.invalidateQueries({ queryKey: getGetLabelSheetsQueryKey() })}
      />

      {/* ── Sheet Preview Modal ───────────────────────────────────────────────── */}
      <Dialog open={!!previewSheet} onOpenChange={(open) => { if (!open) setPreviewSheet(null); }}>
        <DialogContent className="max-w-[600px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-xl">{previewSheet?.name}</DialogTitle>
                <DialogDescription className="font-mono mt-0.5">{previewSheet?.brand} · {previewSheet?.code}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {previewSheet && (
            <div className="py-2">
              <SheetPreview sheet={previewSheet} />
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => previewSheet && handleEdit(previewSheet)}>
              <Edit2 className="w-4 h-4 mr-2" /> Edit Specs
            </Button>
            <Button onClick={() => setPreviewSheet(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create / Edit Modal ───────────────────────────────────────────────── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingId ? "Edit Label Sheet" : "New Custom Label Sheet"}</DialogTitle>
            <DialogDescription>
              Enter the exact measurements from the manufacturer's spec sheet. All measurements in inches.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 py-4 overflow-y-auto flex-1 pr-1">
              <div className="col-span-2 md:col-span-1 space-y-2">
                <Label>Brand/Manufacturer</Label>
                <Input value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} required />
              </div>
              <div className="col-span-2 md:col-span-1 space-y-2">
                <Label>Template Code</Label>
                <Input value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} required />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Descriptive Name</Label>
                <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. OL5225 - Rectangle Labels 2×1.25 (32-up)" required />
              </div>

              <div className="col-span-2 border-t pt-4 mt-2">
                <h4 className="text-sm font-medium mb-4">Label Specifications</h4>
              </div>

              <div className="space-y-2">
                <Label>Shape</Label>
                <Select
                  value={formData.shape}
                  onValueChange={(v: any) => setFormData({
                    ...formData,
                    shape: v,
                    cornerRadius: v !== "rectangle" ? null : formData.cornerRadius,
                  })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rectangle">Rectangle</SelectItem>
                    <SelectItem value="circle">Circle</SelectItem>
                    <SelectItem value="oval">Oval (ellipse die-cut)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Oval = ellipse-shaped die-cut (not rounded corners — use Corner Radius below for that)
                </p>
              </div>
              <div className="space-y-2">
                <Label>
                  Corner Radius (in)
                  {formData.shape !== "rectangle" && (
                    <span className="ml-1.5 text-muted-foreground font-normal text-xs">— n/a for {formData.shape}</span>
                  )}
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="0 = square corners"
                  disabled={formData.shape !== "rectangle"}
                  value={formData.cornerRadius ?? ""}
                  onChange={e => setFormData({
                    ...formData,
                    cornerRadius: e.target.value === "" ? null : Number(e.target.value),
                  })}
                />
                {formData.cornerRadius && Number(formData.cornerRadius) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    = {(Number(formData.cornerRadius) * 25.4).toFixed(2)} mm
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Label Width (in)</Label>
                <Input type="number" step="0.001" value={formData.labelWidth} onChange={e => setFormData({...formData, labelWidth: e.target.value as any})} required />
              </div>
              <div className="space-y-2">
                <Label>Label Height (in)</Label>
                <Input type="number" step="0.001" value={formData.labelHeight} onChange={e => setFormData({...formData, labelHeight: e.target.value as any})} required />
              </div>

              <div className="space-y-2">
                <Label>Labels Across (Columns)</Label>
                <Input type="number" value={formData.labelsAcross} onChange={e => setFormData({...formData, labelsAcross: e.target.value as any})} required />
              </div>
              <div className="space-y-2">
                <Label>Labels Down (Rows)</Label>
                <Input type="number" value={formData.labelsDown} onChange={e => setFormData({...formData, labelsDown: e.target.value as any})} required />
              </div>

              <div className="col-span-2 border-t pt-4 mt-2">
                <h4 className="text-sm font-medium mb-4">Page & Margins</h4>
              </div>

              <div className="space-y-2">
                <Label>Top Margin (in)</Label>
                <Input type="number" step="0.001" value={formData.topMargin} onChange={e => setFormData({...formData, topMargin: e.target.value as any})} required />
              </div>
              <div className="space-y-2">
                <Label>Left Margin (in)</Label>
                <Input type="number" step="0.001" value={formData.leftMargin} onChange={e => setFormData({...formData, leftMargin: e.target.value as any})} required />
              </div>

              <div className="space-y-2">
                <Label>Horizontal Gap (in)</Label>
                <Input type="number" step="0.001" value={formData.horizontalGap} onChange={e => setFormData({...formData, horizontalGap: e.target.value as any})} required />
              </div>
              <div className="space-y-2">
                <Label>Vertical Gap (in)</Label>
                <Input type="number" step="0.001" value={formData.verticalGap} onChange={e => setFormData({...formData, verticalGap: e.target.value as any})} required />
              </div>

              <div className="space-y-2">
                <Label>Page Width (in)</Label>
                <Input type="number" step="0.01" value={formData.pageWidth} onChange={e => setFormData({...formData, pageWidth: e.target.value as any})} required />
              </div>
              <div className="space-y-2">
                <Label>Page Height (in)</Label>
                <Input type="number" step="0.01" value={formData.pageHeight} onChange={e => setFormData({...formData, pageHeight: e.target.value as any})} required />
              </div>

              <div className="col-span-2 border-t pt-4 mt-2">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-sm font-medium flex items-center gap-1.5">
                    <Crosshair className="w-3.5 h-3.5 text-blue-500" />
                    Print Safe Area &amp; Bleed
                  </h4>
                  <Switch
                    checked={formData.safeAreaEnabled}
                    onCheckedChange={(v) => setFormData({ ...formData, safeAreaEnabled: v })}
                  />
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  When on, visual guide overlays are shown in the template editor. Off by default.
                </p>
              </div>

              <div className={cn("space-y-2 transition-opacity", !formData.safeAreaEnabled && "opacity-40 pointer-events-none")}>
                <Label>
                  Bleed (in)
                  <span className="ml-1 text-muted-foreground font-normal text-xs">— extra ink beyond cut line</span>
                </Label>
                <Input
                  type="number"
                  step="0.0625"
                  min="0"
                  value={formData.bleedInches}
                  onChange={e => setFormData({ ...formData, bleedInches: Number(e.target.value) })}
                  disabled={!formData.safeAreaEnabled}
                />
                <p className="text-xs text-muted-foreground">
                  Typical: 0.125" (⅛"). = {(Number(formData.bleedInches) * 25.4).toFixed(2)} mm
                </p>
              </div>
              <div className={cn("space-y-2 transition-opacity", !formData.safeAreaEnabled && "opacity-40 pointer-events-none")}>
                <Label>
                  Text Live Area (in)
                  <span className="ml-1 text-muted-foreground font-normal text-xs">— safe margin from cut inward</span>
                </Label>
                <Input
                  type="number"
                  step="0.0625"
                  min="0"
                  value={formData.safeAreaInches}
                  onChange={e => setFormData({ ...formData, safeAreaInches: Number(e.target.value) })}
                  disabled={!formData.safeAreaEnabled}
                />
                <p className="text-xs text-muted-foreground">
                  Typical: 0.125" (⅛"). = {(Number(formData.safeAreaInches) * 25.4).toFixed(2)} mm
                </p>
              </div>
            </div>
            <DialogFooter className="shrink-0 pt-4 mt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit">{editingId ? "Update Sheet" : "Create Sheet"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
