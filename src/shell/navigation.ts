import {
  Boxes,
  Cpu,
  Gauge,
  History,
  LayoutDashboard,
  ListTodo,
  ScrollText,
  Settings as SettingsIcon,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type ScreenId =
  | "dashboard"
  | "tasks"
  | "timeline"
  | "providers"
  | "runtime"
  | "approvals"
  | "memory"
  | "logs"
  | "settings";

export interface NavItem {
  id: ScreenId;
  label: string;
  path: string;
  icon: LucideIcon;
  /** Whether this screen exists yet. Disabled items render inert - no
   * route is registered for them, see src/shell/AppSidebar.tsx. */
  enabled: boolean;
}

/**
 * Single source of truth for both the sidebar and the router - see
 * docs/adr/006-application-shell-navigation.md. Every screen this app will
 * ever have starts here; a future phase adding a screen flips `enabled` to
 * `true` and adds one `<Route>` in App.tsx, nothing else changes.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: "dashboard", label: "Dashboard", path: "/", icon: LayoutDashboard, enabled: true },
  { id: "tasks", label: "Task Center", path: "/tasks", icon: ListTodo, enabled: true },
  { id: "timeline", label: "Timeline", path: "/timeline", icon: History, enabled: true },
  { id: "providers", label: "Provider Center", path: "/providers", icon: Cpu, enabled: true },
  { id: "runtime", label: "Runtime Center", path: "/runtime", icon: Gauge, enabled: true },
  {
    id: "approvals",
    label: "Approval Center",
    path: "/approvals",
    icon: ShieldCheck,
    enabled: false,
  },
  { id: "memory", label: "Memory Center", path: "/memory", icon: Boxes, enabled: true },
  { id: "logs", label: "Log Center", path: "/logs", icon: ScrollText, enabled: false },
  { id: "settings", label: "Settings", path: "/settings", icon: SettingsIcon, enabled: false },
];

/** Looks up the nav item whose path matches a location's pathname, for the
 * header's page title. Returns undefined for an unregistered path (should
 * be unreachable in practice - no enabled item points anywhere else). */
export function findNavItemByPath(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.path === pathname);
}
