import { useState } from "react";
import { 
  useGetLabelSheets, 
  useCreateLabelSheet, 
  useUpdateLabelSheet, 
  useDeleteLabelSheet,
  getGetLabelSheetsQueryKey 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Layers, Plus, Maximize, Grip, Trash2, Edit2 } from "lucide-react";

export default function LabelSheets() {
  const { data: sheets, isLoading } = useGetLabelSheets({ query: { queryKey: getGetLabelSheetsQueryKey() } });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const handleEdit = (sheet: any) => {
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
      pageWidth: Number(formData.pageWidth),
      pageHeight: Number(formData.pageHeight),
      labelWidth: Number(formData.labelWidth),
      labelHeight: Number(formData.labelHeight),
      labelsAcross: Number(formData.labelsAcross),
      labelsDown: Number(formData.labelsDown),
      topMargin: Number(formData.topMargin),
      leftMargin: Number(formData.leftMargin),
      horizontalGap: Number(formData.horizontalGap),
      verticalGap: Number(formData.verticalGap),
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
            <Card key={i} className="animate-pulse h-64 border-muted"></Card>
          ))
        ) : sheets?.map((sheet) => (
          <Card key={sheet.id} className="flex flex-col overflow-hidden hover:shadow-md transition-shadow group">
            <CardHeader className="bg-secondary/40 pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <Badge variant="outline" className="mb-2 bg-background">{sheet.brand}</Badge>
                  <CardTitle className="text-lg">{sheet.name}</CardTitle>
                  <CardDescription className="font-mono mt-1">{sheet.code}</CardDescription>
                </div>
                <div className="w-12 h-16 bg-white border shadow-sm rounded-sm p-1 flex flex-col gap-0.5">
                  {/* Miniature representation of the sheet */}
                  <div className="w-full h-full border border-dashed border-gray-300 rounded-[1px] relative">
                     <div className="absolute inset-0 m-0.5 grid gap-px opacity-30" 
                          style={{
                            gridTemplateColumns: `repeat(${sheet.labelsAcross}, 1fr)`,
                            gridTemplateRows: `repeat(${sheet.labelsDown}, 1fr)`
                          }}>
                        {Array.from({length: Math.min(sheet.labelsAcross * sheet.labelsDown, 30)}).map((_, i) => (
                          <div key={i} className={`bg-primary ${sheet.shape === 'circle' ? 'rounded-full' : 'rounded-[1px]'}`}></div>
                        ))}
                     </div>
                  </div>
                </div>
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
                  <div className="text-xs text-muted-foreground mt-0.5">{sheet.labelsAcross * sheet.labelsDown} labels/sheet</div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-secondary/10 border-t py-3 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" onClick={() => handleEdit(sheet)}>
                <Edit2 className="w-4 h-4 mr-2" /> Edit
              </Button>
              {sheet.isCustom && (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => {
                  if(window.confirm("Delete this label sheet?")) {
                    deleteMutation.mutate({ id: sheet.id });
                  }
                }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>

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
                <Label>Template Code (e.g. Avery 8160)</Label>
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
              <div className="space-y-2"></div>

              <div className="space-y-2">
                <Label>Label Width (in)</Label>
                <Input type="number" step="0.01" value={formData.labelWidth} onChange={e => setFormData({...formData, labelWidth: e.target.value})} required />
              </div>
              <div className="space-y-2">
                <Label>Label Height (in)</Label>
                <Input type="number" step="0.01" value={formData.labelHeight} onChange={e => setFormData({...formData, labelHeight: e.target.value})} required />
              </div>

              <div className="space-y-2">
                <Label>Labels Across (Columns)</Label>
                <Input type="number" value={formData.labelsAcross} onChange={e => setFormData({...formData, labelsAcross: e.target.value})} required />
              </div>
              <div className="space-y-2">
                <Label>Labels Down (Rows)</Label>
                <Input type="number" value={formData.labelsDown} onChange={e => setFormData({...formData, labelsDown: e.target.value})} required />
              </div>

              <div className="col-span-2 border-t pt-4 mt-2">
                <h4 className="text-sm font-medium mb-4">Page & Margins</h4>
              </div>

              <div className="space-y-2">
                <Label>Top Margin (in)</Label>
                <Input type="number" step="0.01" value={formData.topMargin} onChange={e => setFormData({...formData, topMargin: e.target.value})} required />
              </div>
              <div className="space-y-2">
                <Label>Left Margin (in)</Label>
                <Input type="number" step="0.01" value={formData.leftMargin} onChange={e => setFormData({...formData, leftMargin: e.target.value})} required />
              </div>

              <div className="space-y-2">
                <Label>Horizontal Gap (in)</Label>
                <Input type="number" step="0.01" value={formData.horizontalGap} onChange={e => setFormData({...formData, horizontalGap: e.target.value})} required />
              </div>
              <div className="space-y-2">
                <Label>Vertical Gap (in)</Label>
                <Input type="number" step="0.01" value={formData.verticalGap} onChange={e => setFormData({...formData, verticalGap: e.target.value})} required />
              </div>

              <div className="space-y-2">
                <Label>Page Width (in)</Label>
                <Input type="number" step="0.01" value={formData.pageWidth} onChange={e => setFormData({...formData, pageWidth: e.target.value})} required />
              </div>
              <div className="space-y-2">
                <Label>Page Height (in)</Label>
                <Input type="number" step="0.01" value={formData.pageHeight} onChange={e => setFormData({...formData, pageHeight: e.target.value})} required />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit">{editingId ? 'Update Sheet' : 'Create Sheet'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
