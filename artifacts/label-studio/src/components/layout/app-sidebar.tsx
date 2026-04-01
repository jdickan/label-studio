import { Link, useLocation } from "wouter";
import { 
  Sidebar, 
  SidebarHeader, 
  SidebarContent, 
  SidebarGroup, 
  SidebarGroupLabel, 
  SidebarGroupContent, 
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton,
  SidebarFooter
} from "@/components/ui/sidebar";
import { Layers, LayoutTemplate, Printer, Palette, Home, Droplets } from "lucide-react";

function RavenIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Raven"
    >
      <path d="M27.5 5.2c-1.2-0.8-2.8-0.6-3.8 0.3-0.7-0.9-1.8-1.5-3-1.5-1.4 0-2.6 0.8-3.2 2C16.7 5.4 15.8 5 14.8 5c-1.5 0-2.8 0.9-3.4 2.3-0.5-0.2-1-0.3-1.5-0.3-2.2 0-4 1.8-4 4 0 0.4 0.1 0.8 0.2 1.2C4.5 13 3 14.9 3 17.1c0 1.4 0.6 2.6 1.6 3.5L3 24.5c-0.2 0.5 0.2 1 0.7 1L7 25c0.4 1.2 1.4 2 2.6 2 0.8 0 1.6-0.4 2.1-1l2.3 0c0.3 0.6 0.9 1 1.6 1 0.5 0 1-0.2 1.3-0.6 2.1-0.4 3.9-1.4 5.2-3 0.6 0.4 1.3 0.6 2 0.6 2.2 0 4-1.8 4-4 0-0.9-0.3-1.7-0.8-2.4 1.2-0.8 2-2.2 2-3.7 0-1.1-0.4-2.1-1-2.9 0.8-0.8 1.2-2 0.9-3.2-0.2-0.8-0.7-1.5-1.7-2.6zM10 22c-0.6 0-1-0.4-1-1s0.4-1 1-1 1 0.4 1 1-0.4 1-1 1z" />
    </svg>
  );
}

export default function AppSidebar() {
  const [location] = useLocation();

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: Home },
    { name: "Products", href: "/products", icon: Droplets },
    { name: "Label Sheets", href: "/label-sheets", icon: Layers },
    { name: "Label Templates", href: "/label-templates", icon: LayoutTemplate },
    { name: "Print Jobs", href: "/print-jobs", icon: Printer },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="py-6 px-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary text-primary-foreground w-8 h-8 rounded flex items-center justify-center shadow-sm">
            <RavenIcon className="w-5 h-5" />
          </div>
          <div className="font-semibold text-lg tracking-tight">Label Studio</div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href)) || (item.href === "/dashboard" && location === "/");
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                      <Link href={item.href} className="flex items-center gap-2">
                        <item.icon className="w-4 h-4" />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={location === "/design-system"} tooltip="Design System">
              <Link href="/design-system" className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                <span>Brand Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
