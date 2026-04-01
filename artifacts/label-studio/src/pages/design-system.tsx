import { useState, useEffect } from "react";
import { 
  useGetDesignSystem, 
  useUpdateDesignSystem,
  getGetDesignSystemQueryKey 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, UploadCloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DesignSystem() {
  const { data: ds, isLoading } = useGetDesignSystem({ query: { queryKey: getGetDesignSystemQueryKey() } });
  const updateMutation = useUpdateDesignSystem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDesignSystemQueryKey() });
        toast({ title: "Brand settings saved" });
      }
    }
  });

  const [formData, setFormData] = useState<any>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (ds) {
      setFormData(ds);
    }
  }, [ds]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ data: formData });
  };

  if (isLoading) return <div className="p-8 text-center animate-pulse">Loading settings...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Brand Settings</h1>
        <p className="text-muted-foreground mt-1">Configure global styling and brand details for your labels.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Company Details</CardTitle>
                <CardDescription>This information can be automatically populated on templates.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Brand Name</Label>
                    <Input value={formData.brandName || ''} onChange={e => setFormData({...formData, brandName: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Tagline</Label>
                    <Input value={formData.tagline || ''} onChange={e => setFormData({...formData, tagline: e.target.value})} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Website URL</Label>
                  <Input value={formData.websiteUrl || ''} onChange={e => setFormData({...formData, websiteUrl: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Logo URL</Label>
                  <div className="flex gap-2">
                    <Input value={formData.logoUrl || ''} onChange={e => setFormData({...formData, logoUrl: e.target.value})} placeholder="https://..." />
                    <Button type="button" variant="outline" className="shrink-0" onClick={() => toast({title: "File uploads require backend object storage config", description: "Please enter a direct URL for now."})}>
                      <UploadCloud className="w-4 h-4 mr-2" /> Upload
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Brand Colors</CardTitle>
                <CardDescription>Hex codes for your label branding.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Primary Color</Label>
                    <div className="flex gap-2">
                      <Input type="color" className="w-12 p-1 h-10 shrink-0" value={formData.primaryColor || '#000000'} onChange={e => setFormData({...formData, primaryColor: e.target.value})} />
                      <Input className="font-mono" value={formData.primaryColor || ''} onChange={e => setFormData({...formData, primaryColor: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Secondary Color</Label>
                    <div className="flex gap-2">
                      <Input type="color" className="w-12 p-1 h-10 shrink-0" value={formData.secondaryColor || '#ffffff'} onChange={e => setFormData({...formData, secondaryColor: e.target.value})} />
                      <Input className="font-mono" value={formData.secondaryColor || ''} onChange={e => setFormData({...formData, secondaryColor: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Text Color</Label>
                    <div className="flex gap-2">
                      <Input type="color" className="w-12 p-1 h-10 shrink-0" value={formData.textColor || '#111111'} onChange={e => setFormData({...formData, textColor: e.target.value})} />
                      <Input className="font-mono" value={formData.textColor || ''} onChange={e => setFormData({...formData, textColor: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Background Color</Label>
                    <div className="flex gap-2">
                      <Input type="color" className="w-12 p-1 h-10 shrink-0" value={formData.backgroundColor || '#ffffff'} onChange={e => setFormData({...formData, backgroundColor: e.target.value})} />
                      <Input className="font-mono" value={formData.backgroundColor || ''} onChange={e => setFormData({...formData, backgroundColor: e.target.value})} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Typography</CardTitle>
                <CardDescription>Font families for your labels.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Heading Font</Label>
                    <Input value={formData.headingFont || ''} onChange={e => setFormData({...formData, headingFont: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Body Font</Label>
                    <Input value={formData.bodyFont || ''} onChange={e => setFormData({...formData, bodyFont: e.target.value})} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateMutation.isPending}>
                <Save className="w-4 h-4 mr-2" /> Save Brand Settings
              </Button>
            </div>
          </form>
        </div>

        {/* Live Preview Pane */}
        <div>
          <Card className="sticky top-20 overflow-hidden border-2">
            <div className="bg-muted/50 p-3 border-b text-xs font-medium text-center text-muted-foreground uppercase tracking-wider">
              Live Label Preview
            </div>
            <div 
              className="p-8 aspect-[3/4] flex flex-col relative"
              style={{
                backgroundColor: formData.backgroundColor || '#fff',
                color: formData.textColor || '#111',
                fontFamily: formData.bodyFont || 'sans-serif'
              }}
            >
              <div 
                className="w-full h-2 absolute top-0 left-0" 
                style={{ backgroundColor: formData.primaryColor || '#000' }} 
              />
              
              <div className="text-center mt-6 mb-8">
                {formData.logoUrl ? (
                  <img src={formData.logoUrl} alt="Logo" className="h-12 mx-auto mb-4 object-contain" />
                ) : (
                  <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center font-bold text-xl" style={{ backgroundColor: formData.primaryColor, color: formData.backgroundColor }}>
                    {formData.brandName?.charAt(0) || 'B'}
                  </div>
                )}
                <h3 
                  className="font-bold text-sm tracking-widest uppercase mb-1"
                  style={{ fontFamily: formData.headingFont || 'sans-serif' }}
                >
                  {formData.brandName || 'YOUR BRAND'}
                </h3>
              </div>

              <div className="text-center flex-1 flex flex-col justify-center border-y py-4 my-2 border-opacity-20" style={{ borderColor: formData.textColor }}>
                <div className="text-[10px] tracking-widest uppercase mb-2" style={{ color: formData.secondaryColor || '#666' }}>
                  Hand Poured Soy Candle
                </div>
                <h2 
                  className="text-3xl mb-2 leading-none"
                  style={{ fontFamily: formData.headingFont || 'sans-serif' }}
                >
                  Meadow<br/>Frolic
                </h2>
                <div className="text-xs max-w-[80%] mx-auto opacity-80 mt-2">
                  Bergamot • Wild Rose • Cedar
                </div>
              </div>

              <div className="text-center mt-auto pt-6 text-[10px] flex justify-between px-2">
                <span>8 OZ / 226 G</span>
                <span>{formData.websiteUrl?.replace('https://', '') || 'yourbrand.com'}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
