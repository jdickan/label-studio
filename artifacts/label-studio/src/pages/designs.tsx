import { useState, useRef, useEffect } from "react";
import { useShell } from "@/context/shell-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetLabelDesigns,
  useCreateLabelDesign,
  useUpdateLabelDesign,
  useDeleteLabelDesign,
  useGetLabelSheets,
  useGetDesignSystem,
  getGetLabelDesignsQueryKey,
  getGetLabelSheetsQueryKey,
  getGetDesignSystemQueryKey,
} from "@workspace/api-client-react";
import type { LabelDesign, LabelSheet } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  Pencil,
  Type,
  Square,
  Circle,
  Image,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ZoomIn,
  ZoomOut,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  List,
  ChevronDown,
  ChevronUp,
  Save,
  Sparkles,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_SIZE = 0.1;

// ── Types ──────────────────────────────────────────────────────────────────────

type ObjBase = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  locked: boolean;
  visible: boolean;
};

type TextObj = ObjBase & {
  type: "text";
  content: string;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: "left" | "center" | "right";
  letterSpacing: number;
  color: string;
};

type RectObj = ObjBase & {
  type: "rect";
  fill: string;
  stroke: string;
  strokeWidth: number;
  borderRadius: number;
};

type EllipseObj = ObjBase & {
  type: "ellipse";
  fill: string;
  stroke: string;
  strokeWidth: number;
};

type DesignObj = TextObj | RectObj | EllipseObj;

// ── Constants ─────────────────────────────────────────────────────────────────

const PPI = 96;
const DEFAULT_W = 4;
const DEFAULT_H = 2;
const HANDLE_SIZE = 8;

const FONTS = [
  "Arial",
  "Georgia",
  "Helvetica",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Trebuchet MS",
  "Impact",
];

type HandlePos = "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";

// ── Helpers ───────────────────────────────────────────────────────────────────

function px(inches: number, zoom: number) {
  return inches * PPI * zoom;
}

function toIn(pixels: number, zoom: number) {
  return pixels / PPI / zoom;
}

