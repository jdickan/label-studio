import { useState, ReactNode } from "react";
import { useLocation } from "wouter";
import { ShellContext } from "@/context/shell-context";
import AppSidebar from "./app-sidebar";

const PAGE_TITLES: Record<string, string> = {
  "/": "Label Maker",
  "/dashboard": "Label Maker",
  "/products": "Products",
  "/label-sheets": "Sheets",
  "/zones": "Zones",
  "/designs": "Designs",
  "/print-jobs": "Print Jobs",
  "/design-system": "Branding",
};

export default function Shell({ children }: { children: ReactNode }) {
  const [topBarState, setTopBarState] = useState<{ title?: string; actions?: ReactNode }>({});
  const [location] = useLocation();

  const pageTitle = topBarState.title ?? PAGE_TITLES[location] ?? "";

  return (
    <ShellContext.Provider value={{ topBarState, setTopBarState }}>
      <div className="flex h-screen overflow-hidden bg-secondary/30">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="h-11 border-b bg-card flex items-center px-4 shrink-0 shadow-sm z-10 gap-4">
            <span className="font-semibold text-sm tracking-tight text-foreground">
              {pageTitle}
            </span>
            {topBarState.actions && (
              <div className="ml-auto flex items-center gap-1.5">
                {topBarState.actions}
              </div>
            )}
          </header>
          <main className="flex-1 overflow-hidden">
            {children}
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
