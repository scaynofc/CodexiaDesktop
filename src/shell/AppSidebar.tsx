import { NavLink } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NAV_ITEMS } from "@/shell/navigation";

/**
 * Renders every planned screen from NAV_ITEMS. Enabled items are real
 * navigation links; disabled items are inert (no route exists for them
 * yet) and explain why via a tooltip on hover/focus - see
 * docs/adr/006-application-shell-navigation.md for why this is preferred
 * over building 8 throwaway "coming soon" screens.
 */
function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <span className="px-2 text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
          Codexia Desktop
        </span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Primary">
              <SidebarMenu>
                {NAV_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    {item.enabled ? (
                      <SidebarMenuButton asChild tooltip={item.label}>
                        <NavLink to={item.path} end={item.path === "/"}>
                          <item.icon />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton disabled aria-disabled="true">
                            <item.icon />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        <TooltipContent side="right">{item.label} - not built yet</TooltipContent>
                      </Tooltip>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export default AppSidebar;
