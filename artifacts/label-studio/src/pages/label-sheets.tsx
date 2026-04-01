import { useState } from "react";
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
import { Layers, Plus, Maximize, Grip, Trash2, Edit2, X, ZoomIn } from "lucide-react";

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
  isCustom: boolean;
};

function SheetPreview({ sheet }: { sheet: LabelSheet }) {
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

  const borderRadius =
    sheet.shape === "circle" ? "50%"
    : sheet.shape === "oval"  ? "50%"
    : "2px";

  const pctScale = Math.round((PREVIEW_W / (sheet.pageWidth * 96)) * 100);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative bg-white shadow-[0_4px_24px_rgba(0,0,0,0.18)] border border-gray-200 flex-shrink-0"
        style={{ width: PREVIEW_W, height: PREVIEW_H }}
      >
        {/* Page background tint outside label area */}
        <div className="absolute inset-0 bg-[#f5f5f0]" />

        {/* Labels */}
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
            {/* Crosshair corner marks */}
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

        {/* Scale watermark */}
        <div className="absolute bottom-1.5 right-2 text-[9px] text-gray-400 font-mono select-none">
          {sheet.pageWidth}" × {sheet.pageHeight}"
        </div>
      </div>

      {/* Spec table */}
      <div className="w-full max-w-[480px] rounded-lg border bg-muted/30 text-sm overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-y divide-border">
          {[
            ["Label Size",       `${sheet.labelWidth}" × ${sheet.labelHeight}"`],
            ["Shape",            sheet.shape.charAt(0).toUpperCase() + sheet.shape.slice(1)],
            ["Labels per Sheet", `${sheet.labelsAcross * sheet.labelsDown} (${sheet.labelsAcross} × ${sheet.labelsDown})`],
            ["Page Size",        `${sheet.pageWidth}" × ${sheet.pageHeight}"`],
            ["Top Margin",       `${sheet.topMargin}"`],
            ["Left Margin",      `${sheet.leftMargin}"`],
            ["Horizontal Gap",   `${sheet.horizontalGap}"`],
            ["Vertical Gap",     `${sheet.verticalGap}"`],
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

export default function LabelSheets() {
  const { data: sheets, isLoading } = useGetLabelSheets({ query: { queryKey: getGetLabelSheetsQueryKey() } });
  const [isDialogOpen, setIsDialogOpen]       = useState(false);
  const [previewSheet, setPreviewSheet]        = useState<LabelSheet | null>(null);
  const [editingId, setEditingId]              = useState<number | null>(null);
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
    brand: "Avery",
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
    shape: "rectangle" as "rectangle" | "circle" | "oval"
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
      shape: sheet.shape
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
      shape: "rectangle"
    });
    setEditingId(null);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      pageWidth:     Number(formData.pageWidth),
      pageHeight:    Number(formData.pageHeight),
      labelWidth:    Number(formData.labelWidth),
      labelHeight:   Number(formData.labelHeight),
      labelsAcross:  Number(formData.labelsAcross),
      labelsDown:    Number(formData.labelsDown),
      topMargin:     Number(formData.topMargin),
      leftMargin:    Number(formData.leftMargin),
      horizontalGap: Number(formData.horizontalGap),
      verticalGap:   Number(formData.verticalGap),
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
        <Button onClick={handleCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Custom Sheet
        </Button>
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
                  <Badge variant="outline" className="mb-2 bg-background">{sheet.brand}</Badge>
                  <CardTitle className="text-lg leading-snug">{sheet.name}</CardTitle>
                  <CardDescription className="font-mono mt-1">{sheet.code}</CardDescription>
                </div>

                {/* Thumbnail — click to open preview */}
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
                  {/* Hover zoom hint */}
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

            <CardFooter className="bg-secondary/10 border-t py-3 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" onClick={() => handleEdit(sheet as LabelSheet)}>
                <Edit2 className="w-4 h-4 mr-2" /> Edit
              </Button>
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
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Label Sheet" : "New Custom Label Sheet"}</DialogTitle>
            <DialogDescription>
              Enter the exact measurements from the manufacturer's spec sheet. All measurements in inches.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 py-4">
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
                <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. 1x2.625 Address Labels" required />
              </div>

              <div className="col-span-2 border-t pt-4 mt-2">
                <h4 className="text-sm font-medium mb-4">Label Specifications</h4>
              </div>

              <div className="space-y-2">
                <Label>Shape</Label>
                <Select value={formData.shape} onValueChange={(v: any) => setFormData({...formData, shape: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rectangle">Rectangle</SelectItem>
                    <SelectItem value="circle">Circle</SelectItem>
                    <SelectItem value="oval">Oval</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2" />

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
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit">{editingId ? "Update Sheet" : "Create Sheet"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
