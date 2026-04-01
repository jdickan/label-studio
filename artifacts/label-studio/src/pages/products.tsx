import { useState, useMemo, useRef } from "react";
import { 
  useGetProducts, 
  useCreateProduct, 
  useUpdateProduct, 
  useDeleteProduct,
  useGetLabelTemplates,
  getGetProductsQueryKey,
  getGetProductQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Sheet, 
  SheetContent, 
  SheetDescription, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger 
} from "@/components/ui/sheet";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, MoreHorizontal, Check, Edit2, Trash2, Download, Upload } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

const CSV_HEADERS = ["sku","productType","name","scentName","scentNotes","size","weight","ingredients","instructions","burnTime","waxType","location","warnings","isActive"] as const;

function parseCsvRow(row: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      result.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function toCsvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Products() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useGetProducts(
    { query: { search: search || undefined, productType: typeFilter !== "all" ? typeFilter : undefined } },
    { query: { queryKey: getGetProductsQueryKey({ search: search || undefined, productType: typeFilter !== "all" ? typeFilter : undefined }) } }
  );

  const { data: allProducts } = useGetProducts({}, { query: { queryKey: getGetProductsQueryKey() } });
  const uniqueProductTypes = useMemo(() => {
    const types = new Set<string>(["soy_candle", "room_spray", "room_diffuser"]);
    allProducts?.forEach(p => { if (p.productType) types.add(p.productType); });
    return Array.from(types).sort();
  }, [allProducts]);

  const { data: templates } = useGetLabelTemplates({ query: { queryKey: ["labelTemplates"] } });

  const createMutation = useCreateProduct({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
        toast({ title: "Product created successfully" });
        setIsSheetOpen(false);
      },
      onError: () => toast({ title: "Failed to create product", variant: "destructive" })
    }
  });

  const updateMutation = useUpdateProduct({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
        toast({ title: "Product updated successfully" });
        setIsSheetOpen(false);
      },
      onError: () => toast({ title: "Failed to update product", variant: "destructive" })
    }
  });

  const deleteMutation = useDeleteProduct({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
        toast({ title: "Product deleted successfully" });
      }
    }
  });

  const [formData, setFormData] = useState({
    productType: "soy_candle",
    name: "",
    scentName: "",
    scentNotes: "",
    size: "",
    weight: "",
    ingredients: "",
    instructions: "",
    burnTime: "",
    waxType: "",
    location: "",
    warnings: "",
    sku: "",
    isActive: true,
    labelTemplateId: "none"
  });

  const handleEdit = (product: any) => {
    setFormData({
      productType: product.productType,
      name: product.name,
      scentName: product.scentName,
      scentNotes: product.scentNotes || "",
      size: product.size,
      weight: product.weight || "",
      ingredients: product.ingredients || "",
      instructions: product.instructions || "",
      burnTime: product.burnTime || "",
      waxType: product.waxType || "",
      location: product.location || "",
      warnings: product.warnings || "",
      sku: product.sku || "",
      isActive: product.isActive,
      labelTemplateId: product.labelTemplateId ? product.labelTemplateId.toString() : "none"
    });
    setEditingId(product.id);
    setIsSheetOpen(true);
  };

  const handleCreate = () => {
    setFormData({
      productType: "soy_candle",
      name: "",
      scentName: "",
      scentNotes: "",
      size: "",
      weight: "",
      ingredients: "",
      instructions: "",
      burnTime: "",
      waxType: "",
      location: "",
      warnings: "",
      sku: "",
      isActive: true,
      labelTemplateId: "none"
    });
    setEditingId(null);
    setIsSheetOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      productType: formData.productType,
      labelTemplateId: formData.labelTemplateId === "none" ? undefined : parseInt(formData.labelTemplateId)
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  const formatProductType = (type: string) => {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const handleDownloadCsv = () => {
    const prods = allProducts ?? [];
    const rows = [CSV_HEADERS.join(",")];
    for (const p of prods) {
      rows.push(CSV_HEADERS.map(h => toCsvCell((p as any)[h])).join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "products.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setIsImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { toast({ title: "CSV has no data rows", variant: "destructive" }); return; }
      const headers = parseCsvRow(lines[0]).map(h => h.trim().toLowerCase());
      let created = 0, failed = 0;
      for (let i = 1; i < lines.length; i++) {
        const vals = parseCsvRow(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = vals[idx]?.trim() ?? ""; });
        const productType = row["producttype"] || row["product_type"] || "soy_candle";
        const name = row["name"] || "";
        const scentName = row["scentname"] || row["scent_name"] || row["scent"] || "";
        if (!name) { failed++; continue; }
        try {
          await new Promise<void>((resolve, reject) => {
            createMutation.mutate({
              data: {
                productType,
                name,
                scentName,
                scentNotes: row["scentnotes"] || row["scent_notes"] || "",
                size: row["size"] || "",
                weight: row["weight"] || "",
                ingredients: row["ingredients"] || "",
                instructions: row["instructions"] || "",
                burnTime: row["burntime"] || row["burn_time"] || "",
                waxType: row["waxtype"] || row["wax_type"] || "",
                location: row["location"] || "",
                warnings: row["warnings"] || "",
                sku: row["sku"] || "",
                isActive: row["isactive"] !== "false",
              }
            }, { onSuccess: () => resolve(), onError: () => reject() });
          });
          created++;
        } catch { failed++; }
      }
      queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
      toast({ title: `Import complete: ${created} added${failed ? `, ${failed} failed` : ""}` });
    } catch {
      toast({ title: "Failed to parse CSV", variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground mt-1">Manage your catalog and formula details.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImportCsv}
          />
          <Button variant="outline" size="sm" onClick={handleDownloadCsv} title="Download all products as a spreadsheet">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => csvInputRef.current?.click()}
            disabled={isImporting}
            title="Upload a CSV to bulk-create products"
          >
            <Upload className="w-4 h-4 mr-2" />
            {isImporting ? "Importing…" : "Import CSV"}
          </Button>
          <Button onClick={handleCreate} data-testid="button-create-product">
            <Plus className="w-4 h-4 mr-2" />
            New Product
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center mb-4 bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search products..." 
            className="pl-9" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-products"
          />
        </div>
        <div className="w-full sm:w-48">
          <Select value={typeFilter} onValueChange={setTypeFilter} data-testid="select-type-filter">
            <SelectTrigger>
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {uniqueProductTypes.map(t => (
                <SelectItem key={t} value={t}>{formatProductType(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Scent</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">Loading products...</TableCell>
              </TableRow>
            ) : products?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No products found matching your search.</TableCell>
              </TableRow>
            ) : (
              products?.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>{product.scentName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal capitalize">
                      {formatProductType(product.productType)}
                    </Badge>
                  </TableCell>
                  <TableCell>{product.size}</TableCell>
                  <TableCell>
                    {product.isActive ? (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 font-normal border-green-200">Active</Badge>
                    ) : (
                      <Badge variant="secondary" className="font-normal">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(product)}>
                          <Edit2 className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive" 
                          onClick={() => {
                            if (window.confirm("Are you sure you want to delete this product?")) {
                              deleteMutation.mutate({ id: product.id });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{editingId ? "Edit Product" : "New Product"}</SheetTitle>
            <SheetDescription>
              Details for your product that will appear on labels.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Product Type</Label>
                  <Input
                    list="product-type-suggestions"
                    value={formData.productType}
                    onChange={e => setFormData({...formData, productType: e.target.value})}
                    placeholder="e.g. soy_candle, room_spray…"
                    className="text-sm"
                    required
                  />
                  <datalist id="product-type-suggestions">
                    {["soy_candle", "room_spray", "room_diffuser", "beeswax_candle", "gel_candle", "reed_diffuser", "car_freshener", "bath_bomb", "other"]
                      .map(v => <option key={v} value={v} />)}
                  </datalist>
                  <p className="text-[10px] text-muted-foreground">Type any value or pick a suggestion</p>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex items-center space-x-2 h-10">
                    <Switch 
                      checked={formData.isActive} 
                      onCheckedChange={(val) => setFormData({...formData, isActive: val})}
                    />
                    <span className="text-sm">{formData.isActive ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Product Name *</Label>
                <Input required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="e.g. Signature Candle" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Scent Name *</Label>
                  <Input required value={formData.scentName} onChange={(e) => setFormData({...formData, scentName: e.target.value})} placeholder="e.g. Meadow Frolic" />
                </div>
                <div className="space-y-2">
                  <Label>Size/Volume *</Label>
                  <Input required value={formData.size} onChange={(e) => setFormData({...formData, size: e.target.value})} placeholder="e.g. 8 oz / 226 g" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Scent Notes</Label>
                <Input value={formData.scentNotes} onChange={(e) => setFormData({...formData, scentNotes: e.target.value})} placeholder="e.g. Top: Bergamot, Mid: Rose, Base: Cedar" />
              </div>

              <div className="space-y-2">
                <Label>Label Template Default</Label>
                <Select 
                  value={formData.labelTemplateId} 
                  onValueChange={(val) => setFormData({...formData, labelTemplateId: val})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None / Default</SelectItem>
                    {templates?.map(t => (
                      <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-4 border-t border-border">
                <h4 className="text-sm font-medium mb-4 text-muted-foreground">Compliance & Details</h4>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>SKU</Label>
                      <Input value={formData.sku} onChange={(e) => setFormData({...formData, sku: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Location / Origin</Label>
                      <Input value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} placeholder="e.g. Hand poured in NY" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Ingredients</Label>
                    <Textarea className="min-h-[80px]" value={formData.ingredients} onChange={(e) => setFormData({...formData, ingredients: e.target.value})} />
                  </div>

                  <div className="space-y-2">
                    <Label>Instructions</Label>
                    <Textarea className="min-h-[80px]" value={formData.instructions} onChange={(e) => setFormData({...formData, instructions: e.target.value})} />
                  </div>

                  <div className="space-y-2">
                    <Label>Warnings</Label>
                    <Textarea className="min-h-[80px]" value={formData.warnings} onChange={(e) => setFormData({...formData, warnings: e.target.value})} />
                  </div>
                </div>
              </div>
            </div>
            <div className="pt-6 flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setIsSheetOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Product"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
