import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Shell from "@/components/layout/shell";
import Dashboard from "@/pages/dashboard";
import Products from "@/pages/products";
import LabelSheets from "@/pages/label-sheets";
import LabelTemplates from "@/pages/label-templates";
import PrintJobs from "@/pages/print-jobs";
import DesignSystem from "@/pages/design-system";

const queryClient = new QueryClient();

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/products" component={Products} />
        <Route path="/label-sheets" component={LabelSheets} />
        <Route path="/label-templates" component={LabelTemplates} />
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
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