function uid() {
  return crypto.randomUUID();
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function fmt3(n: number) {
  return n.toFixed(3);
}

function makeText(fontFamily = "Arial", designSystem?: { headingFont?: string }): TextObj {
  return {
    id: uid(),
    type: "text",
    x: 0.25,
    y: 0.25,
    w: 1.5,
    h: 0.35,
    content: "Text",
    fontFamily: designSystem?.headingFont || fontFamily,
    fontSize: 18,
    bold: false,
    italic: false,
    underline: false,
    align: "left",
    letterSpacing: 0,
    color: "#000000",
    locked: false,
    visible: true,
  };
}

function makeRect(): RectObj {
  return {
    id: uid(),
    type: "rect",
    x: 0.25,
    y: 0.25,
    w: 1.0,
    h: 0.5,
    fill: "#e5e7eb",
    stroke: "#6b7280",
    strokeWidth: 1,
    borderRadius: 0,
    locked: false,
    visible: true,
  };
}

function makeEllipse(): EllipseObj {
  return {
    id: uid(),
    type: "ellipse",
    x: 0.25,
    y: 0.25,
    w: 1.0,
    h: 0.5,
    fill: "#e5e7eb",
    stroke: "#6b7280",
    strokeWidth: 1,
    locked: false,
    visible: true,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ColorSwatch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      className="w-7 h-7 rounded border border-border shadow-sm flex-shrink-0 cursor-pointer"
      style={{ background: value }}
      onClick={() => ref.current?.click()}
      title="Pick colour"
    >
      <input
        ref={ref}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
    </button>
  );
}

function DesignListPanel({
  designs,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  designs: LabelDesign[];
  activeId: number | null;
  onSelect: (d: LabelDesign) => void;
  onCreate: () => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  function startEdit(d: LabelDesign) {
    setEditingId(d.id);
    setEditName(d.name);
  }

  function commitEdit(id: number) {
    if (editName.trim()) onRename(id, editName.trim());
    setEditingId(null);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Designs</span>
        <button type="button" onClick={onCreate} className="rounded p-0.5 hover:bg-muted transition-colors" title="New design">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      {designs.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">No designs yet</p>
      )}
      {designs.map((d) => (
        <div
          key={d.id}
          className={`group flex items-center gap-1 rounded px-2 py-1.5 cursor-pointer text-sm transition-colors ${activeId === d.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          onClick={() => onSelect(d)}
        >
          {editingId === d.id ? (
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => commitEdit(d.id)}
              onKeyDown={(e) => { if (e.key === "Enter") commitEdit(d.id); if (e.key === "Escape") setEditingId(null); }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-transparent border-b border-current outline-none text-sm py-0"
            />
          ) : (
            <span className="flex-1 truncate">{d.name}</span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); startEdit(d); }}
            className={`opacity-0 group-hover:opacity-100 rounded p-0.5 transition-opacity ${activeId === d.id ? "hover:bg-primary-foreground/20" : "hover:bg-muted-foreground/20"}`}
            title="Rename"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(d.id); }}
            className={`opacity-0 group-hover:opacity-100 rounded p-0.5 transition-opacity ${activeId === d.id ? "hover:bg-primary-foreground/20 text-primary-foreground" : "hover:bg-red-100 text-red-500"}`}
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function ToolPanel({
  activeTab,
  onTab,
  onAddText,
  onAddRect,
  onAddEllipse,
  sheets,
  selectedSheetId,
  onSheetChange,
}: {
  activeTab: string;
  onTab: (t: string) => void;
  onAddText: () => void;
  onAddRect: () => void;
  onAddEllipse: () => void;
  sheets: LabelSheet[];
  selectedSheetId: string;
  onSheetChange: (v: string) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-2 flex flex-col gap-2">
      <div className="flex rounded overflow-hidden border text-xs font-medium">
        {(["text", "shapes", "images"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTab(t)}
            className={`flex-1 py-1 capitalize transition-colors ${activeTab === t ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === "text" && (
        <button
          type="button"
          onClick={onAddText}
          className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-muted transition-colors border border-dashed"
        >
          <Type className="w-4 h-4 shrink-0" /> Add Text
        </button>
      )}

      {activeTab === "shapes" && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onAddRect}
            className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-muted transition-colors border border-dashed"
          >
            <Square className="w-4 h-4 shrink-0" /> Rectangle
          </button>
          <button
            type="button"
            onClick={onAddEllipse}
            className="flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-muted transition-colors border border-dashed"
          >
            <Circle className="w-4 h-4 shrink-0" /> Ellipse
          </button>
        </div>
      )}

      {activeTab === "images" && (
        <div className="rounded px-2 py-3 text-xs text-muted-foreground text-center border border-dashed flex flex-col items-center gap-1">
          <Image className="w-5 h-5 opacity-40" />
          <span>Image upload coming soon</span>
        </div>
      )}

      <div className="mt-1">
        <Label className="text-xs text-muted-foreground mb-1 block">Label sheet</Label>
        <Select value={selectedSheetId} onValueChange={onSheetChange}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="None (default size)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None (4″ × 2″)</SelectItem>
            {sheets.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name} {s.code ? `(${s.code})` : ""} {s.labelWidth}″×{s.labelHeight}″
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function TopToolbar({
  obj,
  onUpdate,
  extraFonts,
}: {
  obj: DesignObj | null;
  onUpdate: (id: string, patch: Partial<DesignObj>) => void;
  extraFonts: string[];
}) {
  if (!obj || obj.type !== "text") return (
    <div className="h-9 border-b flex items-center px-3 text-xs text-muted-foreground bg-card">
      Select a text object to format it
    </div>
  );

  const t = obj as TextObj;
  const allFonts = [...new Set([...extraFonts, ...FONTS])];

  return (
    <div className="h-9 border-b flex items-center gap-1 px-2 bg-card flex-wrap overflow-hidden">
      <Select value={t.fontFamily} onValueChange={(v) => onUpdate(t.id, { fontFamily: v } as Partial<DesignObj>)}>
        <SelectTrigger className="h-7 text-xs w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allFonts.map((f) => (
            <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <input
        type="number"
        value={t.fontSize}
        min={6}
        max={200}
        onChange={(e) => onUpdate(t.id, { fontSize: Number(e.target.value) } as Partial<DesignObj>)}
        className="h-7 w-14 border rounded text-xs px-1.5 bg-background"
        title="Font size (pt)"
      />

      <div className="flex gap-0.5">
        <button type="button" onClick={() => onUpdate(t.id, { bold: !t.bold } as Partial<DesignObj>)} className={`h-7 w-7 rounded flex items-center justify-center text-xs transition-colors ${t.bold ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} title="Bold">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => onUpdate(t.id, { italic: !t.italic } as Partial<DesignObj>)} className={`h-7 w-7 rounded flex items-center justify-center text-xs transition-colors ${t.italic ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} title="Italic">
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => onUpdate(t.id, { underline: !t.underline } as Partial<DesignObj>)} className={`h-7 w-7 rounded flex items-center justify-center text-xs transition-colors ${t.underline ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} title="Underline">
          <Underline className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex gap-0.5">
        {(["left", "center", "right"] as const).map((a) => {
          const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
          return (
            <button key={a} type="button" onClick={() => onUpdate(t.id, { align: a } as Partial<DesignObj>)} className={`h-7 w-7 rounded flex items-center justify-center transition-colors ${t.align === a ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} title={`Align ${a}`}>
              <Icon className="w-3.5 h-3.5" />
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Spacing</span>
        <input
          type="range"
          value={t.letterSpacing}
          step={0.01}
          min={-0.2}
          max={1}
          onChange={(e) => onUpdate(t.id, { letterSpacing: Number(e.target.value) } as Partial<DesignObj>)}
          className="w-20 accent-primary"
          title={`Letter spacing: ${t.letterSpacing.toFixed(2)}em`}
        />
        <span className="text-xs w-8 text-muted-foreground">{t.letterSpacing.toFixed(2)}</span>
      </div>

      <ColorSwatch value={t.color} onChange={(v) => onUpdate(t.id, { color: v } as Partial<DesignObj>)} />
    </div>
  );
}

function PropertiesPanel({
  obj,
  onUpdate,
  extraFonts,
}: {
  obj: DesignObj | null;
  onUpdate: (id: string, patch: Partial<DesignObj>) => void;
  extraFonts: string[];
}) {
  if (!obj) return null;

  const allFonts = [...new Set([...extraFonts, ...FONTS])];

  if (obj.type === "text") {
    const t = obj as TextObj;
    return (
      <div className="rounded-lg border bg-card p-2 flex flex-col gap-2 text-xs">
        <p className="font-semibold text-[10px] uppercase tracking-wide text-muted-foreground">Text Properties</p>

        <div>
          <Label className="text-[10px] text-muted-foreground mb-0.5 block">Font family</Label>
          <Select value={t.fontFamily} onValueChange={(v) => onUpdate(t.id, { fontFamily: v } as Partial<DesignObj>)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allFonts.map((f) => (
                <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-1">
          <div className="flex-1">
            <Label className="text-[10px] text-muted-foreground mb-0.5 block">Size (pt)</Label>
            <input type="number" value={t.fontSize} min={6} max={200} onChange={(e) => onUpdate(t.id, { fontSize: Number(e.target.value) } as Partial<DesignObj>)} className="h-7 w-full border rounded px-1.5 bg-background text-xs" />
          </div>
          <div className="flex-1">
            <Label className="text-[10px] text-muted-foreground mb-0.5 block">Spacing <span className="text-foreground">{t.letterSpacing.toFixed(2)}</span></Label>
            <input type="range" value={t.letterSpacing} step={0.01} min={-0.2} max={1} onChange={(e) => onUpdate(t.id, { letterSpacing: Number(e.target.value) } as Partial<DesignObj>)} className="w-full accent-primary" />
          </div>
        </div>

        <div>
          <Label className="text-[10px] text-muted-foreground mb-0.5 block">Style</Label>
          <div className="flex gap-1">
            <button type="button" onClick={() => onUpdate(t.id, { bold: !t.bold } as Partial<DesignObj>)} className={`h-7 w-7 rounded flex items-center justify-center ${t.bold ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}><Bold className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => onUpdate(t.id, { italic: !t.italic } as Partial<DesignObj>)} className={`h-7 w-7 rounded flex items-center justify-center ${t.italic ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}><Italic className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => onUpdate(t.id, { underline: !t.underline } as Partial<DesignObj>)} className={`h-7 w-7 rounded flex items-center justify-center ${t.underline ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}><Underline className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        <div>
          <Label className="text-[10px] text-muted-foreground mb-0.5 block">Alignment</Label>
          <div className="flex gap-1">
            {(["left", "center", "right"] as const).map((a) => {
              const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
              return (
                <button key={a} type="button" onClick={() => onUpdate(t.id, { align: a } as Partial<DesignObj>)} className={`h-7 w-7 rounded flex items-center justify-center ${t.align === a ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}><Icon className="w-3.5 h-3.5" /></button>
              );
            })}
          </div>
        </div>

        <div>
          <Label className="text-[10px] text-muted-foreground mb-0.5 block">Colour</Label>
          <div className="flex items-center gap-2">
            <ColorSwatch value={t.color} onChange={(v) => onUpdate(t.id, { color: v } as Partial<DesignObj>)} />
            <span className="text-xs font-mono">{t.color}</span>
          </div>
        </div>
      </div>
    );
  }

  if (obj.type === "rect" || obj.type === "ellipse") {
    const s = obj as RectObj | EllipseObj;
    return (
      <div className="rounded-lg border bg-card p-2 flex flex-col gap-2 text-xs">
        <p className="font-semibold text-[10px] uppercase tracking-wide text-muted-foreground">{obj.type === "rect" ? "Rectangle" : "Ellipse"} Properties</p>
        <div>
          <Label className="text-[10px] text-muted-foreground mb-0.5 block">Fill colour</Label>
          <div className="flex items-center gap-2">
            <ColorSwatch value={s.fill} onChange={(v) => onUpdate(s.id, { fill: v } as Partial<DesignObj>)} />
            <span className="text-xs font-mono">{s.fill}</span>
          </div>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground mb-0.5 block">Stroke colour</Label>
          <div className="flex items-center gap-2">
            <ColorSwatch value={s.stroke} onChange={(v) => onUpdate(s.id, { stroke: v } as Partial<DesignObj>)} />
            <span className="text-xs font-mono">{s.stroke}</span>
          </div>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground mb-0.5 block">Stroke width (px)</Label>
          <input type="number" value={s.strokeWidth} min={0} max={20} onChange={(e) => onUpdate(s.id, { strokeWidth: Number(e.target.value) } as Partial<DesignObj>)} className="h-7 w-full border rounded px-1.5 bg-background text-xs" />
        </div>
        {obj.type === "rect" && (
          <div>
            <Label className="text-[10px] text-muted-foreground mb-0.5 block">Corner radius (px)</Label>
            <input type="number" value={(s as RectObj).borderRadius} min={0} max={100} onChange={(e) => onUpdate(s.id, { borderRadius: Number(e.target.value) } as Partial<DesignObj>)} className="h-7 w-full border rounded px-1.5 bg-background text-xs" />
          </div>
        )}
      </div>
    );
  }

  return null;
}

function ObjectListPanel({
  objects,
  selectedId,
  onSelect,
  onToggleVis,
  onToggleLock,
  onDelete,
}: {
  objects: DesignObj[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleVis: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-semibold hover:bg-muted transition-colors rounded-t-lg"
      >
        <span className="flex items-center gap-1"><List className="w-3.5 h-3.5" /> Objects ({objects.length})</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="flex flex-col text-xs max-h-52 overflow-y-auto">
          {objects.length === 0 && (
            <p className="text-muted-foreground text-center py-3">No objects</p>
          )}
          {[...objects].reverse().map((obj) => (
            <div
              key={obj.id}
              onClick={() => onSelect(obj.id)}
              className={`group flex items-center gap-1 px-2 py-1 cursor-pointer transition-colors ${selectedId === obj.id ? "bg-primary/10" : "hover:bg-muted"}`}
            >
              <span className="text-[10px] w-4 text-muted-foreground">
                {obj.type === "text" ? "T" : obj.type === "rect" ? "□" : "○"}
              </span>
              <span className="flex-1 truncate">
                {obj.type === "text" ? (obj as TextObj).content.slice(0, 20) || "(empty)" : obj.type === "rect" ? "Rectangle" : "Ellipse"}
              </span>
              <button type="button" onClick={(e) => { e.stopPropagation(); onToggleVis(obj.id); }} className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-muted-foreground/20" title={obj.visible ? "Hide" : "Show"}>
                {obj.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-muted-foreground" />}
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onToggleLock(obj.id); }} className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-muted-foreground/20" title={obj.locked ? "Unlock" : "Lock"}>
                {obj.locked ? <Lock className="w-3 h-3 text-orange-500" /> : <Unlock className="w-3 h-3" />}
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(obj.id); }} className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-red-100 text-red-500" title="Delete">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Canvas ─────────────────────────────────────────────────────────────────────

type DragState = {
  type: "move" | "resize";
  objId: string;
  handle?: HandlePos;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
};

function DesignCanvas({
  objects,
  selectedId,
  zoom,
  labelW,
  labelH,
  bleedInches,
  safeInches,
  labelShape,
  cornerRadius,
  onSelect,
  onUpdateObj,
  onStartEdit,
  editingId,
}: {
  objects: DesignObj[];
  selectedId: string | null;
  zoom: number;
  labelW: number;
  labelH: number;
  bleedInches: number;
  safeInches: number;
  labelShape: "rectangle" | "circle" | "oval";
  cornerRadius: number;
  onSelect: (id: string | null) => void;
  onUpdateObj: (id: string, patch: Partial<DesignObj>) => void;
  onStartEdit: (id: string) => void;
  editingId: string | null;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cW = px(labelW, zoom);
  const cH = px(labelH, zoom);

  function getCanvasPoint(e: PointerEvent | React.PointerEvent): [number, number] {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function onCanvasPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement) === canvasRef.current) {
      onSelect(null);
    }
  }

  function onObjPointerDown(e: React.PointerEvent, obj: DesignObj) {
    e.stopPropagation();
    if (obj.locked) { onSelect(obj.id); return; }
    onSelect(obj.id);
    const [cx, cy] = getCanvasPoint(e);
    dragRef.current = {
      type: "move",
      objId: obj.id,
      startX: cx,
      startY: cy,
      origX: obj.x,
      origY: obj.y,
      origW: obj.w,
      origH: obj.h,
    };
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  function onHandlePointerDown(e: React.PointerEvent, obj: DesignObj, handle: HandlePos) {
    e.stopPropagation();
    if (obj.locked) return;
    const [cx, cy] = getCanvasPoint(e);
    dragRef.current = {
      type: "resize",
      objId: obj.id,
      handle,
      startX: cx,
      startY: cy,
      origX: obj.x,
      origY: obj.y,
      origW: obj.w,
      origH: obj.h,
    };
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  function onCanvasPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const [cx, cy] = getCanvasPoint(e);
    const dx = toIn(cx - drag.startX, zoom);
    const dy = toIn(cy - drag.startY, zoom);

    if (drag.type === "move") {
      const newX = clamp(drag.origX + dx, 0, labelW - drag.origW);
      const newY = clamp(drag.origY + dy, 0, labelH - drag.origH);
      onUpdateObj(drag.objId, { x: newX, y: newY } as Partial<DesignObj>);
    } else {
      let { origX: x, origY: y, origW: w, origH: h } = drag;
      const handle = drag.handle!;
      if (handle.includes("r")) { w = Math.min(Math.max(MIN_SIZE, drag.origW + dx), labelW - x); }
      if (handle.includes("l")) { const nw = Math.min(Math.max(MIN_SIZE, drag.origW - dx), drag.origX + drag.origW); x = clamp(drag.origX + drag.origW - nw, 0, drag.origX + drag.origW - MIN_SIZE); w = drag.origX + drag.origW - x; }
      if (handle.includes("b")) { h = Math.min(Math.max(MIN_SIZE, drag.origH + dy), labelH - y); }
      if (handle.includes("t")) { const nh = Math.min(Math.max(MIN_SIZE, drag.origH - dy), drag.origY + drag.origH); y = clamp(drag.origY + drag.origH - nh, 0, drag.origY + drag.origH - MIN_SIZE); h = drag.origY + drag.origH - y; }
      onUpdateObj(drag.objId, { x, y, w, h } as Partial<DesignObj>);
    }
  }

  function onCanvasPointerUp() {
    dragRef.current = null;
  }

  const handlePositions: Record<HandlePos, { top: number; left: number; cursor: string }> = {
    tl: { top: 0, left: 0, cursor: "nw-resize" },
    t:  { top: 0, left: 0.5, cursor: "n-resize" },
    tr: { top: 0, left: 1, cursor: "ne-resize" },
    r:  { top: 0.5, left: 1, cursor: "e-resize" },
    br: { top: 1, left: 1, cursor: "se-resize" },
    b:  { top: 1, left: 0.5, cursor: "s-resize" },
    bl: { top: 1, left: 0, cursor: "sw-resize" },
    l:  { top: 0.5, left: 0, cursor: "w-resize" },
  };

  const dieCutRadius =
    labelShape === "circle" || labelShape === "oval"
      ? "50%"
      : cornerRadius > 0
      ? `${px(cornerRadius / 72, zoom)}px`
      : 0;

  const bleedPx = px(bleedInches, zoom);

  return (
    <div style={{ position: "relative", padding: bleedPx, display: "inline-block", flexShrink: 0 }}>
      {/* Bleed guide — outside the label, visible through the padding */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          border: "1px dashed rgba(220,0,0,0.45)",
          borderRadius: dieCutRadius,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Label canvas — clips objects to the die-cut shape */}
      <div
        ref={canvasRef}
        style={{
          width: cW,
          height: cH,
          position: "relative",
          background: "white",
          boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
          borderRadius: dieCutRadius,
          overflow: "hidden",
          border: "1.5px solid #374151",
        }}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
      >
        {/* Safe-area guide (inside label) */}
        <div
          style={{
            position: "absolute",
            top: px(safeInches, zoom),
            left: px(safeInches, zoom),
            right: px(safeInches, zoom),
            bottom: px(safeInches, zoom),
            border: "1px dashed rgba(0,120,255,0.3)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

      {/* Objects */}
      {objects.map((obj) => {
        if (!obj.visible) return null;
        const isSelected = selectedId === obj.id;
        const isEditing = editingId === obj.id;
        const objPx = {
          left: px(obj.x, zoom),
          top: px(obj.y, zoom),
          width: px(obj.w, zoom),
          height: px(obj.h, zoom),
        };

        const sharedStyle: React.CSSProperties = {
          position: "absolute",
          ...objPx,
          cursor: obj.locked ? "default" : "move",
          userSelect: "none",
          boxSizing: "border-box",
          outline: isSelected ? "2px solid #2563eb" : "1px solid transparent",
          outlineOffset: 1,
          zIndex: 1,
        };

        let inner: React.ReactNode;

        if (obj.type === "text") {
          const t = obj as TextObj;
          const fontPx = t.fontSize * PPI / 72 * zoom;
          if (isEditing) {
            inner = (
              <textarea
                ref={textareaRef}
                autoFocus
                value={t.content}
                onChange={(e) => onUpdateObj(t.id, { content: e.target.value } as Partial<DesignObj>)}
                onBlur={() => onStartEdit("")}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  height: "100%",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  resize: "none",
                  fontFamily: t.fontFamily,
                  fontSize: fontPx,
                  fontWeight: t.bold ? "bold" : "normal",
                  fontStyle: t.italic ? "italic" : "normal",
                  textDecoration: t.underline ? "underline" : "none",
                  textAlign: t.align,
                  letterSpacing: `${t.letterSpacing}em`,
                  color: t.color,
                  padding: 0,
                  lineHeight: 1.2,
                }}
              />
            );
          } else {
            inner = (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  fontFamily: t.fontFamily,
                  fontSize: fontPx,
                  fontWeight: t.bold ? "bold" : "normal",
                  fontStyle: t.italic ? "italic" : "normal",
                  textDecoration: t.underline ? "underline" : "none",
                  textAlign: t.align,
                  letterSpacing: `${t.letterSpacing}em`,
                  color: t.color,
                  overflow: "hidden",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.2,
                }}
              >
                {t.content || <span style={{ opacity: 0.3, fontStyle: "italic" }}>Text</span>}
              </div>
            );
          }
        } else if (obj.type === "rect") {
          const r = obj as RectObj;
          inner = (
            <div style={{ width: "100%", height: "100%", background: r.fill, border: `${r.strokeWidth}px solid ${r.stroke}`, borderRadius: r.borderRadius }} />
          );
        } else {
          const el = obj as EllipseObj;
          inner = (
            <div style={{ width: "100%", height: "100%", background: el.fill, border: `${el.strokeWidth}px solid ${el.stroke}`, borderRadius: "50%" }} />
          );
        }

        return (
          <div
            key={obj.id}
            style={sharedStyle}
            onPointerDown={(e) => onObjPointerDown(e, obj)}
            onDoubleClick={(e) => { e.stopPropagation(); if (obj.type === "text") onStartEdit(obj.id); }}
          >
            {inner}

            {/* Resize handles */}
            {isSelected && !obj.locked && (Object.entries(handlePositions) as [HandlePos, { top: number; left: number; cursor: string }][]).map(([handle, pos]) => (
              <div
                key={handle}
                style={{
                  position: "absolute",
                  top: `calc(${pos.top * 100}% - ${HANDLE_SIZE / 2}px)`,
                  left: `calc(${pos.left * 100}% - ${HANDLE_SIZE / 2}px)`,
                  width: HANDLE_SIZE,
                  height: HANDLE_SIZE,
                  background: "white",
                  border: "1.5px solid #2563eb",
                  borderRadius: 2,
                  cursor: pos.cursor,
                  zIndex: 10,
                }}
                onPointerDown={(e) => { e.stopPropagation(); onHandlePointerDown(e, obj, handle); }}
              />
            ))}
          </div>
        );
      })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Designs() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { setTopBarState } = useShell();

  const { data: allDesigns = [], isLoading } = useGetLabelDesigns({ query: { queryKey: getGetLabelDesignsQueryKey() } });
  const { data: sheets = [] } = useGetLabelSheets({ query: { queryKey: getGetLabelSheetsQueryKey() } });
  const { data: designSystem } = useGetDesignSystem({ query: { queryKey: getGetDesignSystemQueryKey() } });

  const createMut = useCreateLabelDesign();
  const updateMut = useUpdateLabelDesign();
  const deleteMut = useDeleteLabelDesign();

  const [activeDesignId, setActiveDesignId] = useState<number | null>(null);
  const [objects, setObjects] = useState<DesignObj[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>("");
  const [zoom, setZoom] = useState(1);
  const [activeTab, setActiveTab] = useState("text");
  const [selectedSheetId, setSelectedSheetId] = useState("none");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedObj = objects.find((o) => o.id === selectedId) ?? null;
  const activeDesign = allDesigns.find((d) => d.id === activeDesignId) ?? null;
  const activeSheet = sheets.find((s) => String(s.id) === selectedSheetId) ?? null;
  const labelW = activeSheet?.labelWidth ?? DEFAULT_W;
  const labelH = activeSheet?.labelHeight ?? DEFAULT_H;
  const bleedInches = activeSheet?.bleedInches ?? 0.125;
  const safeInches = activeSheet?.safeAreaInches ?? 0.125;

  const extraFonts: string[] = [
    designSystem?.headingFont,
    designSystem?.bodyFont,
  ].filter((f): f is string => Boolean(f));

  function loadDesign(design: LabelDesign) {
    setActiveDesignId(design.id);
    setObjects((design.objects as DesignObj[]) ?? []);
    setSelectedSheetId(design.labelSheetId ? String(design.labelSheetId) : "none");
    setSelectedId(null);
    setEditingId("");
    setIsDirty(false);
  }

  function updateObj(id: string, patch: Partial<DesignObj>) {
    setObjects((prev) => prev.map((o) => o.id === id ? { ...o, ...patch } as DesignObj : o));
    setIsDirty(true);
  }

  function addObj(obj: DesignObj, startEditing = false) {
    setObjects((prev) => [...prev, obj]);
    setSelectedId(obj.id);
    if (startEditing) setEditingId(obj.id);
    setIsDirty(true);
  }

  function deleteObj(id: string) {
    setObjects((prev) => prev.filter((o) => o.id !== id));
    if (selectedId === id) setSelectedId(null);
    setIsDirty(true);
  }

  async function handleCreate() {
    try {
      const design = await createMut.mutateAsync({ data: { name: "New Design", objects: [] } });
      await queryClient.invalidateQueries({ queryKey: getGetLabelDesignsQueryKey() });
      loadDesign(design);
    } catch {
      toast({ title: "Error", description: "Could not create design", variant: "destructive" });
    }
  }

  async function handleRename(id: number, name: string) {
    try {
      await updateMut.mutateAsync({ id, data: { name } });
      await queryClient.invalidateQueries({ queryKey: getGetLabelDesignsQueryKey() });
    } catch {
      toast({ title: "Error", description: "Could not rename design", variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this design?")) return;
    try {
      await deleteMut.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getGetLabelDesignsQueryKey() });
      if (activeDesignId === id) {
        setActiveDesignId(null);
        setObjects([]);
        setSelectedId(null);
        setIsDirty(false);
      }
    } catch {
      toast({ title: "Error", description: "Could not delete design", variant: "destructive" });
    }
  }

  async function handleSave() {
    if (!activeDesignId) return;
    setIsSaving(true);
    try {
      await updateMut.mutateAsync({
        id: activeDesignId,
        data: {
          objects,
          labelSheetId: selectedSheetId === "none" ? null : parseInt(selectedSheetId),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetLabelDesignsQueryKey() });
      setIsDirty(false);
      toast({ title: "Saved", description: `${activeDesign?.name ?? "Design"} saved.` });
    } catch {
      toast({ title: "Error", description: "Could not save design", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  function handleSheetChange(v: string) {
    setSelectedSheetId(v);
    setIsDirty(true);
  }

  const zoomPct = Math.round(zoom * 100);

  useEffect(() => {
    const title = activeDesign ? activeDesign.name : "Designs";
    const actions = activeDesignId ? (
      <div className="flex items-center gap-2">
        <Select value={selectedSheetId} onValueChange={handleSheetChange}>
          <SelectTrigger className="h-7 text-xs w-40">
            <SelectValue placeholder="No sheet" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No sheet</SelectItem>
            {sheets.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleSave} disabled={isSaving || !isDirty} size="sm" variant={isDirty ? "default" : "ghost"} className="h-7 text-xs px-3">
          <Save className="w-3.5 h-3.5 mr-1" />
          {isSaving ? "Saving…" : isDirty ? "Save" : "Saved"}
        </Button>
      </div>
    ) : undefined;
    setTopBarState({ title, actions });
    return () => setTopBarState({});
  }, [activeDesign, activeDesignId, isDirty, isSaving, selectedSheetId, sheets]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel — docked to left edge */}
      <div className="w-52 flex-shrink-0 border-r bg-card flex flex-col overflow-y-auto">
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4 animate-pulse">Loading…</p>
          ) : (
            <DesignListPanel
              designs={allDesigns}
              activeId={activeDesignId}
              onSelect={loadDesign}
              onCreate={handleCreate}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          )}

          {activeDesignId && (
            <ToolPanel
              activeTab={activeTab}
              onTab={setActiveTab}
              onAddText={() => addObj(makeText(undefined, designSystem), true)}
              onAddRect={() => addObj(makeRect())}
              onAddEllipse={() => addObj(makeEllipse())}
              sheets={sheets}
              selectedSheetId={selectedSheetId}
              onSheetChange={handleSheetChange}
            />
          )}
        </div>

        {/* Center canvas area — fills remaining space, edge-to-edge */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-card">
          {!activeDesignId ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center flex flex-col items-center gap-4 max-w-xs">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-lg">No design selected</p>
                  <p className="text-sm text-muted-foreground mt-1">Create a new design or select one from the sidebar to start designing.</p>
                </div>
                <Button onClick={handleCreate} size="sm">
                  <Plus className="w-4 h-4 mr-1" /> New Design
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Top toolbar */}
              <TopToolbar obj={selectedObj} onUpdate={updateObj} extraFonts={extraFonts} />

              {/* Canvas scroll area */}
              <div className="flex-1 overflow-auto bg-[#f0f0f0]">
                <div className="flex items-center justify-center" style={{ minWidth: "100%", minHeight: "100%", padding: 40 }}>
                  <DesignCanvas
                    objects={objects}
                    selectedId={selectedId}
                    zoom={zoom}
                    labelW={labelW}
                    labelH={labelH}
                    bleedInches={bleedInches}
                    safeInches={safeInches}
                    labelShape={(activeSheet?.shape ?? "rectangle") as "rectangle" | "circle" | "oval"}
                    cornerRadius={activeSheet?.cornerRadius ?? 0}
                    onSelect={setSelectedId}
                    onUpdateObj={updateObj}
                    onStartEdit={setEditingId}
                    editingId={editingId}
                  />
                </div>
              </div>

              {/* Status bar */}
              <div className="h-8 border-t bg-card flex items-center px-3 gap-2 text-xs text-muted-foreground shrink-0">
                {selectedObj ? (
                  <>
                    {(["x","y","w","h"] as const).map((field) => (
                      <label key={field} className="flex items-center gap-1">
                        <span className="uppercase">{field}:</span>
                        <input
                          type="number"
                          step="0.001"
                          min={field === "w" || field === "h" ? MIN_SIZE : undefined}
                          value={fmt3(selectedObj[field])}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v)) {
                              const min = field === "w" || field === "h" ? MIN_SIZE : -99;
                              updateObj(selectedObj.id, { [field]: Math.max(min, v) } as Partial<DesignObj>);
                            }
                          }}
                          className="w-14 text-foreground font-medium bg-transparent border-b border-muted-foreground/40 focus:outline-none focus:border-primary text-xs py-0 text-center"
                        />
                        <span>″</span>
                      </label>
                    ))}
                  </>
                ) : (
                  <span>{labelW}″ × {labelH}″ label</span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} className="p-1 rounded hover:bg-muted transition-colors"><ZoomOut className="w-3.5 h-3.5" /></button>
                  <span className="w-10 text-center">{zoomPct}%</span>
                  <button type="button" onClick={() => setZoom((z) => Math.min(4, z + 0.25))} className="p-1 rounded hover:bg-muted transition-colors"><ZoomIn className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right panel — docked to right edge */}
        <div className="w-52 flex-shrink-0 border-l bg-card flex flex-col overflow-y-auto">
          {selectedObj && (
            <PropertiesPanel obj={selectedObj} onUpdate={updateObj} extraFonts={extraFonts} />
          )}
          {activeDesignId && (
            <ObjectListPanel
              objects={objects}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onToggleVis={(id) => updateObj(id, { visible: !objects.find((o) => o.id === id)?.visible } as Partial<DesignObj>)}
              onToggleLock={(id) => updateObj(id, { locked: !objects.find((o) => o.id === id)?.locked } as Partial<DesignObj>)}
              onDelete={deleteObj}
            />
          )}
        </div>
    </div>
  );
}
