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
import type { LabelZone, LabelTemplate, DesignSystem, LabelSheet } from "@workspace/api-client-react";
import type { LabelZoneAnalysisResult } from "@workspace/api-client-react";
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
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  LayoutTemplate, Plus, Save, Trash2, Upload, CheckCircle2,
  Circle, Loader2, ChevronDown, ChevronUp, AlertCircle, X,
  AlignLeft, AlignCenter, AlignRight, ImagePlus, Columns2,
  Eye, RotateCcw, AlignStartVertical, AlignCenterVertical, AlignEndVertical,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const ZONE_ROLES: { value: LabelZone["role"]; label: string }[] = [
  { value: "brand-name",     label: "Brand Name"      },
  { value: "product-name",   label: "Product Name"    },
  { value: "scent-notes",    label: "Scent Notes"     },
  { value: "product-type",   label: "Product Type"    },
  { value: "weight-volume",  label: "Weight / Volume" },
  { value: "address",        label: "Address"         },
  { value: "website",        label: "Website"         },
  { value: "disclaimer",     label: "Disclaimer"      },
  { value: "date",           label: "Date"            },
  { value: "photo-area",     label: "Photo Area"      },
  { value: "logo-area",      label: "Logo Area"       },
  { value: "decorative-bar", label: "Decorative Bar"  },
];

const REQUIRED_ROLES: LabelZone["role"][] = ["product-name"];

const NO_TEXT_ROLES: LabelZone["role"][] = ["photo-area", "logo-area", "decorative-bar"];

const ROLE_STYLE: Record<LabelZone["role"], { bg: string; border: string; text: string }> = {
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
  "Uploading file…",
  "Analyzing label design…",
  "Detecting text zones…",
  "Extracting zone boundaries…",
  "Mapping brand fields…",
];

const DEFAULT_ASPECT = 4.75 / 1.25;

// ─── Safe-area guide constants ─────────────────────────────────────────────────
// Fractional inset from each edge (proportion of label dimension).
const DEFAULT_IMAGE_SAFE_INSET = 0.03;   // fallback 3% when no sheet linked
const DEFAULT_TEXT_SAFE_INSET  = 0.06;   // fallback 6%
const SNAP_THRESHOLD           = 0.025;  // within 2.5% → snap to guide

/** Snap a zone edge pair to the nearest guide candidate. */
function snapEdge(pos: number, size: number, guides: number[], thresh: number): number {
  let best = pos;
  let bestDist = thresh;
  for (const g of guides) {
    const dl = Math.abs(pos - g);          // left/top edge distance
    const dr = Math.abs(pos + size - g);   // right/bottom edge distance
    if (dl < bestDist) { bestDist = dl; best = g; }
    if (dr < bestDist) { bestDist = dr; best = g - size; }
  }
  return best;
}

/** Snap a trailing edge (right or bottom during resize). */
function snapTrailingEdge(edge: number, guides: number[], thresh: number): number {
  let best = edge;
  let bestDist = thresh;
  for (const g of guides) {
    const d = Math.abs(edge - g);
    if (d < bestDist) { bestDist = d; best = g; }
  }
  return best;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeMaxChars(zone: Omit<LabelZone, "maxChars">): number {
  return Math.max(1, Math.round(zone.w * zone.h * 10000 / (zone.fontSize * zone.fontSize * 0.6)));
}

function withMaxChars(zone: Omit<LabelZone, "maxChars">): LabelZone {
  return { ...zone, maxChars: computeMaxChars(zone) } as LabelZone;
}

function isZoneArray(zones: unknown): zones is LabelZone[] {
  return Array.isArray(zones) && (zones.length === 0 || typeof (zones as LabelZone[])[0]?.x === "number");
}

function convertLegacyZones(obj: Record<string, unknown>): LabelZone[] {
  const parsePercent = (v: unknown, fallback: number) => {
    if (typeof v === "number") return v;
    if (typeof v === "string") return parseFloat(v) / 100;
    return fallback;
  };
  const roleMap: Record<string, LabelZone["role"]> = {
    brandName: "brand-name", productName: "product-name", scentNotes: "scent-notes",
    weight: "weight-volume", ingredients: "disclaimer", logo: "logo-area",
    website: "website", instructions: "disclaimer",
  };
  return Object.entries(obj).map(([key, val], i) => {
    const z = (val ?? {}) as Record<string, unknown>;
    const role = roleMap[key] ?? "product-name";
    const partial = {
      id: `legacy-${i}-${key}`,
      role,
      text: typeof z.text === "string" ? z.text : "",
      x: parsePercent(z.left, 0.05),
      y: parsePercent(z.top, 0.05 + i * 0.15),
      w: parsePercent(z.width, 0.9),
      h: parsePercent(z.height, 0.12),
      color: "#ffffff",
      fontSize: typeof z.fontSize === "string" ? parseInt(z.fontSize) : 10,
      textAlign: (["left","center","right"].includes(z.align as string) ? z.align : "left") as LabelZone["textAlign"],
    };
    return withMaxChars(partial);
  });
}

function newZone(id: string): LabelZone {
  const partial = {
    id, role: "product-name" as LabelZone["role"],
    text: "", x: 0.1, y: 0.1, w: 0.4, h: 0.2,
    color: "#ffffff", fontSize: 12, textAlign: "left" as LabelZone["textAlign"],
  };
  return withMaxChars(partial);
}

function getContrastColor(hex: string): string {
  const c = (hex || "#ffffff").replace("#", "").padStart(6, "0");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? "#1a1a1a" : "#f5f5f5";
}

function hexColorDistance(a: string, b: string): number {
  const toRgb = (hex: string) => {
    const c = hex.replace("#", "").padStart(6, "0");
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)] as const;
  };
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function findBrandColorMatch(color: string, ds: DesignSystem | undefined): string | null {
  if (!ds || !color.startsWith("#")) return null;
  const palette = [
    { name: "primary",    value: ds.primaryColor    },
    { name: "accent",     value: ds.accentColor     },
    { name: "secondary",  value: ds.secondaryColor  },
    { name: "background", value: ds.backgroundColor },
    { name: "text",       value: ds.textColor       },
  ];
  for (const { name, value } of palette) {
    if (value && hexColorDistance(color, value) < 30) return name;
  }
  return null;
}

type AnalysisStep = { label: string; status: "pending" | "running" | "done" | "error" };

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
          {s.status === "done"    && <CheckCircle2 className="w-4 h-4 shrink-0 text-green-500" />}
          {s.status === "running" && <Loader2 className="w-4 h-4 shrink-0 text-primary animate-spin" />}
          {s.status === "pending" && <Circle className="w-4 h-4 shrink-0 text-muted-foreground/40" />}
          {s.status === "error"   && <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />}
          <span className={cn(
            s.status === "done"    ? "text-foreground" :
            s.status === "running" ? "text-foreground font-medium" : "text-muted-foreground"
          )}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── ZoneCanvas ───────────────────────────────────────────────────────────────

