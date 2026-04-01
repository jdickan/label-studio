import { useState, useRef, useCallback, useEffect } from "react";
import {
  useGetLabelTemplates,
  useGetLabelSheets,
  useGetDesignSystem,
  useCreateLabelTemplate,
  useUpdateLabelTemplate,
  useDeleteLabelTemplate,
  getGetLabelTemplatesQueryKey,
  getGetDesignSystemQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  LayoutTemplate, Plus, Save, Trash2, Upload, CheckCircle2,
  Circle, Loader2, ChevronDown, ChevronUp, AlertCircle, X,
  AlignLeft, AlignCenter, AlignRight, ImagePlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ZoneRole =
  | "brand-name" | "product-name" | "scent-notes" | "product-type"
  | "weight-volume" | "address" | "website" | "disclaimer"
  | "date" | "photo-area" | "logo-area" | "decorative-bar";

type Zone = {
  id: string;
  role: ZoneRole;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  fontSize: number;
  textAlign: "left" | "center" | "right";
};

type AnalysisStep = {
  label: string;
  status: "pending" | "running" | "done" | "error";
};

const ZONE_ROLES: { value: ZoneRole; label: string }[] = [
  { value: "brand-name", label: "Brand Name" },
  { value: "product-name", label: "Product Name" },
  { value: "scent-notes", label: "Scent Notes" },
  { value: "product-type", label: "Product Type" },
  { value: "weight-volume", label: "Weight / Volume" },
  { value: "address", label: "Address" },
  { value: "website", label: "Website" },
  { value: "disclaimer", label: "Disclaimer" },
  { value: "date", label: "Date" },
  { value: "photo-area", label: "Photo Area" },
  { value: "logo-area", label: "Logo Area" },
  { value: "decorative-bar", label: "Decorative Bar" },
];

const REQUIRED_ROLES: ZoneRole[] = ["product-name"];

const ROLE_STYLE: Record<ZoneRole, { bg: string; border: string; text: string }> = {
  "brand-name":     { bg: "bg-sky-100/80",      border: "border-sky-500",     text: "text-sky-800"     },
  "product-name":   { bg: "bg-violet-100/80",   border: "border-violet-500",  text: "text-violet-800"  },
  "scent-notes":    { bg: "bg-purple-100/80",   border: "border-purple-500",  text: "text-purple-800"  },
  "product-type":   { bg: "bg-indigo-100/80",   border: "border-indigo-500",  text: "text-indigo-800"  },
  "weight-volume":  { bg: "bg-orange-100/80",   border: "border-orange-500",  text: "text-orange-800"  },
  "address":        { bg: "bg-amber-100/80",    border: "border-amber-500",   text: "text-amber-800"   },
  "website":        { bg: "bg-teal-100/80",     border: "border-teal-500",    text: "text-teal-800"    },
  "disclaimer":     { bg: "bg-gray-100/80",     border: "border-gray-500",    text: "text-gray-700"    },
  "date":           { bg: "bg-slate-100/80",    border: "border-slate-400",   text: "text-slate-700"   },
  "photo-area":     { bg: "bg-green-100/50",    border: "border-green-500",   text: "text-green-800"   },
  "logo-area":      { bg: "bg-blue-100/80",     border: "border-blue-500",    text: "text-blue-800"    },
  "decorative-bar": { bg: "bg-pink-100/80",     border: "border-pink-500",    text: "text-pink-800"    },
};

const ANALYSIS_STEPS = [
  "Uploading image...",
  "Analyzing label design...",
  "Detecting text zones...",
  "Extracting zone boundaries...",
  "Mapping brand fields...",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isZoneArray(zones: unknown): zones is Zone[] {
  return Array.isArray(zones) && (zones.length === 0 || typeof (zones[0] as any)?.x === "number");
}

function convertLegacyZones(obj: Record<string, any>): Zone[] {
  return Object.entries(obj).map(([key, z], i) => {
    const parsePercent = (v: string | number | undefined, fallback: number) => {
      if (typeof v === "number") return v;
      if (typeof v === "string") return parseFloat(v) / 100;
      return fallback;
    };
    const roleMap: Record<string, ZoneRole> = {
      brandName: "brand-name", productName: "product-name", scentNotes: "scent-notes",
      weight: "weight-volume", ingredients: "disclaimer", logo: "logo-area",
      website: "website", instructions: "disclaimer",
    };
    return {
      id: `legacy-${i}-${key}`,
      role: (roleMap[key] ?? "product-name") as ZoneRole,
      text: z.text ?? "",
      x: parsePercent(z.left, 0.05),
      y: parsePercent(z.top, 0.05 + i * 0.15),
      w: parsePercent(z.width, 0.9),
      h: parsePercent(z.height, 0.12),
      color: "#ffffff",
      fontSize: z.fontSize ? parseInt(z.fontSize) : 10,
      textAlign: (z.align ?? "left") as "left" | "center" | "right",
    };
  });
}

function computeMaxChars(zone: Zone, canvasW: number, canvasH: number): number {
  const zoneW = zone.w * canvasW;
  const zoneH = zone.h * canvasH;
  return Math.max(1, Math.round((zoneW * zoneH) / (zone.fontSize * zone.fontSize * 0.6)));
}

function newZone(id: string): Zone {
  return {
    id,
    role: "product-name",
    text: "",
    x: 0.1,
    y: 0.1,
    w: 0.4,
    h: 0.2,
    color: "#ffffff",
    fontSize: 12,
    textAlign: "left",
  };
}

// ─── DropzoneArea ─────────────────────────────────────────────────────────────

function DropzoneArea({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all",
        dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/30"
      )}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <ImagePlus className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
      <p className="text-lg font-medium mb-1">Upload a label design</p>
      <p className="text-sm text-muted-foreground mb-4">
        Drop a JPG, PNG, or PDF of your existing label — we'll detect zones automatically
      </p>
      <Button type="button" variant="outline" size="sm" onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}>
        <Upload className="w-4 h-4 mr-2" /> Choose file
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
      />
      <p className="text-xs text-muted-foreground/60 mt-4">Or start with a blank template below</p>
    </div>
  );
}

