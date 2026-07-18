import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import AppSidebar from "./AppSidebar";
import { NAV_ITEMS } from "./navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useApprovalStore } from "@/stores/approvalStore";

beforeEach(() => {
  useApprovalStore.setState({ pendingCount: 0 });
});

function renderSidebar() {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe("AppSidebar", () => {
  it("renders every planned screen's label", () => {
    renderSidebar();

    for (const item of NAV_ITEMS) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
  });

  it("renders Dashboard as a real navigation link", () => {
    renderSidebar();

    const link = screen.getByRole("link", { name: /Dashboard/ });
    expect(link).toHaveAttribute("href", "/");
  });

  it("renders every not-yet-built item as a disabled button, not a link", () => {
    renderSidebar();

    for (const item of NAV_ITEMS.filter((entry) => !entry.enabled)) {
      const button = screen.getByRole("button", { name: new RegExp(item.label) });
      expect(button).toBeDisabled();
    }

    // No stray links for unbuilt screens - only the enabled items navigate.
    // Every screen is built as of Phase 10 (Approval Center), so this
    // currently asserts vacuously (no disabled items to check) - kept as a
    // standing invariant for whenever the next screen is added disabled.
    const enabledCount = NAV_ITEMS.filter((entry) => entry.enabled).length;
    const allLinks = screen.getAllByRole("link");
    expect(allLinks).toHaveLength(enabledCount);
  });

  it("shows no pending-approval badge when the count is zero", () => {
    renderSidebar();

    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it("shows the pending-approval count as a badge on the Approval Center item", () => {
    useApprovalStore.setState({ pendingCount: 3 });

    renderSidebar();

    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
