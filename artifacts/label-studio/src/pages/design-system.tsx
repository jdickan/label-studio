import { useState, useEffect, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Save, UploadCloud, Type, X, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const KERN_PAIRS = ["AV", "AW", "LT", "TA"];

const BUILTIN_FONTS: Record<"heading" | "body", string> = {
  heading: "Heinberg Textured",
  body: "Jost",
};

function KerningSpecimen() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Optical Kerning</CardTitle>
        <CardDescription>
          Font kern table activation for problematic letter pairs — kern on (left) vs. kern off (right) simultaneously.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {KERN_PAIRS.map(pair => (
            <div key={pair} className="flex flex-col items-center gap-3">
              <div className="flex items-end gap-3">
                <div className="flex flex-col items-center gap-1">
                  <span className={cn("text-5xl font-bold leading-none select-none kern-on")}>
                    {pair}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-mono">on</span>
                </div>
                <div className="text-muted-foreground/30 text-lg mb-3">|</div>
                <div className="flex flex-col items-center gap-1">
                  <span className={cn("text-5xl font-bold leading-none select-none kern-off")}>
                    {pair}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-mono">off</span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground font-mono">{pair}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-6 border-t pt-4">
          Global kerning is <span className="font-medium text-foreground">enabled</span> via <code className="font-mono text-[11px] bg-muted px-1 rounded">font-feature-settings: "kern" 1</code> on <code className="font-mono text-[11px] bg-muted px-1 rounded">body</code>. Use <code className="font-mono text-[11px] bg-muted px-1 rounded">.kern-on</code> / <code className="font-mono text-[11px] bg-muted px-1 rounded">.kern-off</code> utility classes to override per-element.
        </p>
      </CardContent>
    </Card>
  );
}

type LoadedFont = {
  name: string;
  family: string;
  size: number;
};

function FontUploadCard({
  slot,
  label,
  currentFamily,
  onFontLoaded,
}: {
  slot: "heading" | "body";
  label: string;
  currentFamily: string;
  onFontLoaded: (family: string) => void;
}) {
  const [loadedFont, setLoadedFont] = useState<LoadedFont | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const builtinFamily = BUILTIN_FONTS[slot];
  const isBuiltin = !loadedFont && currentFamily.trim().toLowerCase() === builtinFamily.toLowerCase();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = [".woff", ".woff2", ".ttf", ".otf"];
    if (!allowed.some(ext => file.name.toLowerCase().endsWith(ext))) {
      toast({ title: "Unsupported file", description: "Please upload a .woff, .woff2, .ttf or .otf font file.", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const familyName = `custom-${slot}-${Date.now()}`;
      try {
        const ff = new FontFace(familyName, `url(${dataUrl})`);
        const loaded = await ff.load();
        document.fonts.add(loaded);
        setLoadedFont({ name: file.name, family: familyName, size: Math.round(file.size / 1024) });
        onFontLoaded(familyName);
        toast({ title: `${label} font loaded`, description: file.name });
      } catch {
        toast({ title: "Font load failed", description: "The file may be corrupt or an unsupported format.", variant: "destructive" });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleClear = () => {
    setLoadedFont(null);
    onFontLoaded(builtinFamily);
  };

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          className="font-mono text-sm"
          value={loadedFont ? loadedFont.family : currentFamily}
          readOnly={!!loadedFont}
          onChange={!loadedFont ? (e) => onFontLoaded(e.target.value) : undefined}
          placeholder="e.g. Playfair Display"
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={() => inputRef.current?.click()}
          title={isBuiltin ? "Override built-in font with a custom upload" : "Upload font file"}
        >
          <UploadCloud className="w-4 h-4 mr-2" /> {isBuiltin ? "Override" : "Upload"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".woff,.woff2,.ttf,.otf"
          className="hidden"
          onChange={handleFile}
        />
        {loadedFont && (
          <Button type="button" variant="ghost" size="icon" onClick={handleClear} title="Remove override — restore built-in font">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      {isBuiltin && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 text-xs bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
            <Sparkles className="w-3 h-3" />
            Built-in
          </Badge>
          <span className="text-xs text-muted-foreground">Loaded from app fonts — always available</span>
        </div>
      )}
      {loadedFont && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 text-xs">
            <Type className="w-3 h-3" />
            {loadedFont.name}
            <span className="text-muted-foreground">{loadedFont.size} KB</span>
          </Badge>
          <span className="text-xs text-muted-foreground">Session only — not persisted</span>
        </div>
      )}
    </div>
  );
}

function FontSpecimen({ headingFamily, bodyFamily }: { headingFamily: string; bodyFamily: string }) {
  const heading = headingFamily || "inherit";
  const body = bodyFamily || "inherit";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Font Specimens</CardTitle>
        <CardDescription>
          Sample text rendered with your current heading and body font selections.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Heading Font</span>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{headingFamily || "system"}</code>
          </div>
          <div className="border rounded-lg p-5 bg-background space-y-2">
            <p style={{ fontFamily: heading }} className="text-4xl font-bold kern-on leading-tight">
              Lavender Dreams
            </p>
            <p style={{ fontFamily: heading }} className="text-2xl font-semibold kern-on">
              Hand Poured Soy Candle
            </p>
            <p style={{ fontFamily: heading }} className="text-lg font-medium kern-on">
              AVOCADO · WHEAT · LAVENDER
            </p>
            <p style={{ fontFamily: heading }} className="text-sm tracking-widest uppercase kern-on">
              AV AW LT TA — Kerning Pairs
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Body Font</span>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{bodyFamily || "system"}</code>
          </div>
          <div className="border rounded-lg p-5 bg-background space-y-3">
            <p style={{ fontFamily: body }} className="text-base kern-on">
              A blend of wild bergamot, warm cedar, and white sage — hand-poured in small batches.
            </p>
            <p style={{ fontFamily: body }} className="text-sm text-muted-foreground kern-on">
              Net wt. 8 oz (226 g) · Burn time approx. 45–55 hours · Keep wick trimmed to ¼"
            </p>
            <p style={{ fontFamily: body }} className="text-xs kern-on">
              Caution: Never leave a burning candle unattended. Keep away from flammable materials and out of reach of children and pets.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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
        <h1 className="text-3xl font-bold tracking-tight kern-on">Brand Settings</h1>
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
                <CardDescription>
                  Font family names for your labels. Upload a custom font file to use it in this session, or enter any Google Font or system font name.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FontUploadCard
                  slot="heading"
                  label="Heading Font"
                  currentFamily={formData.headingFont || ''}
                  onFontLoaded={(family) => setFormData({ ...formData, headingFont: family })}
                />
                <FontUploadCard
                  slot="body"
                  label="Body Font"
                  currentFamily={formData.bodyFont || ''}
                  onFontLoaded={(family) => setFormData({ ...formData, bodyFont: family })}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateMutation.isPending}>
                <Save className="w-4 h-4 mr-2" /> Save Brand Settings
              </Button>
            </div>
          </form>
        </div>

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
                  className="font-bold text-sm tracking-widest uppercase mb-1 kern-on"
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
                  className="text-3xl mb-2 leading-none kern-on"
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

      <FontSpecimen
        headingFamily={formData.headingFont || ''}
        bodyFamily={formData.bodyFont || ''}
      />

      <KerningSpecimen />
    </div>
  );
}
