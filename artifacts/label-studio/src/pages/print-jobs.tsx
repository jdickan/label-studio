import { useState, useMemo } from "react";
import { 
  useGetPrintJobs, 
  useCreatePrintJob, 
  useGetLabelSheets, 
  useGetProducts,
  useUpdatePrintJob,
  getGetPrintJobsQueryKey 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
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
import { Plus, Printer, FileDown, CheckCircle, Trash2, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PrintJobs() {
  const { data: printJobs, isLoading } = useGetPrintJobs({ query: { queryKey: getGetPrintJobsQueryKey() } });
  const { data: sheets } = useGetLabelSheets({ query: { queryKey: ["labelSheets"] } });
  const { data: products } = useGetProducts({ query: { queryKey: ["products"] } });
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [previewJob, setPreviewJob] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    labelSheetId: "",
    items: [] as { productId: number, quantity: number }[]
  });
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreatePrintJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPrintJobsQueryKey() });
        toast({ title: "Print job created" });
        setIsCreateOpen(false);
      },
      onError: (err: any) => {
        toast({ title: "Failed to create print job", description: err.message, variant: "destructive" });
      }
    }
  });

  const updateMutation = useUpdatePrintJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPrintJobsQueryKey() });
        toast({ title: "Status updated" });
      }
    }
  });

  const handleCreate = () => {
    setFormData({
      name: `Print Job - ${format(new Date(), "MMM d")}`,
      labelSheetId: "",
      items: [{ productId: products?.[0]?.id || 0, quantity: 1 }]
    });
    setIsCreateOpen(true);
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { productId: products?.[0]?.id || 0, quantity: 1 }]
    });
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...formData.items];
    newItems.splice(index, 1);
    setFormData({ ...formData, items: newItems });
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.labelSheetId) return;
    
    createMutation.mutate({
      data: {
        name: formData.name,
        labelSheetId: parseInt(formData.labelSheetId),
        items: formData.items.filter(i => i.productId > 0 && i.quantity > 0)
      }
    });
  };

  const markPrinted = (id: number) => {
    updateMutation.mutate({ id, data: { status: "printed" } });
  };

  const openPreview = (job: any) => {
    setPreviewJob(job);
  };

  const handlePrint = () => {
    window.print();
  };

  const activeSheetForPreview = useMemo(() => {
    if (!previewJob || !sheets) return null;
    return sheets.find(s => s.id === previewJob.labelSheetId);
  }, [previewJob, sheets]);

  const expandedLabels = useMemo(() => {
    if (!previewJob) return [];
    const labels = [];
    for (const item of previewJob.items) {
      for (let i = 0; i < item.quantity; i++) {
        labels.push(item);
      }
    }
    return labels;
  }, [previewJob]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Print Jobs</h1>
          <p className="text-muted-foreground mt-1">Batch products and generate print-ready sheets.</p>
        </div>
        <Button onClick={handleCreate} data-testid="button-create-job">
          <Plus className="w-4 h-4 mr-2" />
          New Print Job
        </Button>
      </div>

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
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.name}</TableCell>
                  <TableCell>
                    <div>{job.labelSheetBrand}</div>
                    <div className="text-xs text-muted-foreground">{job.labelSheetCode}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{job.totalLabels} labels</div>
                    <div className="text-xs text-muted-foreground">{job.totalSheets} sheets needed</div>
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
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => openPreview(job)}>
                      <Eye className="w-4 h-4 mr-2" /> Preview
                    </Button>
                    {job.status !== 'printed' && (
                      <Button variant="outline" size="sm" onClick={() => markPrinted(job.id)}>
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

      {/* CREATE DIALOG */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>New Print Job</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4">
            <form id="create-job-form" onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Job Name</Label>
                  <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Label Sheet *</Label>
                  <Select required value={formData.labelSheetId} onValueChange={val => setFormData({...formData, labelSheetId: val})}>
                    <SelectTrigger><SelectValue placeholder="Select sheet" /></SelectTrigger>
                    <SelectContent>
                      {sheets?.map(s => (
                        <SelectItem key={s.id} value={s.id.toString()}>{s.brand} {s.code} ({s.labelsAcross * s.labelsDown} labels/sheet)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border rounded-md p-4 bg-secondary/20">
                <div className="flex justify-between items-center mb-4">
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
                            <SelectItem key={p.id} value={p.id.toString()}>{p.name} - {p.scentName} ({p.size})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="w-24 flex items-center gap-2">
                        <Label className="sr-only">Quantity</Label>
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
            </form>
          </div>
          <div className="pt-4 border-t flex justify-end gap-2 shrink-0">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button type="submit" form="create-job-form" disabled={createMutation.isPending || formData.items.length === 0 || !formData.labelSheetId}>
              Create Job
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PREVIEW DIALOG */}
      <Dialog open={!!previewJob} onOpenChange={(open) => !open && setPreviewJob(null)}>
        <DialogContent className="max-w-5xl w-[90vw] h-[90vh] flex flex-col p-0 overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center bg-muted/20 shrink-0 print:hidden">
            <div>
              <DialogTitle className="text-xl">{previewJob?.name}</DialogTitle>
              <div className="text-sm text-muted-foreground mt-1">
                {activeSheetForPreview?.brand} {activeSheetForPreview?.code} • {previewJob?.totalLabels} labels • {previewJob?.totalSheets} sheet(s)
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreviewJob(null)}>Close</Button>
              <Button onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" /> Print Now
              </Button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto bg-secondary/50 p-8 flex flex-col items-center gap-8 print:p-0 print:bg-white print:block">
            {/* Render sheets */}
            {activeSheetForPreview && previewJob && (() => {
              const labelsPerSheet = activeSheetForPreview.labelsAcross * activeSheetForPreview.labelsDown;
              const sheetCount = Math.ceil(expandedLabels.length / labelsPerSheet) || 1;
              const sheetsRender = [];

              for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex++) {
                const sheetLabels = expandedLabels.slice(sheetIndex * labelsPerSheet, (sheetIndex + 1) * labelsPerSheet);
                
                sheetsRender.push(
                  <div 
                    key={sheetIndex}
                    className="bg-white shadow-lg relative print:shadow-none print:m-0 print:border-none border"
                    style={{
                      width: `${activeSheetForPreview.pageWidth}in`,
                      height: `${activeSheetForPreview.pageHeight}in`,
                      paddingTop: `${activeSheetForPreview.topMargin}in`,
                      paddingLeft: `${activeSheetForPreview.leftMargin}in`,
                      pageBreakAfter: 'always'
                    }}
                  >
                    <div 
                      className="grid"
                      style={{
                        gridTemplateColumns: `repeat(${activeSheetForPreview.labelsAcross}, ${activeSheetForPreview.labelWidth}in)`,
                        gridTemplateRows: `repeat(${activeSheetForPreview.labelsDown}, ${activeSheetForPreview.labelHeight}in)`,
                        columnGap: `${activeSheetForPreview.horizontalGap}in`,
                        rowGap: `${activeSheetForPreview.verticalGap}in`,
                      }}
                    >
                      {Array.from({ length: labelsPerSheet }).map((_, i) => {
                        const label = sheetLabels[i];
                        return (
                          <div 
                            key={i} 
                            className={`border flex flex-col items-center justify-center p-2 text-center overflow-hidden
                              ${activeSheetForPreview.shape === 'circle' ? 'rounded-full' : 
                                activeSheetForPreview.shape === 'oval' ? 'rounded-[50%]' : 'rounded-sm'}
                              ${!label ? 'border-dashed border-gray-200 print:border-transparent' : 'border-gray-300 print:border-transparent'}
                            `}
                            style={{
                              width: `${activeSheetForPreview.labelWidth}in`,
                              height: `${activeSheetForPreview.labelHeight}in`,
                            }}
                          >
                            {label && (
                              <div style={{ fontKerning: "normal", fontFeatureSettings: '"kern" 1', textRendering: "optimizeLegibility" }}>
                                <div className="font-bold text-[10pt] leading-tight mb-1">{label.productName}</div>
                                <div className="text-[8pt] text-gray-600 leading-tight mb-2">{label.productScentName}</div>
                                <div className="text-[7pt] text-gray-400 mt-auto">{label.productSize}</div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              return sheetsRender;
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