const HEADING_ROLES = new Set(["brand-name", "product-name"]);

type ZoneCanvasProps = {
  zones: LabelZone[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange?: (zones: LabelZone[]) => void;
  onBeforeDrag?: () => void;
  imageUrl?: string;
  canvasW: number;
  canvasH: number;
  readOnly?: boolean;
  label?: string;
  headingFont?: string;
  bodyFont?: string;
  showTextSafe?: boolean;
  showImageSafe?: boolean;
  labelBgColor?: string | null;
  /** Per-axis safe-area insets (fraction of label dimension). Falls back to defaults when absent. */
  imageInsetX?: number;
  imageInsetY?: number;
  textInsetX?: number;
  textInsetY?: number;
};

function ZoneCanvas({ zones, selectedId, onSelect, onChange, onBeforeDrag, imageUrl, canvasW, canvasH, readOnly, label, headingFont, bodyFont, showTextSafe, showImageSafe, labelBgColor, imageInsetX, imageInsetY, textInsetX, textInsetY }: ZoneCanvasProps) {
  const imgInX = imageInsetX ?? DEFAULT_IMAGE_SAFE_INSET;
  const imgInY = imageInsetY ?? DEFAULT_IMAGE_SAFE_INSET;
  const txtInX = textInsetX  ?? DEFAULT_TEXT_SAFE_INSET;
  const txtInY = textInsetY  ?? DEFAULT_TEXT_SAFE_INSET;
  // Never show guides in readOnly (preview/compare) mode
  const effectiveShowImageSafe = !readOnly && showImageSafe;
  const effectiveShowTextSafe  = !readOnly && showTextSafe;
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const dragState = useRef<{
    type: "drag" | "resize";
    zoneId: string;
    startClientX: number;
    startClientY: number;
    startZone: LabelZone;
    canvasRect: DOMRect;
  } | null>(null);

  const startDrag = useCallback((e: React.PointerEvent, zone: LabelZone, type: "drag" | "resize") => {
    if (readOnly || editingZoneId === zone.id) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    onBeforeDrag?.();
    const canvasRect = containerRef.current!.getBoundingClientRect();
    dragState.current = { type, zoneId: zone.id, startClientX: e.clientX, startClientY: e.clientY, startZone: { ...zone }, canvasRect };
  }, [readOnly, editingZoneId, onBeforeDrag]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds || !onChange) return;
    const dx = (e.clientX - ds.startClientX) / ds.canvasRect.width;
    const dy = (e.clientY - ds.startClientY) / ds.canvasRect.height;

    const snapXs = [0, 1,
      ...(effectiveShowImageSafe ? [imgInX, 1 - imgInX] : []),
      ...(effectiveShowTextSafe  ? [txtInX, 1 - txtInX] : []),
    ];
    const snapYs = [0, 1,
      ...(effectiveShowImageSafe ? [imgInY, 1 - imgInY] : []),
      ...(effectiveShowTextSafe  ? [txtInY, 1 - txtInY] : []),
    ];

    onChange(zones.map(z => {
      if (z.id !== ds.zoneId) return z;
      let updated: LabelZone;
      if (ds.type === "drag") {
        const rawX = Math.max(0, Math.min(1 - z.w, ds.startZone.x + dx));
        const rawY = Math.max(0, Math.min(1 - z.h, ds.startZone.y + dy));
        const snX = Math.max(0, Math.min(1 - z.w, snapEdge(rawX, z.w, snapXs, SNAP_THRESHOLD)));
        const snY = Math.max(0, Math.min(1 - z.h, snapEdge(rawY, z.h, snapYs, SNAP_THRESHOLD)));
        updated = { ...z, x: snX, y: snY };
      } else {
        const rawW = Math.max(0.05, Math.min(1 - z.x, ds.startZone.w + dx));
        const rawH = Math.max(0.03, Math.min(1 - z.y, ds.startZone.h + dy));
        const snR = Math.max(z.x + 0.05, Math.min(1, snapTrailingEdge(z.x + rawW, snapXs, SNAP_THRESHOLD)));
        const snB = Math.max(z.y + 0.03, Math.min(1, snapTrailingEdge(z.y + rawH, snapYs, SNAP_THRESHOLD)));
        updated = { ...z, w: snR - z.x, h: snB - z.y };
      }
      return withMaxChars(updated);
    }));
  }, [zones, onChange, effectiveShowImageSafe, effectiveShowTextSafe, imgInX, imgInY, txtInX, txtInY]);

  const handlePointerUp = useCallback(() => { dragState.current = null; }, []);

  const commitEdit = useCallback((zoneId: string, el: HTMLElement) => {
    const text = el.innerText.replace(/\n$/, "");
    onChange?.(zones.map(z => z.id === zoneId ? withMaxChars({ ...z, text }) : z));
    setEditingZoneId(null);
  }, [zones, onChange]);

  return (
    <div className="flex flex-col items-center gap-1">
      {label && <p className="text-xs text-muted-foreground font-medium">{label}</p>}
      <div
        ref={containerRef}
        className="relative shadow-2xl select-none overflow-hidden rounded-sm"
        style={{ width: canvasW, height: canvasH, background: labelBgColor || "transparent" }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={() => { if (!readOnly) { onSelect(null); setEditingZoneId(null); } }}
      >
        {/* Reference image ghost */}
        {imageUrl && (
          <img
            src={imageUrl}
            alt="Label reference"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{ opacity: 0.35 }}
          />
        )}

        {/* Empty state hint */}
        {!imageUrl && zones.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-xs text-muted-foreground/40 select-none">No zones yet</p>
          </div>
        )}

        {zones.map(zone => {
          const isSelected = selectedId === zone.id;
          const isEditing = !readOnly && editingZoneId === zone.id;
          const hasText = !NO_TEXT_ROLES.includes(zone.role);
          const roleLabel = ZONE_ROLES.find(r => r.value === zone.role)?.label ?? zone.role;
          const charRatio = zone.text ? zone.text.length / zone.maxChars : 0;
          const isZoneTransparent = !zone.color || zone.color === "transparent";
          const bgColor = isZoneTransparent ? "transparent" : zone.color;
          const autoFgColor = isZoneTransparent
            ? getContrastColor(labelBgColor || "#ffffff")
            : getContrastColor(zone.color);
          const fgColor = zone.textColor || autoFgColor;
          const textAlignYItems =
            zone.textAlignY === "middle" ? "center" :
            zone.textAlignY === "bottom" ? "flex-end" : "flex-start";
          const pxFont = Math.max(7, zone.fontSize * (canvasH / 260));
          const pad = Math.max(3, pxFont * 0.25);
          const zoneFontFamily = HEADING_ROLES.has(zone.role)
            ? (headingFont || undefined)
            : (bodyFont || undefined);

          return (
            <div
              key={zone.id}
              className={cn(
                "absolute overflow-hidden group transition-[box-shadow]",
                !readOnly && !isEditing && "cursor-move",
                isEditing && "cursor-text",
                isSelected && !readOnly
                  ? "ring-2 ring-[#2563eb] ring-offset-0 shadow-lg"
                  : !readOnly && "hover:ring-1 hover:ring-[#2563eb]/50",
                !readOnly && charRatio > 1 && "ring-2 ring-red-500"
              )}
              style={{
                left: zone.x * canvasW,
                top: zone.y * canvasH,
                width: zone.w * canvasW,
                height: zone.h * canvasH,
                backgroundColor: bgColor,
                transform: zone.rotation ? `rotate(${zone.rotation}deg)` : undefined,
                transformOrigin: "center",
              }}
              onClick={e => { e.stopPropagation(); if (!readOnly) onSelect(zone.id); }}
              onDoubleClick={e => {
                if (readOnly || !hasText) return;
                e.stopPropagation();
                onSelect(zone.id);
                setEditingZoneId(zone.id);
              }}
              onPointerDown={e => {
                if (!readOnly && !isEditing) { onSelect(zone.id); startDrag(e, zone, "drag"); }
              }}
            >
              {/* Photo/logo — uploaded image or crosshatch placeholder */}
              {(zone.role === "photo-area" || zone.role === "logo-area") && zone.imageUrl && (
                <img
                  src={zone.imageUrl}
                  alt="Zone image"
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                />
              )}
              {(zone.role === "photo-area" || zone.role === "logo-area") && !zone.imageUrl && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div
                    className="absolute inset-0 opacity-20"
                    style={{
                      backgroundImage: `repeating-linear-gradient(45deg, ${fgColor} 0px, ${fgColor} 1px, transparent 1px, transparent 8px)`,
                    }}
                  />
                  <ImagePlus style={{ width: pxFont * 1.8, height: pxFont * 1.8, color: fgColor, opacity: 0.4 }} />
                </div>
              )}

              {zone.role === "decorative-bar" && (
                <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.5 }}>
                  <div className="w-full h-full" style={{ background: `repeating-linear-gradient(90deg, ${fgColor}22 0px, ${fgColor}22 4px, transparent 4px, transparent 8px)` }} />
                </div>
              )}

              {/* Text content — display mode */}
              {hasText && !isEditing && (
                <div
                  className="w-full h-full overflow-hidden pointer-events-none"
                  style={{
                    fontSize: pxFont,
                    color: fgColor,
                    textAlign: zone.textAlign as "left" | "center" | "right",
                    padding: `${pad}px ${pad * 1.4}px`,
                    lineHeight: 1.35,
                    display: "flex",
                    alignItems: textAlignYItems,
                    justifyContent: zone.textAlign === "center" ? "center" : zone.textAlign === "right" ? "flex-end" : "flex-start",
                    wordBreak: "break-word",
                    whiteSpace: "pre-wrap",
                    fontFamily: zoneFontFamily,
                  }}
                >
                  {zone.text ? zone.text : (
                    <span style={{ opacity: 0.3, fontStyle: "italic" }}>{roleLabel}</span>
                  )}
                </div>
              )}

              {/* Text content — inline edit mode */}
              {hasText && isEditing && (
                <div
                  contentEditable
                  suppressContentEditableWarning
                  className="w-full h-full outline-none"
                  style={{
                    fontSize: pxFont,
                    color: fgColor,
                    textAlign: zone.textAlign as "left" | "center" | "right",
                    padding: `${pad}px ${pad * 1.4}px`,
                    lineHeight: 1.35,
                    wordBreak: "break-word",
                    whiteSpace: "pre-wrap",
                    boxShadow: "inset 0 0 0 1.5px #2563eb",
                    fontFamily: zoneFontFamily,
                  }}
                  ref={el => {
                    if (el) {
                      if (el.innerText !== zone.text) el.innerText = zone.text || "";
                      el.focus();
                      const range = document.createRange();
                      range.selectNodeContents(el);
                      range.collapse(false);
                      window.getSelection()?.removeAllRanges();
                      window.getSelection()?.addRange(range);
                    }
                  }}
                  onBlur={e => commitEdit(zone.id, e.currentTarget)}
                  onKeyDown={e => {
                    if (e.key === "Escape") { commitEdit(zone.id, e.currentTarget); e.preventDefault(); }
                  }}
                  onClick={e => e.stopPropagation()}
                />
              )}

              {/* Role badge — shows on hover / selection */}
              <div className={cn(
                "absolute top-0 left-0 leading-none px-1 py-0.5 text-[7px] font-medium select-none pointer-events-none transition-opacity rounded-br-sm",
                "bg-black/50 text-white",
                isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-80"
              )}>
                {roleLabel}
                {hasText && !readOnly && !isEditing && <span className="ml-1 opacity-60">↵ edit</span>}
              </div>

              {/* Resize handle — bottom-right */}
              {isSelected && !readOnly && !isEditing && (
                <div
                  className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
                  style={{ background: "#2563eb" }}
                  onPointerDown={e => { e.stopPropagation(); startDrag(e, zone, "resize"); }}
                />
              )}

              {/* Corner dots — top-left indicator when selected */}
              {isSelected && !readOnly && (
                <>
                  <div className="absolute top-0 left-0 w-2 h-2 rounded-full" style={{ background: "#2563eb", margin: "-1px 0 0 -1px" }} />
                  <div className="absolute top-0 right-0 w-2 h-2 rounded-full" style={{ background: "#2563eb", margin: "-1px -1px 0 0" }} />
                  <div className="absolute bottom-0 left-0 w-2 h-2 rounded-full" style={{ background: "#2563eb", margin: "0 0 -1px -1px" }} />
                </>
              )}
            </div>
          );
        })}

        {/* ── Safe area guides ─────────────────────────────────────────── */}
        {effectiveShowImageSafe && (
          <div
            className="absolute pointer-events-none"
            style={{
              left:   `${imgInX * 100}%`,
              top:    `${imgInY * 100}%`,
              right:  `${imgInX * 100}%`,
              bottom: `${imgInY * 100}%`,
              border: "1.5px dashed #f97316",
              zIndex: 60,
            }}
          >
            <span
              className="absolute -top-[14px] left-0 text-[9px] font-semibold leading-none px-1"
              style={{ color: "#f97316", background: "rgba(255,255,255,0.75)", borderRadius: 2 }}
            >
              image safe
            </span>
          </div>
        )}
        {effectiveShowTextSafe && (
          <div
            className="absolute pointer-events-none"
            style={{
              left:   `${txtInX * 100}%`,
              top:    `${txtInY * 100}%`,
              right:  `${txtInX * 100}%`,
              bottom: `${txtInY * 100}%`,
              border: "1.5px dashed #3b82f6",
              zIndex: 61,
            }}
          >
            <span
              className="absolute -top-[14px] left-0 text-[9px] font-semibold leading-none px-1"
              style={{ color: "#3b82f6", background: "rgba(255,255,255,0.75)", borderRadius: 2 }}
            >
              text safe
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ZonePanel ────────────────────────────────────────────────────────────────

type ZonePanelProps = {
  zone: LabelZone;
  onChange: (updated: LabelZone) => void;
  onDelete: () => void;
  brandFields: Record<string, string>;
  designSystem: DesignSystem | undefined;
};

function ZonePanel({ zone, onChange, onDelete, brandFields, designSystem }: ZonePanelProps) {
  const charCount = zone.text?.length ?? 0;
  const charRatio = charCount / zone.maxChars;
  const brandMatch = Object.entries(brandFields).find(([, v]) => v && zone.text && zone.text.trim().toLowerCase() === v.trim().toLowerCase());
  const brandColorMatch = findBrandColorMatch(zone.color, designSystem);

  const update = (partial: Partial<Omit<LabelZone, "id" | "maxChars">>) => {
    const merged = { ...zone, ...partial };
    onChange(withMaxChars(merged));
  };

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
        <Select value={zone.role} onValueChange={v => update({ role: v as LabelZone["role"] })}>
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

      {!NO_TEXT_ROLES.includes(zone.role) && (
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
              onChange={e => update({ text: e.target.value })}
              placeholder={`Enter ${ZONE_ROLES.find(r => r.value === zone.role)?.label ?? zone.role}…`}
            />
            <div className="flex items-center justify-between text-[10px]">
              <span className={cn("font-mono", charRatio > 1 ? "text-red-500 font-semibold" : charRatio > 0.8 ? "text-amber-500" : "text-muted-foreground")}>
                {charCount} / ~{zone.maxChars} chars
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
              {(["left", "center", "right"] as LabelZone["textAlign"][]).map(align => (
                <Button
                  key={align} size="icon"
                  variant={zone.textAlign === align ? "default" : "outline"}
                  className="h-7 w-8"
                  onClick={() => update({ textAlign: align })}
                >
                  {align === "left"   && <AlignLeft   className="w-3 h-3" />}
                  {align === "center" && <AlignCenter className="w-3 h-3" />}
                  {align === "right"  && <AlignRight  className="w-3 h-3" />}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Vertical align</Label>
            <div className="flex gap-1">
              {(["top", "middle", "bottom"] as const).map(align => (
                <Button
                  key={align} size="icon"
                  variant={(zone.textAlignY ?? "top") === align ? "default" : "outline"}
                  className="h-7 w-8"
                  onClick={() => update({ textAlignY: align })}
                  title={align}
                >
                  {align === "top"    && <AlignStartVertical  className="w-3 h-3" />}
                  {align === "middle" && <AlignCenterVertical className="w-3 h-3" />}
                  {align === "bottom" && <AlignEndVertical    className="w-3 h-3" />}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Font size — {zone.fontSize}pt</Label>
            <Slider
              min={6} max={32} step={1}
              value={[zone.fontSize]}
              onValueChange={([v]) => update({ fontSize: v })}
              className="py-1"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Line height — {(zone.lineHeight ?? 1.2).toFixed(1)}×</Label>
            <Slider
              min={0.8} max={2.5} step={0.1}
              value={[zone.lineHeight ?? 1.2]}
              onValueChange={([v]) => update({ lineHeight: v })}
              className="py-1"
            />
          </div>
        </>
      )}

      {/* Photo/logo zone: image upload */}
      {(zone.role === "photo-area" || zone.role === "logo-area") && (
        <div className="space-y-1.5">
          <Label className="text-xs">Zone image</Label>
          {zone.imageUrl && (
            <img src={zone.imageUrl} alt="Zone" className="w-full rounded border max-h-20 object-contain bg-muted/20" />
          )}
          <label className="block w-full cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = ev => update({ imageUrl: ev.target?.result as string });
                reader.readAsDataURL(file);
                e.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" className="w-full text-xs h-7 pointer-events-none" asChild>
              <span><Upload className="w-3 h-3 mr-1" /> {zone.imageUrl ? "Replace image" : "Upload image"}</span>
            </Button>
          </label>
          {zone.imageUrl && (
            <Button variant="ghost" size="sm" className="w-full text-xs h-7 text-muted-foreground"
              onClick={() => update({ imageUrl: undefined })}>
              <X className="w-3 h-3 mr-1" /> Remove image
            </Button>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Zone background color</Label>
        {brandColorMatch && (
          <Badge variant="secondary" className="text-[10px] mb-1 gap-1 bg-blue-50 text-blue-700 border-blue-200">
            <CheckCircle2 className="w-3 h-3" /> Matches brand {brandColorMatch} color
          </Badge>
        )}
        <div className="flex gap-2 items-center">
          <button
            type="button"
            title="Set zone background to transparent"
            onClick={() => update({ color: "" })}
            className={cn(
              "h-8 w-10 shrink-0 border rounded flex items-center justify-center text-[10px] font-medium transition-colors",
              (!zone.color || zone.color === "transparent")
                ? "bg-foreground text-background border-foreground"
                : "text-muted-foreground hover:bg-muted checkerboard-swatch"
            )}
            style={(!zone.color || zone.color === "transparent") ? {} : {
              backgroundImage: "linear-gradient(45deg,#e5e7eb 25%,transparent 25%),linear-gradient(-45deg,#e5e7eb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e7eb 75%),linear-gradient(-45deg,transparent 75%,#e5e7eb 75%)",
              backgroundSize: "6px 6px",
              backgroundPosition: "0 0,0 3px,3px -3px,-3px 0",
            }}
          >
            {(!zone.color || zone.color === "transparent") ? "None" : ""}
          </button>
          <input
            type="color"
            value={(!zone.color || zone.color === "transparent") ? "#ffffff" : zone.color}
            onChange={e => update({ color: e.target.value })}
            className="h-8 w-10 p-0.5 border rounded cursor-pointer"
            disabled={!zone.color || zone.color === "transparent"}
          />
          <Input
            className="h-8 text-xs font-mono flex-1"
            value={(!zone.color || zone.color === "transparent") ? "transparent" : zone.color}
            onChange={e => update({ color: e.target.value })}
            disabled={!zone.color || zone.color === "transparent"}
          />
        </div>
      </div>

      {!NO_TEXT_ROLES.includes(zone.role) && (
        <div className="space-y-1.5">
          <Label className="text-xs">Text color</Label>
          <div className="flex gap-2 items-center">
            <button
              type="button"
              title="Auto-contrast (remove color override)"
              onClick={() => update({ textColor: undefined })}
              className={cn(
                "h-8 w-10 shrink-0 border rounded flex items-center justify-center text-[10px] font-medium transition-colors",
                !zone.textColor
                  ? "bg-foreground text-background border-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              Auto
            </button>
            <input
              type="color"
              value={zone.textColor || "#1a1a1a"}
              onChange={e => update({ textColor: e.target.value })}
              className="h-8 w-10 p-0.5 border rounded cursor-pointer"
              disabled={!zone.textColor}
            />
            <Input
              className="h-8 text-xs font-mono flex-1"
              value={zone.textColor || ""}
              placeholder="auto"
              onChange={e => update({ textColor: e.target.value || undefined })}
              disabled={!zone.textColor}
            />
          </div>
          <p className="text-xs text-muted-foreground">Use "Auto" to let contrast decide, or pick white/black directly.</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Rotation</Label>
        <div className="flex gap-1">
          {([0, 90, 180, -90] as const).map(deg => (
            <Button
              key={deg} size="sm"
              variant={(zone.rotation ?? 0) === deg ? "default" : "outline"}
              className="h-7 flex-1 text-xs px-1"
              onClick={() => update({ rotation: deg })}
            >
              {deg}°
            </Button>
          ))}
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "w", "h"] as const).map(prop => (
          <div key={prop} className="space-y-1">
            <Label className="text-[10px] uppercase font-mono text-muted-foreground">{prop}</Label>
            <Input
              type="number" min={0} max={1} step={0.01}
              className="h-7 text-xs font-mono"
              value={zone[prop].toFixed(3)}
              onChange={e => {
                const v = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                update({ [prop]: v });
              }}
            />
          </div>
        ))}
      </div>

      <div className="text-[10px] text-muted-foreground font-mono">
        ~{zone.maxChars} char capacity
      </div>
    </div>
  );
}

// ─── TemplateCard ─────────────────────────────────────────────────────────────

function TemplateCard({ template, onClick, active }: { template: LabelTemplate; onClick: () => void; active: boolean }) {
  const rawZones = template.zones;
  const zones: LabelZone[] = isZoneArray(rawZones)
    ? (rawZones as LabelZone[])
    : convertLegacyZones((rawZones ?? {}) as Record<string, unknown>);

  const aspect = DEFAULT_ASPECT;
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
          const s = ROLE_STYLE[z.role];
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

function sheetAspect(sheet: LabelSheet | undefined): number {
  if (!sheet) return DEFAULT_ASPECT;
  return sheet.labelWidth / sheet.labelHeight;
}

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
  const [zones, setZones] = useState<LabelZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [analysisSteps, setAnalysisSteps] = useState<AnalysisStep[]>([]);
  const [templateName, setTemplateName] = useState("New Template");
  const [templateDescription, setTemplateDescription] = useState("");
  const [labelSheetId, setLabelSheetId] = useState<string>("none");
  const [previewSheetId, setPreviewSheetId] = useState<string>("none");
  const [showImageSafe, setShowImageSafe] = useState(false);
  const [showTextSafe, setShowTextSafe] = useState(false);
  const [showAdvancedJson, setShowAdvancedJson] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [labelBgColor, setLabelBgColor] = useState<string>("");
  const [rightPanelTab, setRightPanelTab] = useState<"zone" | "label" | "zones">("zones");

  const undoRef = useRef<LabelZone[] | null>(null);
  const saveUndo = useCallback(() => {
    undoRef.current = zones;
  }, [zones]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        if (undoRef.current !== null) {
          e.preventDefault();
          setZones(undoRef.current);
          undoRef.current = null;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const selectedZone = zones.find(z => z.id === selectedZoneId) ?? null;

  const brandFields: Record<string, string> = {
    brandName:  designSystem?.brandName  ?? "",
    address:    designSystem?.address    ?? "",
    websiteUrl: designSystem?.websiteUrl ?? "",
  };

  const assignedSheet = sheets?.find(s => s.id.toString() === labelSheetId);
  const previewSheet  = sheets?.find(s => s.id.toString() === previewSheetId);

  const isSideBySide = previewSheetId !== "none" && previewSheetId !== labelSheetId;

  const CANVAS_W_SINGLE = 560;
  const CANVAS_W_SIDE   = 268;

  const mainCanvasW = isSideBySide ? CANVAS_W_SIDE : CANVAS_W_SINGLE;
  const mainAspect  = sheetAspect(assignedSheet);
  const mainCanvasH = Math.round(mainCanvasW / mainAspect);

  const previewAspect  = sheetAspect(previewSheet);
  const previewCanvasH = Math.round(CANVAS_W_SIDE / previewAspect);

  const isEditing = mode === "editing" || mode === "creating";
  const isSaving  = createMutation.isPending || updateMutation.isPending;

  // Compute per-axis safe-area insets from the linked sheet's actual measurements.
  // Falls back to DEFAULT constants when no sheet is linked or bleed/safeArea = 0.
  const imageInsetX = assignedSheet && assignedSheet.bleedInches > 0
    ? assignedSheet.bleedInches / assignedSheet.labelWidth  : DEFAULT_IMAGE_SAFE_INSET;
  const imageInsetY = assignedSheet && assignedSheet.bleedInches > 0
    ? assignedSheet.bleedInches / assignedSheet.labelHeight : DEFAULT_IMAGE_SAFE_INSET;
  const textInsetX = assignedSheet && assignedSheet.safeAreaInches > 0
    ? assignedSheet.safeAreaInches / assignedSheet.labelWidth  : DEFAULT_TEXT_SAFE_INSET;
  const textInsetY = assignedSheet && assignedSheet.safeAreaInches > 0
    ? assignedSheet.safeAreaInches / assignedSheet.labelHeight : DEFAULT_TEXT_SAFE_INSET;

  useEffect(() => {
    if (showAdvancedJson) setJsonText(JSON.stringify(zones, null, 2));
  }, [showAdvancedJson, zones]);

  useEffect(() => {
    if (selectedZoneId) setRightPanelTab("zone");
  }, [selectedZoneId]);

  const loadTemplate = (t: LabelTemplate) => {
    setMode("editing");
    setActiveTemplateId(t.id);
    setTemplateName(t.name);
    setTemplateDescription(t.description ?? "");
    setLabelSheetId(t.labelSheetId?.toString() ?? "none");
    setShowImageSafe(t.safeAreaEnabled ?? false);
    setShowTextSafe(t.safeAreaEnabled ?? false);
    setLabelBgColor(t.labelBgColor ?? "");
    setImageUrl(undefined);
    setSelectedZoneId(null);
    undoRef.current = null;
    const rawZones = t.zones;
    if (isZoneArray(rawZones)) {
      setZones(rawZones as LabelZone[]);
    } else if (rawZones && typeof rawZones === "object" && !Array.isArray(rawZones)) {
      setZones(convertLegacyZones(rawZones as Record<string, unknown>));
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
    setShowImageSafe(false);
    setShowTextSafe(false);
    setLabelBgColor("");
    setImageUrl(undefined);
    setSelectedZoneId(null);
    undoRef.current = null;
    setZones([
      withMaxChars({ id: crypto.randomUUID(), role: "brand-name",    text: designSystem?.brandName ?? "", x: 0.03, y: 0.03, w: 0.45, h: 0.12, color: "#ffffff", fontSize: 8,  textAlign: "left"   }),
      withMaxChars({ id: crypto.randomUUID(), role: "product-name",  text: "",                             x: 0.03, y: 0.18, w: 0.45, h: 0.30, color: "#ffffff", fontSize: 18, textAlign: "left"   }),
      withMaxChars({ id: crypto.randomUUID(), role: "scent-notes",   text: "",                             x: 0.03, y: 0.52, w: 0.45, h: 0.14, color: "#ffffff", fontSize: 9,  textAlign: "left"   }),
      withMaxChars({ id: crypto.randomUUID(), role: "weight-volume", text: "",                             x: 0.03, y: 0.70, w: 0.45, h: 0.10, color: "#ffffff", fontSize: 8,  textAlign: "left"   }),
      withMaxChars({ id: crypto.randomUUID(), role: "photo-area",    text: "",                             x: 0.55, y: 0.0,  w: 0.45, h: 1.0,  color: "#e8e4de", fontSize: 8,  textAlign: "center" }),
    ]);
  };

  const runAnalysis = async (file: File) => {
    setMode("uploading");
    if (file.type !== "application/pdf") {
      setImageUrl(URL.createObjectURL(file));
    }
    setActiveTemplateId(null);
    setSelectedZoneId(null);
    setTemplateName(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));

    const steps: AnalysisStep[] = ANALYSIS_STEPS.map(label => ({ label, status: "pending" as const }));
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
      const result: LabelZoneAnalysisResult = await res.json();
      const { zones: detected, brandMatches } = result;

      setAnalysisSteps(prev => prev.map(s => ({ ...s, status: "done" as const })));

      const mapped: LabelZone[] = detected.map(z => {
        let text = z.text;
        if (z.role === "brand-name" && !text && brandFields.brandName) text = brandFields.brandName;
        if (z.role === "brand-name" && brandMatches?.brandName && designSystem?.brandName) text = designSystem.brandName;
        if (z.role === "address" && !text && brandFields.address) text = brandFields.address;
        if (z.role === "website" && !text && brandFields.websiteUrl) text = brandFields.websiteUrl;
        return { ...z, text };
      });

      await new Promise<void>(r => setTimeout(r, 500));
      setZones(mapped);
      setMode("creating");
    } catch (err: unknown) {
      clearInterval(stepInterval);
      setAnalysisSteps(prev => {
        const updated = [...prev];
        const ri = updated.findIndex(s => s.status === "running");
        if (ri !== -1) updated[ri] = { ...updated[ri], status: "error" };
        return updated;
      });
      toast({ title: "Analysis failed", description: "Using blank template instead.", variant: "destructive" });
      await new Promise<void>(r => setTimeout(r, 800));
      startNewBlank();
    }
  };

  const handleSave = () => {
    const zonesWithMaxChars = zones.map(z => withMaxChars(z));
    const payload = {
      name: templateName,
      description: templateDescription || undefined,
      labelSheetId: labelSheetId === "none" ? undefined : parseInt(labelSheetId),
      zones: zonesWithMaxChars as unknown,
      safeAreaEnabled: showImageSafe || showTextSafe,
      labelBgColor: labelBgColor || null,
    };
    if (activeTemplateId) {
      updateMutation.mutate({ id: activeTemplateId, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  const handleAddZone = () => {
    saveUndo();
    const z = newZone(crypto.randomUUID());
    setZones(prev => [...prev, z]);
    setSelectedZoneId(z.id);
  };

  const handleDeleteZone = (id: string) => {
    saveUndo();
    setZones(prev => prev.filter(z => z.id !== id));
    setSelectedZoneId(null);
  };

  const handleUpdateZone = useCallback((updated: LabelZone) => {
    saveUndo();
    setZones(prev => prev.map(z => z.id === updated.id ? withMaxChars(updated) : z));
  }, [saveUndo]);

  const handleCancel = () => {
    setMode("idle");
    setActiveTemplateId(null);
    setZones([]);
    setSelectedZoneId(null);
    setImageUrl(undefined);
    undoRef.current = null;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight kern-on">Designs</h1>
          <p className="text-muted-foreground mt-1">Design zone layouts for your labels.</p>
        </div>
        <div className="flex gap-2">
          {isEditing && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
                <Eye className="w-4 h-4 mr-1" /> Preview
              </Button>
              <Button variant="outline" size="sm" onClick={handleAddZone}>
                <Plus className="w-4 h-4 mr-1" /> Add Zone
              </Button>
            </>
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
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="w-full max-w-2xl grid grid-cols-2 gap-5">
                {/* Start from scratch */}
                <button
                  type="button"
                  onClick={startNewBlank}
                  className="group flex flex-col items-center justify-center gap-4 p-8 rounded-xl border-2 border-dashed text-center transition-all hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                    <LayoutTemplate className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div>
                    <p className="font-semibold text-base">Design from scratch</p>
                    <p className="text-sm text-muted-foreground mt-1">Start with a blank canvas and build your zone layout manually.</p>
                  </div>
                  <span className="text-xs font-medium text-primary group-hover:underline">Open blank template →</span>
                </button>

                {/* Upload design */}
                <div className="flex flex-col gap-3">
                  <DropzoneArea onFile={runAnalysis} />
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

                {/* Safe-area guide toggles */}
                <div className="flex items-center gap-1 border rounded-md px-1.5 py-1">
                  <span className="text-xs text-muted-foreground mr-0.5">Guides:</span>
                  <button
                    type="button"
                    title="Toggle image safe area (3% inset)"
                    onClick={() => setShowImageSafe(v => !v)}
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors",
                      showImageSafe
                        ? "bg-orange-100 text-orange-700 border border-orange-300"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="inline-block w-2.5 h-2.5 rounded-sm border-[1.5px] border-dashed border-current" />
                    Image
                  </button>
                  <button
                    type="button"
                    title="Toggle text safe area (6% inset)"
                    onClick={() => setShowTextSafe(v => !v)}
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors",
                      showTextSafe
                        ? "bg-blue-100 text-blue-700 border border-blue-300"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="inline-block w-2.5 h-2.5 rounded-sm border-[1.5px] border-dashed border-current" />
                    Text
                  </button>
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                  <Columns2 className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Compare with:</span>
                  <Select value={previewSheetId} onValueChange={setPreviewSheetId}>
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue placeholder="— same sheet —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">— same sheet —</SelectItem>
                      {sheets?.map(s => (
                        <SelectItem key={s.id} value={s.id.toString()} className="text-xs">
                          {s.code} — {s.labelWidth}"×{s.labelHeight}"
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant="ghost" size="sm" className="h-8 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
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
                <div className="flex-1 bg-secondary/30 overflow-auto flex items-center justify-center p-8 checkerboard-bg">
                  <div className="flex flex-col items-center gap-4">
                    <div className={cn("flex gap-5 items-start", isSideBySide && "flex-row")}>
                      <ZoneCanvas
                        zones={zones}
                        selectedId={selectedZoneId}
                        onSelect={setSelectedZoneId}
                        onChange={setZones}
                        onBeforeDrag={saveUndo}
                        imageUrl={imageUrl}
                        canvasW={mainCanvasW}
                        canvasH={mainCanvasH}
                        label={isSideBySide ? (assignedSheet ? `${assignedSheet.code} (assigned)` : "Current sheet") : undefined}
                        headingFont={designSystem?.headingFont}
                        bodyFont={designSystem?.bodyFont}
                        showImageSafe={showImageSafe}
                        showTextSafe={showTextSafe}
                        labelBgColor={labelBgColor}
                        imageInsetX={imageInsetX}
                        imageInsetY={imageInsetY}
                        textInsetX={textInsetX}
                        textInsetY={textInsetY}
                      />
                      {isSideBySide && previewSheet && (
                        <ZoneCanvas
                          zones={zones}
                          selectedId={null}
                          onSelect={() => {}}
                          canvasW={CANVAS_W_SIDE}
                          canvasH={previewCanvasH}
                          readOnly
                          label={`${previewSheet.code} — ${previewSheet.labelWidth}"×${previewSheet.labelHeight}"`}
                          headingFont={designSystem?.headingFont}
                          bodyFont={designSystem?.bodyFont}
                          showImageSafe={showImageSafe}
                          showTextSafe={showTextSafe}
                          labelBgColor={labelBgColor}
                          imageInsetX={imageInsetX}
                          imageInsetY={imageInsetY}
                          textInsetX={textInsetX}
                          textInsetY={textInsetY}
                        />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {assignedSheet ? `${assignedSheet.labelWidth}"×${assignedSheet.labelHeight}"` : "Custom aspect"} · {zones.length} zone{zones.length !== 1 ? "s" : ""}
                      {!selectedZone && <> · <span className="text-foreground/60">Click zone to edit · drag to move · corner handle to resize</span></>}
                    </div>
                  </div>
                </div>

                {/* Right panel — tabbed */}
                <div className="w-72 border-l bg-card flex flex-col shrink-0 overflow-hidden">
                  <Tabs value={rightPanelTab} onValueChange={v => setRightPanelTab(v as typeof rightPanelTab)} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                    <TabsList className="w-full rounded-none border-b h-9 shrink-0 bg-transparent justify-start px-2 gap-0.5">
                      <TabsTrigger value="zone" className="flex-1 text-xs h-7 data-[state=active]:bg-muted data-[state=active]:shadow-none">Zone</TabsTrigger>
                      <TabsTrigger value="label" className="flex-1 text-xs h-7 data-[state=active]:bg-muted data-[state=active]:shadow-none">Label</TabsTrigger>
                      <TabsTrigger value="zones" className="flex-1 text-xs h-7 data-[state=active]:bg-muted data-[state=active]:shadow-none">
                        Zones
                        {REQUIRED_ROLES.some(r => !zones.some(z => z.role === r)) && (
                          <span className="ml-1 w-1.5 h-1.5 rounded-full bg-destructive inline-block" />
                        )}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="zone" className="flex-1 overflow-y-auto mt-0 data-[state=inactive]:hidden">
                      {selectedZone ? (
                        <div className="p-4">
                          <ZonePanel
                            zone={selectedZone}
                            onChange={handleUpdateZone}
                            onDelete={() => handleDeleteZone(selectedZone.id)}
                            brandFields={brandFields}
                            designSystem={designSystem}
                          />
                        </div>
                      ) : (
                        <div className="p-6 flex flex-col items-center justify-center gap-3 text-center min-h-32">
                          <LayoutTemplate className="w-8 h-8 text-muted-foreground/30" />
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">No zone selected</p>
                            <p className="text-xs text-muted-foreground/70 mt-1">Click a zone on the canvas to edit its properties.</p>
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="label" className="flex-1 overflow-y-auto mt-0 data-[state=inactive]:hidden">
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

                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Label Background</Label>
                          <div className="flex gap-2 items-center">
                            <button
                              type="button"
                              title="No background (transparent)"
                              onClick={() => setLabelBgColor("")}
                              className={cn(
                                "h-8 w-10 shrink-0 border rounded flex items-center justify-center text-[10px] font-medium transition-colors",
                                !labelBgColor ? "bg-foreground text-background border-foreground" : "text-muted-foreground hover:bg-muted"
                              )}
                              style={labelBgColor ? { backgroundImage: "linear-gradient(45deg,#e5e7eb 25%,transparent 25%),linear-gradient(-45deg,#e5e7eb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e7eb 75%),linear-gradient(-45deg,transparent 75%,#e5e7eb 75%)", backgroundSize: "6px 6px", backgroundPosition: "0 0,0 3px,3px -3px,-3px 0" } : {}}
                            >
                              {!labelBgColor ? "None" : ""}
                            </button>
                            <input
                              type="color"
                              value={labelBgColor || "#ffffff"}
                              onChange={e => setLabelBgColor(e.target.value)}
                              className="h-8 w-10 p-0.5 border rounded cursor-pointer"
                              title="Pick a label background color"
                            />
                            <Input
                              className="h-8 text-xs font-mono flex-1"
                              value={labelBgColor || ""}
                              placeholder="transparent"
                              onChange={e => setLabelBgColor(e.target.value)}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">The canvas background behind all zones.</p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Safe Area Guides</Label>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-3 h-3 rounded-sm border-2 border-dashed border-orange-500" />
                              <span className="text-sm">Image safe</span>
                              <span className="text-xs text-muted-foreground">
                                {assignedSheet && assignedSheet.bleedInches > 0
                                  ? `${assignedSheet.bleedInches}" bleed`
                                  : `${(DEFAULT_IMAGE_SAFE_INSET * 100).toFixed(0)}% inset`}
                              </span>
                            </div>
                            <Switch checked={showImageSafe} onCheckedChange={setShowImageSafe} />
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-3 h-3 rounded-sm border-2 border-dashed border-blue-500" />
                              <span className="text-sm">Text safe</span>
                              <span className="text-xs text-muted-foreground">
                                {assignedSheet && assignedSheet.safeAreaInches > 0
                                  ? `${assignedSheet.safeAreaInches}" margin`
                                  : `${(DEFAULT_TEXT_SAFE_INSET * 100).toFixed(0)}% inset`}
                              </span>
                            </div>
                            <Switch checked={showTextSafe} onCheckedChange={setShowTextSafe} />
                          </div>
                          <p className="text-xs text-muted-foreground">Zones snap to guides when dragged near them.</p>
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
                    </TabsContent>

                    <TabsContent value="zones" className="flex-1 overflow-y-auto mt-0 data-[state=inactive]:hidden">
                      <div className="p-4 flex flex-col gap-2">
                        {zones.length === 0 && (
                          <p className="text-xs text-muted-foreground">No zones yet. Upload a label or click "Add Zone".</p>
                        )}
                        {REQUIRED_ROLES.filter(role => !zones.some(z => z.role === role)).map(role => (
                          <div key={role} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-dashed border-destructive/50 bg-destructive/5 text-xs">
                            <AlertCircle className="w-3 h-3 text-destructive shrink-0" />
                            <span className="text-destructive flex-1 truncate">
                              {ZONE_ROLES.find(r => r.value === role)?.label} zone missing
                            </span>
                            <button
                              onClick={() => setZones(prev => [...prev, withMaxChars({ id: crypto.randomUUID(), role, text: "", x: 0.1, y: 0.1, w: 0.8, h: 0.2, color: "#ffffff", fontSize: 14, textAlign: "left" as const })])}
                              className="text-destructive hover:underline font-medium shrink-0"
                            >
                              Add
                            </button>
                          </div>
                        ))}
                        {zones.map(z => {
                          const s = ROLE_STYLE[z.role];
                          const required = REQUIRED_ROLES.includes(z.role) && !z.text;
                          return (
                            <button
                              key={z.id}
                              onClick={() => setSelectedZoneId(z.id)}
                              className={cn("w-full text-left px-2.5 py-1.5 rounded-md border text-xs flex items-center gap-2 transition-colors hover:bg-muted/60",
                                selectedZoneId === z.id ? "border-foreground bg-muted" : `${s.border} ${s.bg}`)}
                            >
                              <span className={cn("font-medium truncate flex-1", s.text)}>
                                {ZONE_ROLES.find(r => r.value === z.role)?.label}
                              </span>
                              {required && <AlertCircle className="w-3 h-3 text-destructive shrink-0" />}
                              {z.text && <span className="text-muted-foreground truncate max-w-16">{z.text}</span>}
                            </button>
                          );
                        })}
                        <Button variant="outline" size="sm" className="w-full text-xs h-7 mt-2" onClick={handleAddZone}>
                          <Plus className="w-3 h-3 mr-1" /> Add zone
                        </Button>
                      </div>
                    </TabsContent>
                  </Tabs>

                  {/* Advanced JSON toggle — always visible at the bottom */}
                  <div className="shrink-0 border-t">
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
                            const parsed: unknown = JSON.parse(jsonText);
                            if (!Array.isArray(parsed)) return;
                            const validated = (parsed as Record<string, unknown>[]).filter(
                              z => typeof z.id === "string" && typeof z.role === "string" &&
                                   typeof z.x === "number" && typeof z.y === "number" &&
                                   typeof z.w === "number" && typeof z.h === "number"
                            ).map(z => withMaxChars({
                              id: z.id as string,
                              role: z.role as LabelZone["role"],
                              text: typeof z.text === "string" ? z.text : "",
                              x: Math.max(0, Math.min(1, z.x as number)),
                              y: Math.max(0, Math.min(1, z.y as number)),
                              w: Math.max(0.01, Math.min(1, z.w as number)),
                              h: Math.max(0.01, Math.min(1, z.h as number)),
                              color: typeof z.color === "string" ? z.color : "#ffffff",
                              fontSize: typeof z.fontSize === "number" ? Math.max(6, Math.min(32, z.fontSize)) : 12,
                              textAlign: (["left","center","right"].includes(z.textAlign as string) ? z.textAlign : "left") as "left"|"center"|"right",
                              rotation: typeof z.rotation === "number" ? z.rotation : 0,
                              imageUrl: typeof z.imageUrl === "string" ? z.imageUrl : undefined,
                            }));
                            setZones(validated);
                          } catch { /* ignore while editing */ }
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

      {/* ── Label Preview Modal ─────────────────────────────────────────── */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl w-[92vw] flex flex-col p-0 overflow-hidden gap-0">
          <DialogHeader className="px-5 py-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" /> Label Preview — {templateName}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-6 flex flex-col items-center justify-start gap-4 bg-muted/30">
            <p className="text-xs text-muted-foreground text-center">
              This is a WYSIWYG preview of your label zones. Text, colors and images are shown as configured.
              {imageUrl && " Reference image shown at 35% opacity."}
            </p>
            {(() => {
              const previewSheet = sheets?.find(s => s.id.toString() === previewSheetId) ||
                                   sheets?.find(s => s.id.toString() === labelSheetId);
              const maxW = 480;
              const maxH = 360;
              const ratio = previewSheet
                ? Math.min(maxW / (previewSheet.labelWidth * 96), maxH / (previewSheet.labelHeight * 96))
                : 1;
              const pxW = previewSheet ? Math.round(previewSheet.labelWidth * 96 * ratio) : maxW;
              const pxH = previewSheet ? Math.round(previewSheet.labelHeight * 96 * ratio) : maxH;
              return (
                <div className="flex flex-col items-center gap-2">
                  {previewSheet && (
                    <p className="text-[11px] text-muted-foreground">
                      {previewSheet.name} · {previewSheet.labelWidth}" × {previewSheet.labelHeight}"
                    </p>
                  )}
                  <ZoneCanvas
                    zones={zones}
                    selectedId={null}
                    onSelect={() => {}}
                    imageUrl={imageUrl}
                    canvasW={pxW}
                    canvasH={pxH}
                    readOnly
                    headingFont={designSystem?.headingFont}
                    bodyFont={designSystem?.bodyFont}
                  />
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

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
