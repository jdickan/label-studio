import { useGetDashboardStats, useGetRecentPrintJobs, useGetProductsByType, getGetDashboardStatsQueryKey, getGetRecentPrintJobsQueryKey, getGetProductsByTypeQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import PageWrapper from "@/components/layout/page-wrapper";
import { Layers, Package, Printer, FileText, Droplets, Flame, Wind, LayoutTemplate, Sparkles, Upload, CheckCircle2, Loader2, AlertTriangle, XCircle, Clock, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

type StepStatus = "pending" | "running" | "pass" | "warn" | "fail";

interface AnalysisStepState {
  label: string;
  status: StepStatus;
  detail?: string;
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
  textAlign: string;
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

const STEPS_COUNT = 12;

// ─── Step icon ────────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "pass") return <CheckCircle2 className="w-4 h-4 shrink-0 text-green-500" />;
  if (status === "warn") return <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />;
  if (status === "fail") return <XCircle className="w-4 h-4 shrink-0 text-destructive" />;
  if (status === "running") return <Loader2 className="w-4 h-4 shrink-0 text-primary animate-spin" />;
  return <Clock className="w-4 h-4 shrink-0 text-muted-foreground/40" />;
}

// ─── Analysis Progress Modal ───────────────────────────────────────────────────

function AnalysisProgressModal({
  open,
  filename,
  steps,
  onClose,
}: {
  open: boolean;
  filename: string;
  steps: AnalysisStepState[];
  onClose?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose ? () => onClose() : undefined}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Analyzing label design
          </DialogTitle>
          <p className="text-sm text-muted-foreground truncate">{filename}</p>
        </DialogHeader>
        <ScrollArea className="max-h-96">
          <div className="space-y-2 py-2 pr-3">
            {steps.map((s, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <StepIcon status={s.status} />
                <div className="flex-1 min-w-0">
                  <span className={cn(
                    "block",
                    s.status === "pass" ? "text-foreground" :
                    s.status === "warn" ? "text-amber-700 dark:text-amber-400" :
                    s.status === "fail" ? "text-destructive" :
                    s.status === "running" ? "text-foreground font-medium" :
                    "text-muted-foreground"
                  )}>
                    {s.label}
                  </span>
                  {s.detail && (
                    <span className="block text-xs text-muted-foreground mt-0.5 truncate">{s.detail}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Color Swatch ─────────────────────────────────────────────────────────────

function ColorSwatch({ color, size = "md" }: { color: string; size?: "sm" | "md" }) {
  return (
    <div
      className={cn(
        "rounded border border-border flex-shrink-0",
        size === "sm" ? "w-5 h-5" : "w-8 h-8"
      )}
      style={{ backgroundColor: color }}
      title={color}
    />
  );
}

// ─── Review & Confirm Dialog ───────────────────────────────────────────────────

interface ReviewDialogProps {
  open: boolean;
  result: MagicUploadResult;
  filename: string;
  onClose: () => void;
  onImportSuccess: (templateId: number) => void;
}

function ReviewConfirmDialog({ open, result, filename, onClose, onImportSuccess }: ReviewDialogProps) {
  const { toast } = useToast();

  const [widthInches, setWidthInches] = useState(String(result.dimensions.widthInches));
  const [heightInches, setHeightInches] = useState(String(result.dimensions.heightInches));
  const [bgColor, setBgColor] = useState(result.backgroundColor);
  const [brandName, setBrandName] = useState(result.brandName);
  const [websiteUrl, setWebsiteUrl] = useState(result.websiteUrl);
  const [productType, setProductType] = useState(result.productType);
  const [isMasterTemplate, setIsMasterTemplate] = useState(false);
  const [zoneEnabled, setZoneEnabled] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    result.zones.forEach((z) => { init[z.id] = true; });
    return init;
  });
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoFilename, setLogoFilename] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState<{ templateId: number } | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLogoDataUrl(ev.target?.result as string);
      setLogoFilename(file.name);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLogoDataUrl(ev.target?.result as string);
      setLogoFilename(file.name);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const templateName = filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") + " (Magic Import)";
  const enabledZones = result.zones.filter((z) => zoneEnabled[z.id]);

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/magic-upload/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName,
          zones: enabledZones,
          dimensions: {
            widthInches: parseFloat(widthInches) || result.dimensions.widthInches,
            heightInches: parseFloat(heightInches) || result.dimensions.heightInches,
          },
          backgroundColor: bgColor,
          brandName,
          websiteUrl,
          address: result.address,
          primaryColor: result.dominantColors[0] ?? undefined,
          dominantColors: result.dominantColors,
          productType,
          isMasterTemplate,
          logoDataUrl: logoDataUrl ?? undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Import failed" }));
        throw new Error(err.error ?? "Import failed");
      }

      const data = await res.json() as { template: { id: number } };
      setSuccess({ templateId: data.template.id });
      onImportSuccess(data.template.id);
      toast({ title: "Label imported successfully", description: `Template "${templateName}" created.` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      toast({ title: "Import failed", description: message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={success ? onClose : undefined}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Review & Confirm Import
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8">
            <CheckCircle2 className="w-16 h-16 text-green-500" />
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-1">Label imported successfully</h3>
              <p className="text-muted-foreground text-sm">Template "{templateName}" is ready to use.</p>
            </div>
            <div className="flex gap-3">
              <Button asChild variant="default">
                <Link href={`/zones`}>
                  <LayoutTemplate className="w-4 h-4 mr-2" /> View Zone Template
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/design-system">
                  <ExternalLink className="w-4 h-4 mr-2" /> Branding Page
                </Link>
              </Button>
            </div>
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-6 pb-2">

                {/* Thumbnail + Basic Info */}
                <div className="flex gap-4 items-start">
                  <img
                    src={result.thumbnailDataUrl}
                    alt="Uploaded label"
                    className="w-32 h-auto rounded-lg border object-contain bg-muted"
                    style={{ maxHeight: 128 }}
                  />
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium truncate">{filename}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{result.layoutPattern.replace(/_/g, " ")}</Badge>
                      <Badge variant="secondary">{result.aestheticTag}</Badge>
                      <Badge variant="secondary">{result.fontStyle} font</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{result.zones.length} zones detected</p>
                  </div>
                </div>

                {/* Label Dimensions */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Label Dimensions</h4>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground w-12 shrink-0">Width</Label>
                    <Input
                      type="number"
                      step="0.125"
                      min="0.5"
                      max="20"
                      value={widthInches}
                      onChange={(e) => setWidthInches(e.target.value)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">in</span>
                    <span className="text-muted-foreground mx-1">×</span>
                    <Label className="text-xs text-muted-foreground w-14 shrink-0">Height</Label>
                    <Input
                      type="number"
                      step="0.125"
                      min="0.5"
                      max="20"
                      value={heightInches}
                      onChange={(e) => setHeightInches(e.target.value)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">in</span>
                  </div>
                </div>

                {/* Background Color */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Background Color</h4>
                  <div className="flex items-center gap-3">
                    <ColorSwatch color={bgColor} />
                    <Input
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-36 font-mono text-sm"
                      placeholder="#ffffff"
                    />
                  </div>
                </div>

                {/* Zones */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Detected Zones</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                    {result.zones.map((zone) => (
                      <div key={zone.id} className="flex items-center gap-3 text-sm">
                        <Switch
                          checked={!!zoneEnabled[zone.id]}
                          onCheckedChange={(v) => setZoneEnabled((prev) => ({ ...prev, [zone.id]: v }))}
                        />
                        <Badge variant="outline" className="text-xs shrink-0">{zone.role}</Badge>
                        <span className="flex-1 truncate text-muted-foreground text-xs">
                          {zone.text || <em className="opacity-50">no text</em>}
                        </span>
                        <ColorSwatch color={zone.color} size="sm" />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{enabledZones.length} of {result.zones.length} zones will be imported</p>
                </div>

                {/* Brand Elements */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Brand Elements</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Brand Name</Label>
                      <Input
                        value={brandName}
                        onChange={(e) => setBrandName(e.target.value)}
                        placeholder="Your Brand"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Website URL</Label>
                      <Input
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        placeholder="https://yourbrand.com"
                      />
                    </div>
                  </div>

                  {/* Color palette */}
                  {result.dominantColors.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Detected Color Palette</Label>
                      <div className="flex gap-2 flex-wrap">
                        {result.dominantColors.map((c, i) => (
                          <div key={i} className="flex flex-col items-center gap-1">
                            <ColorSwatch color={c} />
                            <span className="text-xs text-muted-foreground font-mono">{c}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Product Type */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Product Type</h4>
                  <Select value={productType} onValueChange={setProductType}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="soy_candle">Soy Candle</SelectItem>
                      <SelectItem value="room_spray">Room Spray</SelectItem>
                      <SelectItem value="room_diffuser">Room Diffuser</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Logo Upload */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Brand Logo (optional)</h4>
                  {logoDataUrl ? (
                    <div className="flex items-center gap-3">
                      <img src={logoDataUrl} alt="Logo preview" className="h-12 w-auto object-contain rounded border" />
                      <div>
                        <p className="text-sm font-medium truncate max-w-48">{logoFilename}</p>
                        <button className="text-xs text-muted-foreground hover:text-destructive" onClick={() => { setLogoDataUrl(null); setLogoFilename(null); }}>Remove</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors hover:border-primary/60 hover:bg-muted/30"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleLogoDrop}
                      onClick={() => logoInputRef.current?.click()}
                    >
                      <Upload className="w-6 h-6 mx-auto mb-1 text-muted-foreground/50" />
                      <p className="text-xs text-muted-foreground">Drop a PNG or SVG logo, or click to browse</p>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/svg+xml"
                        className="hidden"
                        onChange={handleLogoFile}
                      />
                    </div>
                  )}
                </div>

                {/* Master Template Toggle */}
                <TooltipProvider>
                  <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                    <Switch
                      id="master-template"
                      checked={isMasterTemplate}
                      onCheckedChange={setIsMasterTemplate}
                    />
                    <div className="flex-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Label htmlFor="master-template" className="text-sm font-medium cursor-pointer underline decoration-dotted">
                            Set as master design template
                          </Label>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          When enabled, this template will be saved as the default starting point for all new label designs. You can change the master template at any time from the Zones page.
                        </TooltipContent>
                      </Tooltip>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Mark this template as the default for new label designs
                      </p>
                    </div>
                  </div>
                </TooltipProvider>

              </div>
            </ScrollArea>

            <DialogFooter className="pt-2 border-t">
              <Button variant="ghost" onClick={onClose} disabled={importing}>Cancel</Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing…</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" /> Confirm & Import</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Magic Upload Hero ─────────────────────────────────────────────────────────

function MagicUploadHero({ onImportSuccess }: { onImportSuccess: (templateId: number) => void }) {
  const [dragging, setDragging] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [filename, setFilename] = useState("");
  const [steps, setSteps] = useState<AnalysisStepState[]>([]);
  const [result, setResult] = useState<MagicUploadResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const initSteps = (): AnalysisStepState[] =>
    Array.from({ length: STEPS_COUNT }, (_, i) => ({
      label: [
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
      ][i],
      status: "pending" as StepStatus,
    }));

  const processFile = useCallback(async (file: File) => {
    if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type)) {
      toast({ title: "Unsupported file", description: "Please upload a JPEG, PNG, or PDF file.", variant: "destructive" });
      return;
    }

    setFilename(file.name);
    setSteps(initSteps());
    setResult(null);
    setAnalysisOpen(true);
    setReviewOpen(false);

    // Upload file to get job ID
    const formData = new FormData();
    formData.append("file", file);

    let jobId: string;
    try {
      const uploadRes = await fetch("/api/magic-upload/analyze", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const data = await uploadRes.json() as { jobId: string };
      jobId = data.jobId;
    } catch {
      toast({ title: "Upload failed", description: "Could not start analysis.", variant: "destructive" });
      setAnalysisOpen(false);
      return;
    }

    // Stream SSE events
    const evtSource = new EventSource(`/api/magic-upload/analyze/${jobId}/events`);

    evtSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as {
          type: string;
          stepIndex?: number;
          stepLabel?: string;
          status?: StepStatus;
          detail?: string;
          data?: MagicUploadResult;
          message?: string;
        };

        if (event.type === "step" && typeof event.stepIndex === "number") {
          setSteps((prev) => {
            const updated = [...prev];
            updated[event.stepIndex!] = {
              label: event.stepLabel ?? updated[event.stepIndex!].label,
              status: event.status ?? "pending",
              detail: event.detail,
            };
            return updated;
          });
        } else if (event.type === "result" && event.data) {
          setResult(event.data);
          // Mark remaining steps as pass
          setSteps((prev) => prev.map((s) => s.status === "pending" ? { ...s, status: "pass" as StepStatus } : s));
          evtSource.close();
          setTimeout(() => {
            setAnalysisOpen(false);
            setReviewOpen(true);
          }, 500);
        } else if (event.type === "error") {
          evtSource.close();
          setSteps((prev) => prev.map((s) => s.status === "running" ? { ...s, status: "fail" as StepStatus, detail: event.message } : s));
          setTimeout(() => {
            setAnalysisOpen(false);
            toast({ title: "Analysis failed", description: event.message ?? "Unknown error", variant: "destructive" });
          }, 1000);
        }
      } catch {
        // ignore parse errors
      }
    };

    evtSource.onerror = () => {
      evtSource.close();
      setSteps((prev) => prev.map((s) => s.status === "running" ? { ...s, status: "fail" as StepStatus } : s));
      setTimeout(() => {
        setAnalysisOpen(false);
        toast({ title: "Analysis interrupted", description: "Connection to the analysis server was lost.", variant: "destructive" });
      }, 500);
    };
  }, [toast]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <>
      <Card className="border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/3 hover:border-primary/40 transition-colors">
        <CardContent className="p-0">
          <div
            className={cn(
              "rounded-xl p-8 text-center cursor-pointer transition-all",
              dragging ? "bg-primary/10 border-primary scale-[1.005]" : ""
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <div className="flex items-center justify-center mb-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background border-2 border-primary/20 flex items-center justify-center">
                  <Upload className="w-3 h-3 text-primary" />
                </div>
              </div>
            </div>
            <h2 className="text-xl font-semibold mb-1">Import your existing label design</h2>
            <p className="text-muted-foreground text-sm mb-3 max-w-md mx-auto">
              Upload a label image and AI will extract zones, dimensions, brand elements, and colors — ready to import in seconds.
            </p>
            <p className="text-xs text-muted-foreground mb-5">Accepts JPEG, PNG, PDF · Max 20 MB</p>
            <Button
              type="button"
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            >
              <Upload className="w-4 h-4 mr-2" />
              Choose file to analyze
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }}
            />
          </div>
        </CardContent>
      </Card>

      <AnalysisProgressModal
        open={analysisOpen}
        filename={filename}
        steps={steps}
        onClose={() => setAnalysisOpen(false)}
      />

      {result && reviewOpen && (
        <ReviewConfirmDialog
          open={reviewOpen}
          result={result}
          filename={filename}
          onClose={() => setReviewOpen(false)}
          onImportSuccess={onImportSuccess}
        />
      )}
    </>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: stats, isLoading: isStatsLoading } = useGetDashboardStats({ query: { queryKey: getGetDashboardStatsQueryKey() } });
  const { data: recentJobs, isLoading: isJobsLoading } = useGetRecentPrintJobs({ query: { queryKey: getGetRecentPrintJobsQueryKey() } });
  const { data: productsByType, isLoading: isTypesLoading } = useGetProductsByType({ query: { queryKey: getGetProductsByTypeQueryKey() } });

  const getProductTypeIcon = (type: string) => {
    switch (type) {
      case "soy_candle": return <Flame className="w-4 h-4" />;
      case "room_spray": return <Droplets className="w-4 h-4" />;
      case "room_diffuser": return <Wind className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  const formatProductType = (type: string) => {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-muted text-muted-foreground";
      case "ready": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "printed": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <PageWrapper>
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Magic Upload Hero */}
      <MagicUploadHero
        onImportSuccess={(templateId) => {
          // success handled in dialog
        }}
      />

      {isStatsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/4 mt-2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Products</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalProducts}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.activeProducts} active
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Print Jobs</CardTitle>
              <Printer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalPrintJobs}</div>
              <p className="text-xs text-muted-foreground mt-1">
                This month
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Labels Printed</CardTitle>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.labelsThisMonth}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Across {stats.sheetsThisMonth} sheets this month
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Label Templates</CardTitle>
              <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalLabelTemplates}</div>
              <p className="text-xs text-muted-foreground mt-1">
                On {stats.totalLabelSheets} sheets
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Print Jobs</CardTitle>
                <CardDescription>Your latest printing activity.</CardDescription>
              </div>
              <Link href="/print-jobs" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {isJobsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse"></div>)}
                </div>
              ) : recentJobs && recentJobs.length > 0 ? (
                <div className="space-y-4">
                  {recentJobs.map(job => (
                    <div key={job.id} className="flex items-center justify-between p-3 border rounded-md hover:bg-secondary/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          <Printer className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-medium">{job.name}</div>
                          <div className="text-sm text-muted-foreground">{job.labelSheetName} ({job.totalLabels} labels)</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                          <div className="text-sm font-medium">{format(new Date(job.createdAt), "MMM d, yyyy")}</div>
                          <div className="text-xs text-muted-foreground">{format(new Date(job.createdAt), "h:mm a")}</div>
                        </div>
                        <Badge variant="secondary" className={getStatusColor(job.status)}>
                          {job.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground flex flex-col items-center">
                  <FileText className="w-10 h-10 mb-3 opacity-20" />
                  <p>No print jobs found.</p>
                  <Link href="/print-jobs" className="text-primary hover:underline mt-2 text-sm">Create your first print job</Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Products by Type</CardTitle>
              <CardDescription>Inventory breakdown.</CardDescription>
            </CardHeader>
            <CardContent>
              {isTypesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted rounded animate-pulse"></div>)}
                </div>
              ) : productsByType && productsByType.length > 0 ? (
                <div className="space-y-4">
                  {productsByType.map((pt, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-muted-foreground">
                          {getProductTypeIcon(pt.productType)}
                        </div>
                        <span className="font-medium text-sm">{formatProductType(pt.productType)}</span>
                      </div>
                      <div className="font-mono text-sm font-medium">
                        {pt.count}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No products found.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    </PageWrapper>
  );
}
