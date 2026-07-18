import { NavLink } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
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
import { useApprovalStore } from "@/stores/approvalStore";

/**
 * Renders every planned screen from NAV_ITEMS. Enabled items are real
 * navigation links; disabled items are inert (no route exists for them
 * yet) and explain why via a tooltip on hover/focus - see
 * docs/adr/006-application-shell-navigation.md for why this is preferred
 * over building 8 throwaway "coming soon" screens.
 *
 * The Approval Center item also shows a pending-count badge, fed by
 * `approvalStore`'s `init()` (called from `App.tsx`'s root effect, not
 * this component) - kept live by a Rust background loop that runs
 * regardless of which screen is active, so the badge stays accurate even
 * when the user is nowhere near Approval Center. See
 * docs/adr/017-approval-awareness.md.
 */
function AppSidebar() {
  const pendingApprovalCount = useApprovalStore((state) => state.pendingCount);

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
                          {item.id === "approvals" && pendingApprovalCount > 0 && (
                            <Badge
                              variant="outline"
                              className="ml-auto border-amber-500/50 text-amber-600 dark:text-amber-400"
                            >
                              {pendingApprovalCount}
                            </Badge>
                          )}
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
