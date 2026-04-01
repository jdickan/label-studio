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
import { Layers, Package, LayoutTemplate, Printer, Palette, Home, Droplets } from "lucide-react";

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
          <div className="bg-primary text-primary-foreground w-8 h-8 rounded flex items-center justify-center font-bold font-mono text-sm shadow-sm">
            LS
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
