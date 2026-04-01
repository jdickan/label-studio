import { useState } from "react";
import { 
  useGetLabelTemplates, 
  useGetLabelSheets,
  useCreateLabelTemplate,
  useUpdateLabelTemplate,
  useDeleteLabelTemplate,
  getGetLabelTemplatesQueryKey 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { LayoutTemplate, Plus, Save, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LabelTemplates() {
  const { data: templates, isLoading } = useGetLabelTemplates({ query: { queryKey: getGetLabelTemplatesQueryKey() } });
  const { data: sheets } = useGetLabelSheets({ query: { queryKey: ["labelSheets"] } });
  
  const [activeTemplate, setActiveTemplate] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    labelSheetId: "none",
    zones: {} as any,
    safeAreaEnabled: false,
    bleedInches: 0.125,
    safeAreaInches: 0.125,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateLabelTemplate({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetLabelTemplatesQueryKey() });
        toast({ title: "Template created" });
        setIsCreating(false);
        setActiveTemplate(data);
      }
    }
  });

  const updateMutation = useUpdateLabelTemplate({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetLabelTemplatesQueryKey() });
        toast({ title: "Template updated" });
        setActiveTemplate(data);
      }
    }
  });

  const deleteMutation = useDeleteLabelTemplate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetLabelTemplatesQueryKey() });
        toast({ title: "Template deleted" });
        setActiveTemplate(null);
      }
    }
  });

  const handleSelectTemplate = (template: any) => {
    setIsCreating(false);
    setActiveTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      labelSheetId: template.labelSheetId ? template.labelSheetId.toString() : "none",
      zones: template.zones || {},
      safeAreaEnabled: template.safeAreaEnabled ?? false,
      bleedInches: template.bleedInches ?? 0.125,
      safeAreaInches: template.safeAreaInches ?? 0.125,
    });
    setAdvancedOpen(template.safeAreaEnabled ?? false);
  };

  const handleNewTemplate = () => {
    setActiveTemplate(null);
    setIsCreating(true);
    setAdvancedOpen(false);
    setFormData({
      name: "New Template",
      description: "",
      labelSheetId: "none",
      zones: {
        logo: { top: "5%", left: "5%", width: "90%", height: "20%", align: "center" },
        productName: { top: "30%", left: "5%", width: "90%", height: "15%", align: "center", fontSize: "16pt", bold: true },
        scentNotes: { top: "50%", left: "5%", width: "90%", height: "15%", align: "center", fontSize: "10pt" },
        weight: { top: "80%", left: "5%", width: "90%", height: "10%", align: "center", fontSize: "8pt" }
      },
      safeAreaEnabled: false,
      bleedInches: 0.125,
      safeAreaInches: 0.125,
    });
  };

  const handleSave = () => {
    const payload = {
      name: formData.name,
      description: formData.description,
      labelSheetId: formData.labelSheetId === "none" ? undefined : parseInt(formData.labelSheetId),
      zones: formData.zones,
      safeAreaEnabled: formData.safeAreaEnabled,
      bleedInches: formData.bleedInches,
      safeAreaInches: formData.safeAreaInches,
    };

    if (isCreating) {
      createMutation.mutate({ data: payload });
    } else if (activeTemplate) {
      updateMutation.mutate({ id: activeTemplate.id, data: payload });
    }
  };

  const zoneColors: Record<string, string> = {
    logo: "bg-blue-200 border-blue-400 text-blue-800",
    productName: "bg-green-200 border-green-400 text-green-800",
    scentNotes: "bg-purple-200 border-purple-400 text-purple-800",
    weight: "bg-orange-200 border-orange-400 text-orange-800",
    ingredients: "bg-yellow-200 border-yellow-400 text-yellow-800",
    instructions: "bg-pink-200 border-pink-400 text-pink-800",
    brandName: "bg-sky-200 border-sky-400 text-sky-800",
    website: "bg-teal-200 border-teal-400 text-teal-800",
  };

  const PREVIEW_W = 300;
  const PREVIEW_H = 400;

  const activeSheet = sheets?.find(s => s.id.toString() === formData.labelSheetId);

  const pxPerInchW = activeSheet ? PREVIEW_W / activeSheet.labelWidth : PREVIEW_W / 3;
  const pxPerInchH = activeSheet ? PREVIEW_H / activeSheet.labelHeight : PREVIEW_H / 4;

  const bleedPxH = Math.round(formData.bleedInches * pxPerInchW);
  const bleedPxV = Math.round(formData.bleedInches * pxPerInchH);
  const safePxH = Math.round(formData.safeAreaInches * pxPerInchW);
  const safePxV = Math.round(formData.safeAreaInches * pxPerInchH);

  return (
    <div className="space-y-6 h-[calc(100vh-120px)] flex flex-col animate-in fade-in duration-500">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Label Templates</h1>
          <p className="text-muted-foreground mt-1">Design layouts mapping product data to labels.</p>
        </div>
        <Button onClick={handleNewTemplate}>
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      <div className="flex flex-1 gap-6 min-h-0">
        {/* Sidebar List */}
        <div className="w-64 border rounded-md bg-card overflow-y-auto shrink-0 flex flex-col">
          <div className="p-3 border-b font-medium bg-muted/30 sticky top-0">Saved Templates</div>
          <div className="flex-1 p-2 space-y-1">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
            ) : templates?.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No templates yet.</div>
            ) : (
              templates?.map(t => (
                <button 
                  key={t.id}
                  onClick={() => handleSelectTemplate(t)}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors flex items-center gap-2 ${activeTemplate?.id === t.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-secondary'}`}
                >
                  <LayoutTemplate className="w-4 h-4 opacity-70 shrink-0" />
                  <span className="truncate">{t.name}</span>
                  {t.safeAreaEnabled && (
                    <span className="ml-auto shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                      SA
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 border rounded-md bg-card flex flex-col overflow-hidden">
          {(activeTemplate || isCreating) ? (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b flex justify-between items-center bg-muted/10 shrink-0">
                <div className="flex gap-4 items-center w-2/3">
                  <Input 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="font-medium text-lg h-9 w-1/2"
                  />
                  <Select value={formData.labelSheetId} onValueChange={val => setFormData({...formData, labelSheetId: val})}>
                    <SelectTrigger className="h-9 w-1/2">
                      <SelectValue placeholder="Assigned Sheet" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any Sheet</SelectItem>
                      {sheets?.map(s => (
                        <SelectItem key={s.id} value={s.id.toString()}>{s.brand} {s.code} ({s.name})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  {!isCreating && (
                    <Button variant="outline" className="text-destructive hover:bg-destructive/10 border-destructive/20" onClick={() => {
                      if (window.confirm("Delete this template?")) deleteMutation.mutate({ id: activeTemplate.id });
                    }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    {isCreating ? "Create" : "Save Changes"}
                  </Button>
                </div>
              </div>

              <div className="flex flex-1 overflow-hidden">
                {/* Visualizer */}
                <div className="flex-1 bg-secondary/30 p-8 flex items-center justify-center overflow-auto relative checkerboard-bg">
                  <div className="relative">
                    {/* Bleed guide — dashed red ring outside the label */}
                    {formData.safeAreaEnabled && (
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          top: -bleedPxV,
                          left: -bleedPxH,
                          right: -bleedPxH,
                          bottom: -bleedPxV,
                          border: "1.5px dashed #ef4444",
                          borderRadius: 8,
                        }}
                        title={`Bleed: ${formData.bleedInches}"`}
                      >
                        <span
                          className="absolute text-[9px] font-semibold text-red-500 bg-white/80 dark:bg-black/60 px-1 rounded leading-none"
                          style={{ top: -1, left: "50%", transform: "translate(-50%, -50%)" }}
                        >
                          bleed {formData.bleedInches}"
                        </span>
                      </div>
                    )}

                    {/* Label canvas */}
                    <div
                      className="bg-white shadow-xl relative border"
                      style={{ width: PREVIEW_W, height: PREVIEW_H, borderRadius: 8 }}
                    >
                      {Object.entries(formData.zones || {}).map(([key, zone]: [string, any]) => (
                        <div 
                          key={key}
                          className={`absolute border border-dashed flex items-center justify-center text-xs font-medium bg-opacity-40 p-1 overflow-hidden ${zoneColors[key] || 'bg-gray-200 border-gray-400 text-gray-800'}`}
                          style={{
                            top: zone.top,
                            left: zone.left,
                            width: zone.width,
                            height: zone.height,
                            textAlign: (zone.align as any) || 'center',
                            justifyContent: zone.align === 'left' ? 'flex-start' : zone.align === 'right' ? 'flex-end' : 'center',
                          }}
                        >
                          {key}
                        </div>
                      ))}

                      {/* Text live area guide — dashed blue ring inside the label */}
                      {formData.safeAreaEnabled && (
                        <div
                          className="absolute pointer-events-none"
                          style={{
                            top: safePxV,
                            left: safePxH,
                            right: safePxH,
                            bottom: safePxV,
                            border: "1.5px dashed #3b82f6",
                            borderRadius: 4,
                          }}
                          title={`Text live area: ${formData.safeAreaInches}" inset`}
                        >
                          <span
                            className="absolute text-[9px] font-semibold text-blue-500 bg-white/80 dark:bg-black/60 px-1 rounded leading-none"
                            style={{ bottom: -1, right: 4, transform: "translateY(50%)" }}
                          >
                            live {formData.safeAreaInches}"
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {formData.safeAreaEnabled && (
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 h-0 border-t-2 border-dashed border-red-400" /> Bleed area
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 h-0 border-t-2 border-dashed border-blue-400" /> Text live area
                      </span>
                    </div>
                  )}
                </div>

                {/* Right panel */}
                <div className="w-80 border-l p-4 flex flex-col shrink-0 bg-card overflow-y-auto">
                  <h3 className="font-medium mb-4 flex items-center gap-2">
                    <LayoutTemplate className="w-4 h-4" /> Zone Configuration
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Define zones using JSON. Edit standard properties like top, left, width, height (%).
                  </p>
                  <Textarea 
                    className="flex-1 font-mono text-xs min-h-[200px] resize-none p-4 bg-secondary/20"
                    value={JSON.stringify(formData.zones, null, 2)}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        setFormData({...formData, zones: parsed});
                      } catch (err) {
                        // ignore syntax errors while typing
                      }
                    }}
                  />
                  <div className="mt-4 space-y-2">
                    <Label className="text-xs">Preview Notes</Label>
                    <Textarea 
                      className="h-20 text-sm" 
                      placeholder="Add notes about fonts, bleed areas, etc."
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                    />
                  </div>

                  {/* Advanced: Print Specifications */}
                  <div className="mt-4 border rounded-md overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium bg-muted/30 hover:bg-muted/50 transition-colors"
                      onClick={() => setAdvancedOpen(v => !v)}
                    >
                      <span>Print Specifications</span>
                      {advancedOpen ? <ChevronUp className="w-4 h-4 opacity-60" /> : <ChevronDown className="w-4 h-4 opacity-60" />}
                    </button>

                    {advancedOpen && (
                      <div className="px-3 py-3 space-y-4 bg-card">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-medium">Safe area guides</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">Show bleed and text live area overlays. Recommended for third-party printers.</p>
                          </div>
                          <Switch
                            checked={formData.safeAreaEnabled}
                            onCheckedChange={val => setFormData({...formData, safeAreaEnabled: val})}
                          />
                        </div>

                        {formData.safeAreaEnabled && (
                          <div className="space-y-3 pt-1">
                            <div className="space-y-1.5">
                              <Label className="text-xs flex items-center gap-1.5">
                                <span className="inline-block w-3 h-0 border-t-2 border-dashed border-red-400" />
                                Bleed <span className="text-muted-foreground font-normal">(outset from edge, inches)</span>
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.0625"
                                className="h-8 text-sm font-mono"
                                value={formData.bleedInches}
                                onChange={e => setFormData({...formData, bleedInches: parseFloat(e.target.value) || 0})}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs flex items-center gap-1.5">
                                <span className="inline-block w-3 h-0 border-t-2 border-dashed border-blue-400" />
                                Text live area <span className="text-muted-foreground font-normal">(inset from edge, inches)</span>
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.0625"
                                className="h-8 text-sm font-mono"
                                value={formData.safeAreaInches}
                                onChange={e => setFormData({...formData, safeAreaInches: parseFloat(e.target.value) || 0})}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
              <LayoutTemplate className="w-12 h-12 mb-4 opacity-20" />
              <h3 className="text-lg font-medium text-foreground mb-2">No Template Selected</h3>
              <p className="max-w-sm mb-6">Select a template from the sidebar or create a new one to start designing.</p>
              <Button onClick={handleNewTemplate} variant="outline">Create New Template</Button>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .checkerboard-bg {
          background-image: linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%);
          background-size: 20px 20px;
          background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
        }
        .dark .checkerboard-bg {
          background-image: linear-gradient(45deg, #1f2937 25%, transparent 25%), linear-gradient(-45deg, #1f2937 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1f2937 75%), linear-gradient(-45deg, transparent 75%, #1f2937 75%);
        }
      `}</style>
    </div>
  );
}
