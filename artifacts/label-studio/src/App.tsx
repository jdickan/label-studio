import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";

import Shell from "@/components/layout/shell";
import Dashboard from "@/pages/dashboard";
import Products from "@/pages/products";
import LabelSheets from "@/pages/label-sheets";
import Zones from "@/pages/zones";
import PrintJobs from "@/pages/print-jobs";
import DesignSystem from "@/pages/design-system";
import { getGetDesignSystemQueryKey, getDesignSystem } from "@workspace/api-client-react";

const queryClient = new QueryClient();

async function injectFontFromDataUrl(family: string, dataUrl: string) {
  if (!family || !dataUrl) return;
  const existing = [...document.fonts].some((f) => f.family === family);
  if (existing) return;
  try {
    const ff = new FontFace(family, `url(${dataUrl})`);
    const loaded = await ff.load();
    document.fonts.add(loaded);
  } catch {
  }
}

function BrandFontInjector() {
  const { data: ds } = useQuery({
    queryKey: getGetDesignSystemQueryKey(),
    queryFn: () => getDesignSystem(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!ds) return;
    if (ds.headingFont && ds.headingFontData) {
      injectFontFromDataUrl(ds.headingFont, ds.headingFontData);
    }
    if (ds.bodyFont && ds.bodyFontData) {
      injectFontFromDataUrl(ds.bodyFont, ds.bodyFontData);
    }
  }, [ds?.headingFont, ds?.headingFontData, ds?.bodyFont, ds?.bodyFontData]);

  return null;
}

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/products" component={Products} />
        <Route path="/label-sheets" component={LabelSheets} />
        <Route path="/zones" component={Zones} />
        <Route path="/label-templates"><Redirect to="/zones" /></Route>
        <Route path="/print-jobs" component={PrintJobs} />
        <Route path="/design-system" component={DesignSystem} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <BrandFontInjector />
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
