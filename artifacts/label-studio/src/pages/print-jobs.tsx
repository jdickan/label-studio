import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useShell } from "@/context/shell-context";
import PageWrapper from "@/components/layout/page-wrapper";
import { 
  useGetPrintJobs, 
  useCreatePrintJob, 
  useGetLabelSheets, 
  useGetProducts,
  useUpdatePrintJob,
  useGetLabelTemplates,
  useGetLabelDesigns,
  getGetPrintJobsQueryKey 
} from "@workspace/api-client-react";
import type { LabelZone } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { 
  Dialog, 
  DialogContent, 
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
import { Plus, Printer, FileDown, CheckCircle, Trash2, Eye, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type LabelSheetType = {
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
};

type GangedSlot = {
  type: "product" | "blank";
  productId?: number;
  productName?: string;
  productScentName?: string;
  productSize?: string;
  isIntentionalBlank?: boolean;
};

function gangItems(
  items: { productId: number; quantity: number; productName?: string; productScentName?: string; productSize?: string }[],
  labelsPerSheet: number,
  blankSlots: number[]
): GangedSlot[][] {
  const blankSet = new Set(blankSlots);

  const availableSlotsPerSheet = labelsPerSheet - blankSlots.filter(s => s >= 0 && s < labelsPerSheet).length;
  if (labelsPerSheet <= 0 || availableSlotsPerSheet <= 0) {
    const emptySheet: GangedSlot[] = Array.from({ length: labelsPerSheet }, (_, i) =>
      blankSet.has(i) ? { type: "blank", isIntentionalBlank: true } : { type: "blank" }
    );
    return [emptySheet];
  }

  const productQueue: GangedSlot[] = [];
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      productQueue.push({
        type: "product",
        productId: item.productId,
        productName: item.productName,
        productScentName: item.productScentName,
        productSize: item.productSize,
      });
    }
  }

  if (productQueue.length === 0) {
    const emptySheet: GangedSlot[] = Array.from({ length: labelsPerSheet }, (_, i) =>
      blankSet.has(i) ? { type: "blank", isIntentionalBlank: true } : { type: "blank" }
    );
    return [emptySheet];
  }

  const sheets: GangedSlot[][] = [];
  let productIndex = 0;

  while (productIndex < productQueue.length) {
    const currentSheet: GangedSlot[] = [];
    for (let pos = 0; pos < labelsPerSheet; pos++) {
      if (blankSet.has(pos)) {
        currentSheet.push({ type: "blank", isIntentionalBlank: true });
      } else if (productIndex < productQueue.length) {
        currentSheet.push(productQueue[productIndex]);
        productIndex++;
      } else {
        currentSheet.push({ type: "blank" });
      }
    }
    sheets.push(currentSheet);
  }

  return sheets;
}


