import { Link, useLocation } from "wouter";
import { Home, Printer, Droplets, LayoutTemplate, Sparkles, Layers, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import ravenLogo from "/raven-logo.webp";

const navigation = [
  { name: "Dashboard",  href: "/dashboard",     icon: Home           },
  { name: "Print Jobs", href: "/print-jobs",     icon: Printer        },
  { name: "Products",   href: "/products",       icon: Droplets       },
  { name: "Zones",      href: "/zones",          icon: LayoutTemplate },
  { name: "Designs",    href: "/designs",        icon: Sparkles       },
  { name: "Sheets",     href: "/label-sheets",   icon: Layers         },
  { name: "Branding",   href: "/design-system",  icon: Palette        },
];

export default function AppSidebar() {
  const [location] = useLocation();

  return (
    <nav className="w-14 flex-shrink-0 bg-card border-r flex flex-col py-2 z-20 overflow-visible">
      <div className="flex items-center justify-center h-11 mb-1 flex-shrink-0">
        <img
          src={ravenLogo}
          alt="Label Studio"
          className="w-7 h-7 rounded object-cover shadow-sm"
        />
      </div>

      <div className="flex-1 flex flex-col gap-0.5 px-2 overflow-visible">
        {navigation.map((item) => {
          const isActive =
            location === item.href ||
            (item.href !== "/dashboard" && location.startsWith(item.href)) ||
            (item.href === "/dashboard" && location === "/");

          return (
            <div key={item.name} className="relative group/nav">
              <Link
                href={item.href}
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-lg transition-colors duration-150",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <item.icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              </Link>

              <div
                className={cn(
                  "absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50",
                  "px-2.5 py-1.5 rounded-md shadow-lg border",
                  "bg-popover text-popover-foreground text-xs font-medium whitespace-nowrap",
                  "opacity-0 group-hover/nav:opacity-100 pointer-events-none",
                  "transition-opacity duration-150",
                  "flex items-center gap-1.5"
                )}
              >
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-border" />
                <div className="absolute right-[calc(100%-1px)] top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-popover" />
                {item.name}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