// ─── AnalysisProgress ─────────────────────────────────────────────────────────

function AnalysisProgress({ steps }: { steps: AnalysisStep[] }) {
  return (
    <div className="space-y-3 p-6 bg-muted/20 rounded-xl border">
      <p className="font-medium mb-4">Analyzing your label design…</p>
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          {s.status === "done" && <CheckCircle2 className="w-4 h-4 shrink-0 text-green-500" />}
          {s.status === "running" && <Loader2 className="w-4 h-4 shrink-0 text-primary animate-spin" />}
          {s.status === "pending" && <Circle className="w-4 h-4 shrink-0 text-muted-foreground/40" />}
          {s.status === "error" && <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />}
          <span className={cn(
            s.status === "done" ? "text-foreground" :
            s.status === "running" ? "text-foreground font-medium" :
            "text-muted-foreground"
          )}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── ZoneCanvas ───────────────────────────────────────────────────────────────

type ZoneCanvasProps = {
  zones: Zone[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (zones: Zone[]) => void;
  imageUrl?: string;
  canvasW: number;
  canvasH: number;
};

function ZoneCanvas({ zones, selectedId, onSelect, onChange, imageUrl, canvasW, canvasH }: ZoneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    type: "drag" | "resize";
    zoneId: string;
    startClientX: number;
    startClientY: number;
    startZone: Zone;
    canvasRect: DOMRect;
  } | null>(null);

  const startDrag = useCallback((e: React.PointerEvent, zone: Zone, type: "drag" | "resize") => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const canvasRect = containerRef.current!.getBoundingClientRect();
    dragState.current = {
      type,
      zoneId: zone.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startZone: { ...zone },
      canvasRect,
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds) return;
    const dx = (e.clientX - ds.startClientX) / ds.canvasRect.width;
    const dy = (e.clientY - ds.startClientY) / ds.canvasRect.height;
    onChange(zones.map(z => {
      if (z.id !== ds.zoneId) return z;
      if (ds.type === "drag") {
        return {
          ...z,
          x: Math.max(0, Math.min(1 - z.w, ds.startZone.x + dx)),
          y: Math.max(0, Math.min(1 - z.h, ds.startZone.y + dy)),
        };
      } else {
        return {
          ...z,
          w: Math.max(0.05, Math.min(1 - z.x, ds.startZone.w + dx)),
          h: Math.max(0.03, Math.min(1 - z.y, ds.startZone.h + dy)),
        };
      }
    }));
  }, [zones, onChange]);

  const handlePointerUp = useCallback(() => {
    dragState.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative bg-white border-2 border-muted shadow-xl select-none"
      style={{ width: canvasW, height: canvasH }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={() => onSelect(null)}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Label reference"
          className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
        />
      )}

      {zones.map(zone => {
        const style = ROLE_STYLE[zone.role] ?? ROLE_STYLE["product-name"];
        const isSelected = selectedId === zone.id;
        const maxChars = computeMaxChars(zone, canvasW, canvasH);
        const charRatio = zone.text ? zone.text.length / maxChars : 0;
        const overflow = charRatio > 1;

        return (
          <div
            key={zone.id}
            className={cn(
              "absolute border-2 cursor-move flex items-center justify-center overflow-hidden",
              style.bg, isSelected ? "border-foreground shadow-lg ring-2 ring-offset-1 ring-foreground/50" : `${style.border} border-dashed`,
              overflow && "ring-2 ring-red-500"
            )}
            style={{
              left: zone.x * canvasW,
              top: zone.y * canvasH,
              width: zone.w * canvasW,
              height: zone.h * canvasH,
            }}
            onClick={e => { e.stopPropagation(); onSelect(zone.id); }}
            onPointerDown={e => { onSelect(zone.id); startDrag(e, zone, "drag"); }}
          >
            <span className={cn("text-[9px] font-semibold px-1 truncate leading-tight", style.text)}>
              {zone.text || ZONE_ROLES.find(r => r.value === zone.role)?.label || zone.role}
            </span>

            {isSelected && (
              <div
                className="absolute bottom-0 right-0 w-4 h-4 bg-foreground cursor-se-resize rounded-tl-sm"
                onPointerDown={e => { e.stopPropagation(); startDrag(e, zone, "resize"); }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── ZonePanel ────────────────────────────────────────────────────────────────

type ZonePanelProps = {
  zone: Zone;
  onChange: (updated: Zone) => void;
  onDelete: () => void;
  canvasW: number;
  canvasH: number;
  brandFields: Record<string, string>;
};

function ZonePanel({ zone, onChange, onDelete, canvasW, canvasH, brandFields }: ZonePanelProps) {
  const maxChars = computeMaxChars(zone, canvasW, canvasH);
  const charCount = zone.text?.length ?? 0;
  const charRatio = charCount / maxChars;
  const brandMatch = Object.entries(brandFields).find(([, v]) => v && zone.text && zone.text.trim().toLowerCase() === v.trim().toLowerCase());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zone Properties</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Role</Label>
        <Select value={zone.role} onValueChange={v => onChange({ ...zone, role: v as ZoneRole })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ZONE_ROLES.map(r => (
              <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {zone.role !== "photo-area" && zone.role !== "logo-area" && zone.role !== "decorative-bar" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Content text</Label>
            {brandMatch && (
              <Badge variant="secondary" className="text-[10px] mb-1 gap-1 bg-green-50 text-green-700 border-green-200">
                <CheckCircle2 className="w-3 h-3" /> Matches brand "{brandMatch[0]}"
              </Badge>
            )}
            {REQUIRED_ROLES.includes(zone.role) && !zone.text && (
              <Badge variant="destructive" className="text-[10px] mb-1 gap-1">
                <AlertCircle className="w-3 h-3" /> Fill in required
              </Badge>
            )}
            <Textarea
              className="text-xs resize-none h-16 font-mono"
              value={zone.text}
              onChange={e => onChange({ ...zone, text: e.target.value })}
              placeholder={`Enter ${ZONE_ROLES.find(r => r.value === zone.role)?.label ?? zone.role}…`}
            />
            <div className="flex items-center justify-between text-[10px]">
              <span className={cn("font-mono", charRatio > 1 ? "text-red-500 font-semibold" : charRatio > 0.8 ? "text-amber-500" : "text-muted-foreground")}>
                {charCount} / ~{maxChars} chars
              </span>
              {charRatio > 0 && (
                <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", charRatio > 1 ? "bg-red-500" : charRatio > 0.8 ? "bg-amber-500" : "bg-green-500")}
                    style={{ width: `${Math.min(100, charRatio * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Text align</Label>
            <div className="flex gap-1">
              {(["left", "center", "right"] as const).map(align => (
                <Button
                  key={align}
                  size="icon"
                  variant={zone.textAlign === align ? "default" : "outline"}
                  className="h-7 w-8"
                  onClick={() => onChange({ ...zone, textAlign: align })}
                >
                  {align === "left" && <AlignLeft className="w-3 h-3" />}
                  {align === "center" && <AlignCenter className="w-3 h-3" />}
                  {align === "right" && <AlignRight className="w-3 h-3" />}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Font size — {zone.fontSize}pt</Label>
            <Slider
              min={6} max={32} step={1}
              value={[zone.fontSize]}
              onValueChange={([v]) => onChange({ ...zone, fontSize: v })}
              className="py-1"
            />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Zone color</Label>
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={zone.color}
            onChange={e => onChange({ ...zone, color: e.target.value })}
            className="h-8 w-10 p-0.5 border rounded cursor-pointer"
          />
          <Input
            className="h-8 text-xs font-mono flex-1"
            value={zone.color}
            onChange={e => onChange({ ...zone, color: e.target.value })}
          />
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "w", "h"] as const).map(prop => (
          <div key={prop} className="space-y-1">
            <Label className="text-[10px] uppercase font-mono text-muted-foreground">{prop}</Label>
            <Input
              type="number"
              min={0} max={1} step={0.01}
              className="h-7 text-xs font-mono"
              value={zone[prop].toFixed(3)}
              onChange={e => {
                const v = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                onChange({ ...zone, [prop]: v });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Mini template card for grid ─────────────────────────────────────────────

function TemplateCard({ template, onClick, active }: { template: any; onClick: () => void; active: boolean }) {
  const zones: Zone[] = isZoneArray(template.zones) ? template.zones : convertLegacyZones(template.zones ?? {});
  const aspect = 4.75 / 1.25;
  const cardW = 200;
  const cardH = Math.round(cardW / aspect);

  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border overflow-hidden transition-all hover:shadow-md w-full",
        active ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"
      )}
    >
      <div className="relative bg-white" style={{ width: cardW, height: cardH }}>
        {zones.map(z => {
          const s = ROLE_STYLE[z.role] ?? ROLE_STYLE["product-name"];
          return (
            <div
              key={z.id}
              className={cn("absolute border", s.bg, s.border)}
              style={{ left: z.x * cardW, top: z.y * cardH, width: z.w * cardW, height: z.h * cardH }}
            />
          );
        })}
      </div>
      <div className="px-2 py-1.5 bg-muted/30 border-t">
        <p className="text-xs font-medium truncate">{template.name}</p>
        <p className="text-[10px] text-muted-foreground">{zones.length} zones</p>
      </div>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type EditorMode = "idle" | "uploading" | "editing" | "creating";

export default function LabelTemplates() {
  const { data: templates, isLoading } = useGetLabelTemplates({ query: { queryKey: getGetLabelTemplatesQueryKey() } });
  const { data: sheets } = useGetLabelSheets({ query: { queryKey: ["labelSheets"] } });
  const { data: designSystem } = useGetDesignSystem({ query: { queryKey: getGetDesignSystemQueryKey() } });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateLabelTemplate({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetLabelTemplatesQueryKey() });
        toast({ title: "Template saved" });
        setActiveTemplateId(data.id);
        setMode("editing");
      }
    }
  });
  const updateMutation = useUpdateLabelTemplate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetLabelTemplatesQueryKey() });
        toast({ title: "Template updated" });
      }
    }
  });
  const deleteMutation = useDeleteLabelTemplate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetLabelTemplatesQueryKey() });
        toast({ title: "Template deleted" });
        setMode("idle");
        setActiveTemplateId(null);
        setZones([]);
      }
    }
  });

  const [mode, setMode] = useState<EditorMode>("idle");
  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [analysisSteps, setAnalysisSteps] = useState<AnalysisStep[]>([]);
  const [templateName, setTemplateName] = useState("New Template");
  const [templateDescription, setTemplateDescription] = useState("");
  const [labelSheetId, setLabelSheetId] = useState<string>("none");
  const [previewSheetId, setPreviewSheetId] = useState<string>("none");
  const [safeAreaEnabled, setSafeAreaEnabled] = useState(false);
  const [showAdvancedJson, setShowAdvancedJson] = useState(false);
  const [jsonText, setJsonText] = useState("");

  const activeTemplate = templates?.find(t => t.id === activeTemplateId) ?? null;
  const selectedZone = zones.find(z => z.id === selectedZoneId) ?? null;

  const brandFields: Record<string, string> = {
    brandName: designSystem?.brandName ?? "",
    address: designSystem?.address ?? "",
    websiteUrl: designSystem?.websiteUrl ?? "",
  };

  const displaySheet = sheets?.find(s => s.id.toString() === (previewSheetId !== "none" ? previewSheetId : labelSheetId));
  const CANVAS_W = 560;
  const aspect = displaySheet ? displaySheet.labelWidth / displaySheet.labelHeight : 4.75 / 1.25;
  const CANVAS_H = Math.round(CANVAS_W / aspect);

  useEffect(() => {
    if (showAdvancedJson) setJsonText(JSON.stringify(zones, null, 2));
  }, [showAdvancedJson, zones]);

  const loadTemplate = (t: any) => {
    setMode("editing");
    setActiveTemplateId(t.id);
    setTemplateName(t.name);
    setTemplateDescription(t.description ?? "");
    setLabelSheetId(t.labelSheetId?.toString() ?? "none");
    setSafeAreaEnabled(t.safeAreaEnabled ?? false);
    setImageUrl(undefined);
    setSelectedZoneId(null);
    const rawZones = t.zones;
    if (isZoneArray(rawZones)) {
      setZones(rawZones);
    } else if (rawZones && typeof rawZones === "object") {
      setZones(convertLegacyZones(rawZones as Record<string, any>));
    } else {
      setZones([]);
    }
  };

  const startNewBlank = () => {
    setMode("creating");
    setActiveTemplateId(null);
    setTemplateName("New Template");
    setTemplateDescription("");
    setLabelSheetId("none");
    setSafeAreaEnabled(false);
    setImageUrl(undefined);
    setSelectedZoneId(null);
    setZones([
      { id: crypto.randomUUID(), role: "brand-name",    text: designSystem?.brandName ?? "", x: 0.03, y: 0.03, w: 0.45, h: 0.12, color: "#ffffff", fontSize: 8,  textAlign: "left" },
      { id: crypto.randomUUID(), role: "product-name",  text: "",                             x: 0.03, y: 0.18, w: 0.45, h: 0.30, color: "#ffffff", fontSize: 18, textAlign: "left" },
      { id: crypto.randomUUID(), role: "scent-notes",   text: "",                             x: 0.03, y: 0.52, w: 0.45, h: 0.14, color: "#ffffff", fontSize: 9,  textAlign: "left" },
      { id: crypto.randomUUID(), role: "weight-volume", text: "",                             x: 0.03, y: 0.70, w: 0.45, h: 0.10, color: "#ffffff", fontSize: 8,  textAlign: "left" },
      { id: crypto.randomUUID(), role: "photo-area",    text: "",                             x: 0.55, y: 0.0,  w: 0.45, h: 1.0,  color: "#e8e4de", fontSize: 8,  textAlign: "center" },
    ]);
  };

  const runAnalysis = async (file: File) => {
    setMode("uploading");
    setImageUrl(URL.createObjectURL(file));
    setActiveTemplateId(null);
    setSelectedZoneId(null);
    setTemplateName(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));

    const steps: AnalysisStep[] = ANALYSIS_STEPS.map(label => ({ label, status: "pending" }));
    setAnalysisSteps([...steps]);

    const stepInterval = setInterval(() => {
      setAnalysisSteps(prev => {
        const nextPending = prev.findIndex(s => s.status === "pending");
        if (nextPending === -1) { clearInterval(stepInterval); return prev; }
        const updated = [...prev];
        const running = updated.findIndex(s => s.status === "running");
        if (running !== -1) updated[running] = { ...updated[running], status: "done" };
        updated[nextPending] = { ...updated[nextPending], status: "running" };
        return updated;
      });
    }, 600);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/label-templates/analyze", { method: "POST", body: formData });
      clearInterval(stepInterval);
      if (!res.ok) throw new Error(`Analysis failed: ${res.status}`);
      const { zones: detected, brandMatches } = await res.json();

      setAnalysisSteps(prev => prev.map(s => ({ ...s, status: "done" })));

      const mapped: Zone[] = detected.map((z: Zone) => {
        let text = z.text;
        if (z.role === "brand-name" && !text && brandFields.brandName) text = brandFields.brandName;
        if (z.role === "address" && !text && brandFields.address) text = brandFields.address;
        if (z.role === "website" && !text && brandFields.websiteUrl) text = brandFields.websiteUrl;
        if (z.role === "brand-name" && brandMatches?.brandName && designSystem?.brandName) text = designSystem.brandName;
        return { ...z, text };
      });

      await new Promise(r => setTimeout(r, 500));
      setZones(mapped);
      setMode("creating");
    } catch (err) {
      clearInterval(stepInterval);
      setAnalysisSteps(prev => prev.map((s, i) => i === prev.findIndex(x => x.status === "running") ? { ...s, status: "error" } : s));
      toast({ title: "Analysis failed", description: "Using blank template instead.", variant: "destructive" });
      await new Promise(r => setTimeout(r, 800));
      startNewBlank();
    }
  };

  const handleSave = () => {
    const payload = {
      name: templateName,
      description: templateDescription || undefined,
      labelSheetId: labelSheetId === "none" ? undefined : parseInt(labelSheetId),
      zones: zones as unknown,
      safeAreaEnabled,
    };
    if (activeTemplateId) {
      updateMutation.mutate({ id: activeTemplateId, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  const handleAddZone = () => {
    const z = newZone(crypto.randomUUID());
    setZones(prev => [...prev, z]);
    setSelectedZoneId(z.id);
  };

  const handleDeleteZone = (id: string) => {
    setZones(prev => prev.filter(z => z.id !== id));
    setSelectedZoneId(null);
  };

  const handleUpdateZone = useCallback((updated: Zone) => {
    setZones(prev => prev.map(z => z.id === updated.id ? updated : z));
  }, []);

  const isEditing = mode === "editing" || mode === "creating";
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight kern-on">Label Templates</h1>
          <p className="text-muted-foreground mt-1">Design zone layouts for your labels.</p>
        </div>
        <div className="flex gap-2">
          {isEditing && (
            <Button variant="outline" size="sm" onClick={handleAddZone}>
              <Plus className="w-4 h-4 mr-1" /> Add Zone
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving || !isEditing}>
            <Save className="w-4 h-4 mr-2" />
            {activeTemplateId ? "Save Changes" : "Save Template"}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 gap-4 min-h-0">
        {/* Sidebar */}
        <div className="w-56 shrink-0 flex flex-col gap-2 overflow-y-auto">
          <button
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm transition-colors",
              "hover:bg-primary/5 hover:border-primary/40 text-muted-foreground hover:text-foreground"
            )}
            onClick={startNewBlank}
          >
            <Plus className="w-4 h-4" /> Blank template
          </button>

          {isLoading ? (
            <div className="text-center text-xs text-muted-foreground p-4 animate-pulse">Loading…</div>
          ) : templates?.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground p-4">No templates yet</div>
          ) : (
            templates?.map(t => (
              <TemplateCard key={t.id} template={t} active={activeTemplateId === t.id} onClick={() => loadTemplate(t)} />
            ))
          )}
        </div>

        {/* Main content area */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-lg border bg-card">
          {mode === "idle" && (
            <div className="flex-1 flex flex-col items-center justify-center p-10">
              <div className="max-w-md w-full">
                <div className="text-center mb-8">
                  <LayoutTemplate className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                  <h2 className="text-xl font-semibold mb-2">Design your label layout</h2>
                  <p className="text-sm text-muted-foreground">
                    Upload an existing label image and we'll detect the zones automatically, or start from a blank template.
                  </p>
                </div>
                <DropzoneArea onFile={runAnalysis} />
                <div className="mt-4 text-center">
                  <Button variant="ghost" size="sm" onClick={startNewBlank}>
                    Start with blank template instead
                  </Button>
                </div>
              </div>
            </div>
          )}

          {mode === "uploading" && (
            <div className="flex-1 flex flex-col items-center justify-center p-10">
              <div className="max-w-sm w-full">
                {imageUrl && (
                  <img src={imageUrl} alt="Uploaded label" className="rounded-lg border shadow mb-6 max-h-32 object-contain mx-auto" />
                )}
                <AnalysisProgress steps={analysisSteps} />
              </div>
            </div>
          )}

          {isEditing && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Editor toolbar */}
              <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center gap-3 shrink-0 flex-wrap">
                <Input
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  className="h-8 font-medium w-44 text-sm"
                />
                <Select value={labelSheetId} onValueChange={setLabelSheetId}>
                  <SelectTrigger className="h-8 w-48 text-xs">
                    <SelectValue placeholder="Assign sheet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">Any sheet</SelectItem>
                    {sheets?.map(s => (
                      <SelectItem key={s.id} value={s.id.toString()} className="text-xs">{s.code} — {s.name.replace(/^.*?-\s*/, "").slice(0, 28)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-xs text-muted-foreground">Preview on:</span>
                  <Select value={previewSheetId} onValueChange={setPreviewSheetId}>
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue placeholder="Same sheet" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">Same sheet</SelectItem>
                      {sheets?.map(s => (
                        <SelectItem key={s.id} value={s.id.toString()} className="text-xs">{s.code} {s.labelWidth}"×{s.labelHeight}"</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {activeTemplateId && (
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10"
                    onClick={() => { if (confirm("Delete this template?")) deleteMutation.mutate({ id: activeTemplateId }); }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="flex flex-1 overflow-hidden">
                {/* Canvas area */}
                <div className="flex-1 bg-secondary/30 overflow-auto flex items-center justify-center p-8 checkerboard-bg relative">
                  <div className="flex flex-col items-center gap-4">
                    {imageUrl && mode === "editing" && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ImagePlus className="w-3.5 h-3.5" />
                        Reference image overlay active
                      </div>
                    )}
                    <ZoneCanvas
                      zones={zones}
                      selectedId={selectedZoneId}
                      onSelect={setSelectedZoneId}
                      onChange={setZones}
                      imageUrl={imageUrl}
                      canvasW={CANVAS_W}
                      canvasH={CANVAS_H}
                    />
                    <div className="text-xs text-muted-foreground">
                      {CANVAS_W / 72 > 0 ? `${displaySheet?.labelWidth ?? "?"}"×${displaySheet?.labelHeight ?? "?"}"`  : "Custom"} label
                      {" · "}
                      {zones.length} zone{zones.length !== 1 ? "s" : ""}
                      {selectedZone && <> · <span className="text-foreground font-medium">Click zone to edit · drag to move · corner to resize</span></>}
                    </div>
                  </div>
                </div>

                {/* Right panel */}
                <div className="w-72 border-l bg-card flex flex-col shrink-0 overflow-y-auto">
                  {selectedZone ? (
                    <div className="p-4">
                      <ZonePanel
                        zone={selectedZone}
                        onChange={handleUpdateZone}
                        onDelete={() => handleDeleteZone(selectedZone.id)}
                        canvasW={CANVAS_W}
                        canvasH={CANVAS_H}
                        brandFields={brandFields}
                      />
                    </div>
                  ) : (
                    <div className="p-4 flex flex-col gap-4">
                      <div>
                        <Label className="text-xs">Description</Label>
                        <Textarea
                          className="mt-1.5 h-20 text-sm"
                          placeholder="Notes about this template…"
                          value={templateDescription}
                          onChange={e => setTemplateDescription(e.target.value)}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">Safe area guides</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">Bleed/live area overlays</p>
                        </div>
                        <Switch checked={safeAreaEnabled} onCheckedChange={setSafeAreaEnabled} />
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zones</Label>
                        {zones.length === 0 && (
                          <p className="text-xs text-muted-foreground">No zones yet. Upload an image to auto-detect, or click "Add Zone".</p>
                        )}
                        {zones.map(z => {
                          const s = ROLE_STYLE[z.role] ?? ROLE_STYLE["product-name"];
                          const required = REQUIRED_ROLES.includes(z.role) && !z.text;
                          return (
                            <button
                              key={z.id}
                              onClick={() => setSelectedZoneId(z.id)}
                              className={cn("w-full text-left px-2.5 py-1.5 rounded-md border text-xs flex items-center gap-2 transition-colors hover:bg-muted/60",
                                selectedZoneId === z.id ? "border-foreground bg-muted" : `${s.border} ${s.bg}`,
                              )}
                            >
                              <span className={cn("font-medium truncate flex-1", s.text)}>
                                {ZONE_ROLES.find(r => r.value === z.role)?.label}
                              </span>
                              {required && <AlertCircle className="w-3 h-3 text-destructive shrink-0" />}
                              {z.text && <span className="text-muted-foreground truncate max-w-16">{z.text}</span>}
                            </button>
                          );
                        })}
                        <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={handleAddZone}>
                          <Plus className="w-3 h-3 mr-1" /> Add zone
                        </Button>
                      </div>

                      {imageUrl && (
                        <>
                          <Separator />
                          <div>
                            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reference Image</Label>
                            <img src={imageUrl} alt="Reference" className="mt-2 rounded border w-full object-contain max-h-24" />
                            <Button variant="ghost" size="sm" className="mt-1 w-full text-xs h-7 text-muted-foreground" onClick={() => setImageUrl(undefined)}>
                              <X className="w-3 h-3 mr-1" /> Remove reference
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Advanced JSON toggle */}
                  <div className="mt-auto border-t">
                    <button
                      className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
                      onClick={() => setShowAdvancedJson(v => !v)}
                    >
                      Advanced (JSON)
                      {showAdvancedJson ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {showAdvancedJson && (
                      <Textarea
                        className="font-mono text-[10px] rounded-none border-0 border-t resize-none h-40 bg-muted/20 focus-visible:ring-0"
                        value={jsonText}
                        onChange={e => setJsonText(e.target.value)}
                        onBlur={() => {
                          try {
                            const parsed = JSON.parse(jsonText);
                            if (Array.isArray(parsed)) setZones(parsed);
                          } catch { /* ignore parse errors while typing */ }
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .checkerboard-bg {
          background-image: linear-gradient(45deg,#e5e7eb 25%,transparent 25%),linear-gradient(-45deg,#e5e7eb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e7eb 75%),linear-gradient(-45deg,transparent 75%,#e5e7eb 75%);
          background-size: 20px 20px;
          background-position: 0 0,0 10px,10px -10px,-10px 0;
        }
        .dark .checkerboard-bg {
          background-image: linear-gradient(45deg,#1f2937 25%,transparent 25%),linear-gradient(-45deg,#1f2937 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1f2937 75%),linear-gradient(-45deg,transparent 75%,#1f2937 75%);
        }
      `}</style>
    </div>
  );
}