function BlankSlotEditor({
  labelsAcross,
  labelsDown,
  blankSlots,
  onChange,
  isReprintMode,
}: {
  labelsAcross: number;
  labelsDown: number;
  blankSlots: number[];
  onChange: (slots: number[]) => void;
  isReprintMode: boolean;
}) {
  const total = labelsAcross * labelsDown;
  const blankSet = new Set(blankSlots);

  const toggle = (index: number) => {
    const newSet = new Set(blankSet);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    onChange(Array.from(newSet).sort((a, b) => a - b));
  };

  const clearAll = () => onChange([]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">
            {isReprintMode ? "Mark already-used positions" : "Mark intentionally blank positions"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isReprintMode
              ? "Click slots that were already printed on this sheet — they will be skipped."
              : "Click slots to skip them during ganging."}
          </p>
        </div>
        {blankSlots.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
            <RotateCcw className="w-3 h-3 mr-1" /> Clear
          </Button>
        )}
      </div>
      <div
        className="inline-grid gap-1.5 border rounded-md p-3 bg-background"
        style={{ gridTemplateColumns: `repeat(${labelsAcross}, 1fr)` }}
      >
        {Array.from({ length: total }).map((_, i) => {
          const isBlank = blankSet.has(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              title={`Position ${i + 1}`}
              className={[
                "w-8 h-8 rounded text-xs font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
                isBlank
                  ? "bg-destructive/20 border-destructive/50 text-destructive hover:bg-destructive/30"
                  : "bg-secondary hover:bg-secondary/80 border-border text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      {blankSlots.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {blankSlots.length} slot{blankSlots.length !== 1 ? "s" : ""} marked as {isReprintMode ? "already used" : "blank"}
        </p>
      )}
    </div>
  );
}

const HEADING_ROLES_SET = new Set(["brand", "productName", "productType", "scentFamily"]);

function isLightColor(hex: string): boolean {
  if (!hex || hex === "transparent" || hex.length < 7) return true;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

function resolveZoneText(zone: LabelZone, slot: GangedSlot): string {
  if (slot.type !== "product") return zone.text || "";
  switch (zone.role) {
    case "productName": return slot.productName || zone.text || "";
    case "brand":
    case "scentName": return slot.productScentName || zone.text || "";
    case "size": return slot.productSize || zone.text || "";
    default: return zone.text || "";
  }
}

type DesignObj = {
  id: string;
  type: "text" | "rect" | "ellipse";
  x: number; y: number; w: number; h: number;
  visible?: boolean;
  role?: string;
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean; italic?: boolean; underline?: boolean;
  align?: "left" | "center" | "right";
  letterSpacing?: number;
  color?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number;
};

function resolveDesignText(obj: DesignObj, slot: GangedSlot): string {
  const fallback = obj.content ?? "";
  if (slot.type !== "product") return fallback;
  switch (obj.role) {
    case "product-name": return slot.productName || fallback;
    case "scent-notes":
    case "scent-name": return slot.productScentName || fallback;
    case "weight-volume":
    case "size": return slot.productSize || fallback;
    default: return fallback;
  }
}

function DesignObjectRenderer({ objects, bgColor, labelWidthIn, labelHeightIn, slot }: {
  objects: DesignObj[];
  bgColor?: string | null;
  labelWidthIn: number;
  labelHeightIn: number;
  slot: GangedSlot;
}) {
  const PX_PER_IN = 96;
  return (
    <div
      style={{
        position: "absolute", inset: 0,
        background: bgColor && bgColor !== "transparent" ? bgColor : "transparent",
      }}
    >
      {objects.filter(o => o.visible !== false).map(obj => {
        const left = obj.x * PX_PER_IN;
        const top = obj.y * PX_PER_IN;
        const width = obj.w * PX_PER_IN;
        const height = obj.h * PX_PER_IN;
        if (obj.type === "rect") {
          return (
            <div
              key={obj.id}
              style={{
                position: "absolute", left, top, width, height,
                background: obj.fill || "transparent",
                border: obj.stroke ? `${obj.strokeWidth ?? 1}px solid ${obj.stroke}` : undefined,
                borderRadius: obj.borderRadius ?? 0,
                boxSizing: "border-box",
              }}
            />
          );
        }
        if (obj.type === "ellipse") {
          return (
            <div
              key={obj.id}
              style={{
                position: "absolute", left, top, width, height,
                background: obj.fill || "transparent",
                border: obj.stroke ? `${obj.strokeWidth ?? 1}px solid ${obj.stroke}` : undefined,
                borderRadius: "50%",
                boxSizing: "border-box",
              }}
            />
          );
        }
        const ptToPx = (pt: number) => pt * (4 / 3);
        const fsPx = ptToPx(obj.fontSize ?? 12);
        const text = resolveDesignText(obj, slot);
        return (
          <div
            key={obj.id}
            style={{
              position: "absolute", left, top, width, height,
              fontSize: fsPx, fontFamily: obj.fontFamily || "Arial",
              fontWeight: obj.bold ? "bold" : "normal",
              fontStyle: obj.italic ? "italic" : "normal",
              textDecoration: obj.underline ? "underline" : "none",
              textAlign: obj.align || "left",
              color: obj.color || "#000000",
              letterSpacing: obj.letterSpacing ? `${obj.letterSpacing}px` : undefined,
              overflow: "hidden", boxSizing: "border-box",
              padding: "2px",
              display: "flex",
              alignItems: "flex-start",
            }}
          >
            <span style={{ overflow: "hidden", maxWidth: "100%" }}>{text}</span>
          </div>
        );
      })}
    </div>
  );
}

function ZoneRenderer({
  zones, bgColor, widthPx, heightPx, slot,
}: {
  zones: LabelZone[];
  bgColor?: string | null;
  widthPx: number;
  heightPx: number;
  slot: GangedSlot;
}) {
  const scale = heightPx / 260;
  return (
    <div style={{ position: "relative", width: widthPx, height: heightPx, background: bgColor || "#ffffff", overflow: "hidden", flexShrink: 0 }}>
      {zones.map(zone => {
        const isImageRole = zone.role === "image" || zone.role === "logo";
        const isTransparent = !zone.color || zone.color === "transparent";
        const bg = isTransparent ? "transparent" : (zone.color || "transparent");
        const autoFg = isTransparent || isLightColor(zone.color || "") ? "#1a1a1a" : "#ffffff";
        const fg = (zone as LabelZone & { textColor?: string }).textColor || autoFg;
        const fontSize = Math.max(6, (zone.fontSize || 12) * scale);
        const pxX = zone.x * widthPx;
        const pxY = zone.y * heightPx;
        const pxW = zone.w * widthPx;
        const pxH = zone.h * heightPx;
        const textAlignY = (zone as LabelZone & { textAlignY?: string }).textAlignY;
        const alignItems = textAlignY === "bottom" ? "flex-end" : textAlignY === "middle" ? "center" : "flex-start";
        const justifyContent = zone.textAlign === "center" ? "center" : zone.textAlign === "right" ? "flex-end" : "flex-start";
        const text = resolveZoneText(zone, slot);
        return (
          <div
            key={zone.id}
            style={{
              position: "absolute",
              left: pxX, top: pxY, width: pxW, height: pxH,
              background: bg, color: fg, fontSize,
              fontWeight: HEADING_ROLES_SET.has(zone.role) ? 600 : 400,
              textAlign: zone.textAlign || "left",
              display: "flex", alignItems, justifyContent,
              padding: Math.max(2, 4 * scale),
              overflow: "hidden", boxSizing: "border-box",
              transform: zone.rotation ? `rotate(${zone.rotation}deg)` : undefined,
              transformOrigin: "center center",
              lineHeight: zone.lineHeight ?? 1.2,
            }}
          >
            {isImageRole && zone.imageUrl ? (
              <img src={zone.imageUrl} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            ) : (
              <span style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" }}>
                {text}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LabelCell({
  slot,
  sheet,
  templateZones,
  templateBgColor,
  designObjects,
  designBgColor,
}: {
  slot: GangedSlot;
  sheet: LabelSheetType;
  templateZones?: LabelZone[] | null;
  templateBgColor?: string | null;
  designObjects?: DesignObj[] | null;
  designBgColor?: string | null;
}) {
  const DPI = 96;
  const widthPx = sheet.labelWidth * DPI;
  const heightPx = sheet.labelHeight * DPI;

  const shapeStyle: React.CSSProperties = {
    width: `${sheet.labelWidth}in`,
    height: `${sheet.labelHeight}in`,
    borderRadius: sheet.shape === "circle" || sheet.shape === "oval" ? "50%" : (sheet.cornerRadius ? `${sheet.cornerRadius}px` : undefined),
    overflow: "hidden",
    flexShrink: 0,
  };

  if (slot.type === "blank" && slot.isIntentionalBlank) {
    return (
      <div
        className="border border-dashed border-orange-300 flex items-center justify-center"
        style={{
          ...shapeStyle,
          background: "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(251,146,60,0.1) 4px, rgba(251,146,60,0.1) 8px)",
        }}
      >
        <span className="text-[6pt] text-orange-400 font-medium select-none">BLANK</span>
      </div>
    );
  }

  if (slot.type === "blank") {
    return (
      <div
        className="border border-dashed border-gray-200 print:border-transparent"
        style={shapeStyle}
      />
    );
  }

  if (designObjects && designObjects.length > 0) {
    return (
      <div className="border border-gray-300 print:border-transparent" style={{ ...shapeStyle, position: "relative" }}>
        <DesignObjectRenderer
          objects={designObjects}
          bgColor={designBgColor}
          labelWidthIn={sheet.labelWidth}
          labelHeightIn={sheet.labelHeight}
          slot={slot}
        />
      </div>
    );
  }

  if (templateZones && templateZones.length > 0) {
    return (
      <div className="border border-gray-300 print:border-transparent" style={{ ...shapeStyle, position: "relative" }}>
        <ZoneRenderer
          zones={templateZones}
          bgColor={templateBgColor}
          widthPx={widthPx}
          heightPx={heightPx}
          slot={slot}
        />
      </div>
    );
  }

  return (
    <div
      className="border border-gray-300 print:border-transparent flex flex-col items-center justify-center p-1 text-center"
      style={shapeStyle}
    >
      <div style={{ fontKerning: "normal", textRendering: "optimizeLegibility" }}>
        <div className="font-bold text-[9pt] leading-tight mb-0.5">{slot.productName}</div>
        <div className="text-[7pt] text-gray-600 leading-tight">{slot.productScentName}</div>
        <div className="text-[6pt] text-gray-400 mt-0.5">{slot.productSize}</div>
      </div>
    </div>
  );
}

type FormData = {
  name: string;
  labelSheetId: string;
  labelTemplateId: string;
  labelDesignId: string;
  jobType: "standard" | "reprint";
  blankSlots: number[];
  notes: string;
  items: { productId: number; quantity: number }[];
};

export default function PrintJobs() {
  const { setTopBarState } = useShell();
  const { data: printJobs, isLoading } = useGetPrintJobs({ query: { queryKey: getGetPrintJobsQueryKey() } });
  const { data: sheets } = useGetLabelSheets({ query: { queryKey: ["labelSheets"] } });
  const { data: products } = useGetProducts({ query: { queryKey: ["products"] } });
  const { data: templates } = useGetLabelTemplates({ query: { queryKey: ["labelTemplates"] } });
  const { data: designs } = useGetLabelDesigns({ query: { queryKey: ["labelDesigns"] } });
  
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [editJobId, setEditJobId] = useState<number | null>(null);
  const [previewJob, setPreviewJob] = useState<any>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    labelSheetId: "",
    labelTemplateId: "",
    labelDesignId: "",
    jobType: "standard",
    blankSlots: [],
    notes: "",
    items: [],
  });
  
  const previewRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreatePrintJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPrintJobsQueryKey() });
        toast({ title: "Print job created" });
        setWorkspaceOpen(false);
      },
      onError: (err: any) => {
        toast({ title: "Failed to create print job", description: err.message, variant: "destructive" });
      }
    }
  });

  const editMutation = useUpdatePrintJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPrintJobsQueryKey() });
        toast({ title: "Print job saved" });
        setWorkspaceOpen(false);
      },
      onError: (err: any) => {
        toast({ title: "Failed to save print job", description: err.message, variant: "destructive" });
      }
    }
  });

  const statusMutation = useUpdatePrintJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPrintJobsQueryKey() });
        toast({ title: "Status updated" });
      }
    }
  });

  const selectedSheet = useMemo(() => {
    if (!formData.labelSheetId || !sheets) return null;
    return sheets.find(s => s.id.toString() === formData.labelSheetId) || null;
  }, [formData.labelSheetId, sheets]);

  const activeSheetForPreview = useMemo(() => {
    if (!previewJob || !sheets) return null;
    return sheets.find(s => s.id === previewJob.labelSheetId) || null;
  }, [previewJob, sheets]);

  const gangedSheets = useMemo(() => {
    if (!previewJob || !activeSheetForPreview) return [];
    const labelsPerSheet = activeSheetForPreview.labelsAcross * activeSheetForPreview.labelsDown;
    const blankSlots = (previewJob.blankSlots as number[]) || [];
    return gangItems(previewJob.items, labelsPerSheet, blankSlots);
  }, [previewJob, activeSheetForPreview]);

  const openCreate = () => {
    setEditJobId(null);
    setFormData({
      name: `Print Job - ${format(new Date(), "MMM d")}`,
      labelSheetId: "",
      labelTemplateId: "",
      labelDesignId: "",
      jobType: "standard",
      blankSlots: [],
      notes: "",
      items: [{ productId: products?.[0]?.id || 0, quantity: 1 }],
    });
    setWorkspaceOpen(true);
  };

  const openEdit = (job: any) => {
    setEditJobId(job.id);
    setFormData({
      name: job.name,
      labelSheetId: job.labelSheetId.toString(),
      labelTemplateId: job.labelTemplateId ? job.labelTemplateId.toString() : "",
      labelDesignId: job.labelDesignId ? job.labelDesignId.toString() : "",
      jobType: (job.jobType as "standard" | "reprint") || "standard",
      blankSlots: (job.blankSlots as number[]) || [],
      notes: job.notes || "",
      items: (job.items as any[]).map((i: any) => ({ productId: i.productId, quantity: i.quantity })),
    });
    setWorkspaceOpen(true);
  };

  const handleAddItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { productId: products?.[0]?.id || 0, quantity: 1 }],
    }));
  };

  const handleRemoveItem = (index: number) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      newItems.splice(index, 1);
      return { ...prev, items: newItems };
    });
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, items: newItems };
    });
  };

  const handleSheetChange = (val: string) => {
    setFormData(prev => ({ ...prev, labelSheetId: val, blankSlots: [] }));
  };

  const handleJobTypeToggle = (checked: boolean) => {
    setFormData(prev => ({ ...prev, jobType: checked ? "reprint" : "standard", blankSlots: [] }));
  };

  const usableSlotsPerSheet = useMemo(() => {
    if (!selectedSheet) return 0;
    const labelsPerSheet = selectedSheet.labelsAcross * selectedSheet.labelsDown;
    return labelsPerSheet - formData.blankSlots.filter(s => s >= 0 && s < labelsPerSheet).length;
  }, [selectedSheet, formData.blankSlots]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.labelSheetId) return;
    const validItems = formData.items.filter(i => i.productId > 0 && i.quantity > 0);
    if (usableSlotsPerSheet <= 0 && validItems.length > 0) {
      toast({ title: "No usable label slots", description: "All positions are marked blank. Remove some blank slots to continue.", variant: "destructive" });
      return;
    }
    const labelTemplateId = formData.labelTemplateId ? parseInt(formData.labelTemplateId) : null;
    const labelDesignId = formData.labelDesignId ? parseInt(formData.labelDesignId) : null;
    if (editJobId !== null) {
      editMutation.mutate({
        id: editJobId,
        data: {
          name: formData.name,
          labelSheetId: parseInt(formData.labelSheetId),
          labelTemplateId,
          labelDesignId,
          jobType: formData.jobType,
          blankSlots: formData.blankSlots,
          items: validItems,
          notes: formData.notes || undefined,
        } as any
      });
    } else {
      createMutation.mutate({
        data: {
          name: formData.name,
          labelSheetId: parseInt(formData.labelSheetId),
          labelTemplateId,
          labelDesignId,
          jobType: formData.jobType,
          blankSlots: formData.blankSlots,
          items: validItems,
          notes: formData.notes || undefined,
        } as any
      });
    }
  };

  const drawSheetToCanvas = useCallback(async (
    slots: GangedSlot[],
    sheet: LabelSheetType,
    templateZones: LabelZone[] | null,
    templateBgColor: string | null,
    designObjs: DesignObj[] | null = null,
    designBg: string | null = null,
  ): Promise<HTMLCanvasElement> => {
    const DPI = 150;
    const px = (inches: number) => Math.round(inches * DPI);
    const canvas = document.createElement("canvas");
    canvas.width = px(sheet.pageWidth);
    canvas.height = px(sheet.pageHeight);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const topPad = px(sheet.topMargin);
    const leftPad = px(sheet.leftMargin);
    const labelW = px(sheet.labelWidth);
    const labelH = px(sheet.labelHeight);
    const colGap = px(sheet.horizontalGap || 0);
    const rowGap = px(sheet.verticalGap || 0);
    const HEADING_CANVAS = new Set(["brand", "productName", "brand-name", "product-name", "productType", "scentFamily"]);

    const fontSizeForZone = (zone: LabelZone) =>
      Math.max(9, (zone.fontSize || 12) * sheet.labelHeight * DPI / 260);

    const loadImage = (src: string): Promise<HTMLImageElement | null> =>
      new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });

    const imageCache: Record<string, HTMLImageElement | null> = {};
    if (templateZones) {
      await Promise.all(
        templateZones
          .filter(z => z.imageUrl)
          .map(async z => { imageCache[z.id] = await loadImage(z.imageUrl!); })
      );
    }

    const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
      ctx.font = `${fontSize}px sans-serif`;
      const words = text.split(" ");
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width <= maxWidth || !current) {
          current = test;
        } else {
          lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
      return lines;
    };

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const col = i % sheet.labelsAcross;
      const row = Math.floor(i / sheet.labelsAcross);
      const x = leftPad + col * (labelW + colGap);
      const y = topPad + row * (labelH + rowGap);

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, labelW, labelH);

      if (slot.type === "blank" && slot.isIntentionalBlank) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 1, y + 1, labelW - 2, labelH - 2);
        ctx.fillStyle = "rgba(251,146,60,0.08)";
        ctx.fillRect(x, y, labelW, labelH);
        ctx.restore();
        ctx.fillStyle = "#f97316";
        ctx.font = `bold ${Math.round(DPI * 0.07)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("BLANK", x + labelW / 2, y + labelH / 2);
      } else if (slot.type === "blank") {
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = "#d1d5db";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, labelW, labelH);
        ctx.restore();
      } else if (designObjs && designObjs.length > 0) {
        if (designBg && designBg !== "transparent") {
          ctx.fillStyle = designBg;
          ctx.fillRect(x, y, labelW, labelH);
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, labelW, labelH);
        ctx.clip();
        for (const obj of designObjs) {
          if (obj.visible === false) continue;
          const ox = x + obj.x * DPI;
          const oy = y + obj.y * DPI;
          const ow = obj.w * DPI;
          const oh = obj.h * DPI;
          if (obj.type === "rect") {
            ctx.fillStyle = obj.fill || "transparent";
            if (obj.fill && obj.fill !== "transparent") ctx.fillRect(ox, oy, ow, oh);
            if (obj.stroke) {
              ctx.strokeStyle = obj.stroke;
              ctx.lineWidth = obj.strokeWidth ?? 1;
              ctx.strokeRect(ox, oy, ow, oh);
            }
          } else if (obj.type === "ellipse") {
            ctx.beginPath();
            ctx.ellipse(ox + ow / 2, oy + oh / 2, ow / 2, oh / 2, 0, 0, Math.PI * 2);
            if (obj.fill && obj.fill !== "transparent") {
              ctx.fillStyle = obj.fill;
              ctx.fill();
            }
            if (obj.stroke) {
              ctx.strokeStyle = obj.stroke;
              ctx.lineWidth = obj.strokeWidth ?? 1;
              ctx.stroke();
            }
          } else {
            const ptToPx = (pt: number) => pt * (DPI / 72);
            const fsPx = ptToPx(obj.fontSize ?? 12);
            const text = resolveDesignText(obj, slot);
            if (text) {
              ctx.fillStyle = obj.color || "#000000";
              const weight = obj.bold ? "bold" : "normal";
              const style = obj.italic ? "italic" : "normal";
              ctx.font = `${style} ${weight} ${fsPx}px ${obj.fontFamily || "Arial"}`;
              ctx.textAlign = obj.align || "left";
              ctx.textBaseline = "top";
              const pad = 2;
              const lines = wrapText(text, ow - pad * 2, fsPx);
              const lh = fsPx * 1.2;
              const lx = obj.align === "center" ? ox + ow / 2 : obj.align === "right" ? ox + ow - pad : ox + pad;
              lines.forEach((line, li) => ctx.fillText(line, lx, oy + pad + li * lh, ow - pad * 2));
            }
          }
        }
        ctx.restore();
      } else if (templateZones && templateZones.length > 0) {
        if (templateBgColor && templateBgColor !== "transparent") {
          ctx.fillStyle = templateBgColor;
          ctx.fillRect(x, y, labelW, labelH);
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, labelW, labelH);
        ctx.clip();

        for (const zone of templateZones) {
          const zx = x + zone.x * labelW;
          const zy = y + zone.y * labelH;
          const zw = zone.w * labelW;
          const zh = zone.h * labelH;
          const isTransparent = !zone.color || zone.color === "transparent";
          const isImage = zone.role === "photo-area" || zone.role === "logo-area";
          const fontSize = fontSizeForZone(zone);
          const lhMultiplier = zone.lineHeight ?? 1.2;
          const pad = Math.max(3, 6 * (DPI / 96));
          const fontWeight = HEADING_CANVAS.has(zone.role) ? "bold" : "normal";
          const autoFg = isTransparent || isLightColor(zone.color || "") ? "#1a1a1a" : "#ffffff";
          const fg = zone.textColor || autoFg;

          if (zone.rotation) {
            ctx.save();
            ctx.translate(zx + zw / 2, zy + zh / 2);
            ctx.rotate((zone.rotation * Math.PI) / 180);
            if (!isTransparent) {
              ctx.fillStyle = zone.color;
              ctx.fillRect(-zw / 2, -zh / 2, zw, zh);
            }
            if (isImage && imageCache[zone.id]) {
              ctx.drawImage(imageCache[zone.id]!, -zw / 2, -zh / 2, zw, zh);
            } else if (!isImage) {
              const text = resolveZoneText(zone, slot);
              if (text) {
                ctx.fillStyle = fg;
                ctx.font = `${fontWeight} ${fontSize}px sans-serif`;
                ctx.textAlign = zone.textAlign || "left";
                ctx.textBaseline = "top";
                const lines = wrapText(text, zw - pad * 2, fontSize);
                const lh = fontSize * lhMultiplier;
                const totalH = lines.length * lh;
                const textAlignY = (zone as LabelZone & { textAlignY?: string }).textAlignY;
                let sy = -zh / 2 + pad;
                if (textAlignY === "middle") sy = -totalH / 2;
                else if (textAlignY === "bottom") sy = zh / 2 - totalH - pad;
                const lx = zone.textAlign === "center" ? 0 : zone.textAlign === "right" ? zw / 2 - pad : -zw / 2 + pad;
                lines.forEach((line, li) => ctx.fillText(line, lx, sy + li * lh));
              }
            }
            ctx.restore();
          } else {
            if (!isTransparent) {
              ctx.fillStyle = zone.color;
              ctx.fillRect(zx, zy, zw, zh);
            }
            if (isImage && imageCache[zone.id]) {
              ctx.drawImage(imageCache[zone.id]!, zx, zy, zw, zh);
            } else if (!isImage) {
              const text = resolveZoneText(zone, slot);
              if (text) {
                ctx.fillStyle = fg;
                ctx.font = `${fontWeight} ${fontSize}px sans-serif`;
                ctx.textAlign = zone.textAlign || "left";
                ctx.textBaseline = "top";
                const lines = wrapText(text, zw - pad * 2, fontSize);
                const lh = fontSize * lhMultiplier;
                const totalH = lines.length * lh;
                const textAlignY = (zone as LabelZone & { textAlignY?: string }).textAlignY;
                let sy = zy + pad;
                if (textAlignY === "middle") sy = zy + (zh - totalH) / 2;
                else if (textAlignY === "bottom") sy = zy + zh - totalH - pad;
                const lx = zone.textAlign === "center" ? zx + zw / 2 : zone.textAlign === "right" ? zx + zw - pad : zx + pad;
                lines.forEach((line, li) => ctx.fillText(line, lx, sy + li * lh));
              }
            }
          }
        }
        ctx.restore();
      } else {
        ctx.strokeStyle = "#d1d5db";
        ctx.lineWidth = 0.5;
        ctx.setLineDash([]);
        ctx.strokeRect(x + 0.25, y + 0.25, labelW - 0.5, labelH - 0.5);
        const pad = px(0.05);
        const cx = x + labelW / 2;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        if (slot.productName) {
          ctx.fillStyle = "#111827";
          ctx.font = `bold ${px(0.09)}px sans-serif`;
          ctx.fillText(slot.productName, cx, y + pad + px(0.09), labelW - pad * 2);
        }
        if (slot.productScentName) {
          ctx.fillStyle = "#6b7280";
          ctx.font = `${px(0.07)}px sans-serif`;
          ctx.fillText(slot.productScentName, cx, y + pad + px(0.18), labelW - pad * 2);
        }
        if (slot.productSize) {
          ctx.fillStyle = "#9ca3af";
          ctx.font = `${px(0.06)}px sans-serif`;
          ctx.fillText(slot.productSize, cx, y + pad + px(0.26), labelW - pad * 2);
        }
      }
    }

    return canvas;
  }, []);

  const captureSheetImages = useCallback(async (): Promise<string[]> => {
    if (!activeSheetForPreview || !previewJob || gangedSheets.length === 0) return [];
    const templateZones = (previewJob.templateZones as LabelZone[] | null) ?? null;
    const templateBgColor = previewJob.templateBgColor ?? null;
    const designObjs = (previewJob.designObjects as DesignObj[] | null) ?? null;
    const designBg = previewJob.designBgColor ?? null;
    const images: string[] = [];
    for (const slots of gangedSheets) {
      const canvas = await drawSheetToCanvas(slots, activeSheetForPreview, templateZones, templateBgColor, designObjs, designBg);
      images.push(canvas.toDataURL("image/png"));
    }
    return images;
  }, [activeSheetForPreview, previewJob, gangedSheets, drawSheetToCanvas]);

  const handlePrint = useCallback(async () => {
    if (!activeSheetForPreview || !previewJob || gangedSheets.length === 0) return;
    const images = await captureSheetImages();
    if (images.length === 0) return;
    const pageW = activeSheetForPreview.pageWidth;
    const pageH = activeSheetForPreview.pageHeight;
    const win = window.open("", "_blank");
    if (!win) return;
    const html = `<!DOCTYPE html><html><head><title>${previewJob.name || "Print Job"}</title><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      @page { size: ${pageW}in ${pageH}in; margin: 0; }
      body { background: white; }
      .sheet { width: ${pageW}in; height: ${pageH}in; page-break-after: always; display: flex; align-items: flex-start; justify-content: flex-start; overflow: hidden; }
      .sheet img { width: 100%; height: 100%; display: block; }
      .sheet:last-child { page-break-after: auto; }
    </style></head><body>
      ${images.map(src => `<div class="sheet"><img src="${src}" /></div>`).join("")}
      <script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };<\/script>
    </body></html>`;
    win.document.write(html);
    win.document.close();
  }, [activeSheetForPreview, previewJob, gangedSheets, captureSheetImages]);

  const handleDownloadPdf = useCallback(async () => {
    if (!activeSheetForPreview || !previewJob || gangedSheets.length === 0) {
      toast({ title: "Nothing to export", variant: "destructive" });
      return;
    }
    setIsDownloadingPdf(true);
    try {
      const [{ default: jsPDF }, images] = await Promise.all([
        import("jspdf"),
        captureSheetImages(),
      ]);
      if (images.length === 0) throw new Error("No sheets to export");
      const pageW = activeSheetForPreview.pageWidth;
      const pageH = activeSheetForPreview.pageHeight;
      const orientation = pageW >= pageH ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation, unit: "in", format: [pageW, pageH] });

      for (let i = 0; i < images.length; i++) {
        if (i > 0) pdf.addPage([pageW, pageH], orientation);
        pdf.addImage(images[i], "PNG", 0, 0, pageW, pageH);
      }

      const jobName = previewJob.name?.replace(/[^a-z0-9]/gi, "_") || "print_job";
      pdf.save(`${jobName}.pdf`);
      toast({ title: "PDF downloaded" });
    } catch (err) {
      console.error("PDF export error:", err);
      toast({ title: "PDF export failed", description: String(err), variant: "destructive" });
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [activeSheetForPreview, previewJob, gangedSheets, captureSheetImages, toast]);

  const totalLabelsInForm = useMemo(() => {
    return formData.items.reduce((s, i) => s + (i.quantity || 0), 0);
  }, [formData.items]);

  const sheetsNeededInForm = useMemo(() => {
    if (usableSlotsPerSheet <= 0) return 0;
    return Math.ceil(totalLabelsInForm / usableSlotsPerSheet);
  }, [usableSlotsPerSheet, totalLabelsInForm]);

  useEffect(() => {
    setTopBarState({
      actions: (
        <Button onClick={openCreate} data-testid="button-create-job" size="sm" className="h-7 text-xs">
          <Plus className="w-3.5 h-3.5 mr-1" />
          New Print Job
        </Button>
      ),
    });
    return () => setTopBarState({});
  }, []);

  return (
    <PageWrapper>
    <div className="space-y-6 animate-in fade-in duration-500">

      <div className="border rounded-md bg-card print:hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job Name</TableHead>
              <TableHead>Sheet Type</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : printJobs?.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">No print jobs found.</TableCell></TableRow>
            ) : (
              printJobs?.map(job => (
                <TableRow
                  key={job.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openEdit(job)}
                >
                  <TableCell className="font-medium">
                    <div>{job.name}</div>
                    {job.jobType === "reprint" && (
                      <Badge variant="outline" className="text-xs mt-0.5 bg-amber-50 text-amber-700 border-amber-200">Reprint</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>{job.labelSheetBrand}</div>
                    <div className="text-xs text-muted-foreground">{job.labelSheetCode}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{job.totalLabels} labels</div>
                    <div className="text-xs text-muted-foreground">{job.totalSheets} sheet(s)</div>
                    {job.blankSlots && job.blankSlots.length > 0 && (
                      <div className="text-xs text-orange-600">{job.blankSlots.length} blank slot(s)</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      job.status === 'printed' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30' : 
                      job.status === 'ready' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30' : ''
                    }>
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(job.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right space-x-2" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => setPreviewJob(job)}>
                      <Eye className="w-4 h-4 mr-2" /> Preview
                    </Button>
                    {job.status !== 'printed' && (
                      <Button variant="outline" size="sm" onClick={() => statusMutation.mutate({ id: job.id, data: { status: "printed" } })}>
                        <CheckCircle className="w-4 h-4 mr-2" /> Mark Printed
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* CREATE DRAWER */}
      <Sheet open={workspaceOpen} onOpenChange={setWorkspaceOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <SheetTitle>{editJobId !== null ? "Edit Print Job" : "New Print Job"}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <form id="create-job-form" onSubmit={handleSubmit} className="space-y-6">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Job Name</Label>
                  <Input required value={formData.name} onChange={e => setFormData(p => ({...p, name: e.target.value}))} />
                </div>
                <div className="space-y-2">
                  <Label>Label Sheet *</Label>
                  <Select required value={formData.labelSheetId} onValueChange={handleSheetChange}>
                    <SelectTrigger><SelectValue placeholder="Select sheet" /></SelectTrigger>
                    <SelectContent>
                      {sheets?.map(s => (
                        <SelectItem key={s.id} value={s.id.toString()}>
                          {s.brand} {s.code} ({s.labelsAcross * s.labelsDown}/sheet)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Label Design (Zone Template) */}
              <div className="space-y-2">
                <Label>Zone Template</Label>
                <Select
                  value={formData.labelTemplateId || "none"}
                  onValueChange={v => setFormData(p => ({ ...p, labelTemplateId: v === "none" ? "" : v, labelDesignId: v === "none" ? p.labelDesignId : "" }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No zone template — plain text fallback" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (plain text)</SelectItem>
                    {templates?.map(t => (
                      <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Zone text is auto-filled from each product's data. Use one renderer at a time — selecting a Visual Design below will override this.</p>
              </div>

              {/* Visual Design File */}
              <div className="space-y-2">
                <Label>Visual Design File</Label>
                <Select
                  value={formData.labelDesignId || "none"}
                  onValueChange={v => setFormData(p => ({ ...p, labelDesignId: v === "none" ? "" : v, labelTemplateId: v === "none" ? p.labelTemplateId : "" }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No visual design" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {designs?.map(d => (
                      <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Use a design file created in the Designs editor. Design objects with roles will auto-substitute product data. Overrides the zone template above.</p>
              </div>

              {/* Reprint toggle */}
              <div className="flex items-center gap-3 p-3 border rounded-md bg-secondary/20">
                <Switch
                  id="reprint-toggle"
                  checked={formData.jobType === "reprint"}
                  onCheckedChange={handleJobTypeToggle}
                />
                <div>
                  <Label htmlFor="reprint-toggle" className="cursor-pointer font-medium">Partial / Reprint Sheet</Label>
                  <p className="text-xs text-muted-foreground">Mark positions that were already printed on this sheet</p>
                </div>
              </div>

              {/* Blank slot editor — only show when sheet selected */}
              {selectedSheet && (
                <div className="border rounded-md p-4 bg-secondary/10 space-y-2">
                  <BlankSlotEditor
                    labelsAcross={selectedSheet.labelsAcross}
                    labelsDown={selectedSheet.labelsDown}
                    blankSlots={formData.blankSlots}
                    onChange={slots => setFormData(p => ({ ...p, blankSlots: slots }))}
                    isReprintMode={formData.jobType === "reprint"}
                  />
                  {sheetsNeededInForm > 0 && (
                    <p className="text-xs text-muted-foreground pt-1 border-t">
                      {totalLabelsInForm} label(s) → {sheetsNeededInForm} sheet(s) needed
                      ({usableSlotsPerSheet} usable slot(s)/sheet after blanks)
                    </p>
                  )}
                </div>
              )}

              {/* Products */}
              <div className="border rounded-md p-4 bg-secondary/20 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium">Products to Print</h4>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                    <Plus className="w-4 h-4 mr-2" /> Add Product
                  </Button>
                </div>
                <div className="space-y-3">
                  {formData.items.map((item, index) => (
                    <div key={index} className="flex gap-3 items-center">
                      <Select 
                        value={item.productId.toString()} 
                        onValueChange={val => handleItemChange(index, "productId", parseInt(val))}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products?.map(p => (
                            <SelectItem key={p.id} value={p.id.toString()}>{p.name} — {p.scentName} ({p.size})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="w-20 flex items-center gap-2">
                        <Label className="sr-only">Qty</Label>
                        <Input 
                          type="number" 
                          min="1" 
                          value={item.quantity} 
                          onChange={e => handleItemChange(index, "quantity", parseInt(e.target.value) || 0)} 
                        />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="text-destructive shrink-0" onClick={() => handleRemoveItem(index)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {formData.items.length === 0 && (
                    <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded bg-background">
                      Add products to your print job.
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={formData.notes}
                  onChange={e => setFormData(p => ({...p, notes: e.target.value}))}
                  rows={2}
                  placeholder="Any additional notes..."
                />
              </div>
            </form>
          </div>
          <div className="px-6 py-4 border-t flex justify-end gap-2 shrink-0">
            <Button variant="outline" onClick={() => setWorkspaceOpen(false)}>Cancel</Button>
            <Button
              type="submit"
              form="create-job-form"
              disabled={(editJobId !== null ? editMutation.isPending : createMutation.isPending) || formData.items.length === 0 || !formData.labelSheetId}
            >
              {editJobId !== null ? "Save Changes" : "Create Job"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* PREVIEW DIALOG */}
      <Dialog open={!!previewJob} onOpenChange={(open) => !open && setPreviewJob(null)}>
        <DialogContent className="max-w-5xl w-[90vw] h-[90vh] flex flex-col p-0 overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center bg-muted/20 shrink-0 print:hidden">
            <div>
              <DialogTitle className="text-xl">{previewJob?.name}</DialogTitle>
              <div className="text-sm text-muted-foreground mt-1">
                {activeSheetForPreview?.brand} {activeSheetForPreview?.code}
                {" "}•{" "}
                {previewJob?.totalLabels} labels
                {" "}•{" "}
                {gangedSheets.length} sheet(s)
                {previewJob?.blankSlots?.length > 0 && (
                  <span className="text-orange-600"> • {previewJob.blankSlots.length} blank slot(s)</span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreviewJob(null)}>Close</Button>
              <Button variant="outline" onClick={handleDownloadPdf} disabled={isDownloadingPdf}>
                <FileDown className="w-4 h-4 mr-2" />
                {isDownloadingPdf ? "Exporting..." : "Download PDF"}
              </Button>
              <Button onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" /> Print Now
              </Button>
            </div>
          </div>
          
          <div
            ref={previewRef}
            className="flex-1 overflow-auto bg-secondary/50 p-8 flex flex-col items-center gap-8 print:p-0 print:bg-white print:block"
          >
            {activeSheetForPreview && previewJob && gangedSheets.map((sheetSlots, sheetIndex) => (
              <div
                key={sheetIndex}
                data-sheet-page={sheetIndex}
                className="bg-white shadow-lg relative print:shadow-none print:m-0 print:border-none border"
                style={{
                  width: `${activeSheetForPreview.pageWidth}in`,
                  height: `${activeSheetForPreview.pageHeight}in`,
                  paddingTop: `${activeSheetForPreview.topMargin}in`,
                  paddingLeft: `${activeSheetForPreview.leftMargin}in`,
                  pageBreakAfter: "always",
                  flexShrink: 0,
                }}
              >
                <div className="absolute top-1 left-2 text-[7pt] text-gray-300 print:hidden select-none">
                  Sheet {sheetIndex + 1} of {gangedSheets.length}
                </div>
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${activeSheetForPreview.labelsAcross}, ${activeSheetForPreview.labelWidth}in)`,
                    gridTemplateRows: `repeat(${activeSheetForPreview.labelsDown}, ${activeSheetForPreview.labelHeight}in)`,
                    columnGap: `${activeSheetForPreview.horizontalGap}in`,
                    rowGap: `${activeSheetForPreview.verticalGap}in`,
                  }}
                >
                  {sheetSlots.map((slot, i) => (
                    <LabelCell
                      key={i}
                      slot={slot}
                      sheet={activeSheetForPreview}
                      templateZones={previewJob?.templateZones as LabelZone[] | null}
                      templateBgColor={previewJob?.templateBgColor}
                      designObjects={previewJob?.designObjects as DesignObj[] | null}
                      designBgColor={previewJob?.designBgColor}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </PageWrapper>
  );
}
