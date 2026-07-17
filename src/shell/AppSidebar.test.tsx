import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AppSidebar from "./AppSidebar";
import { NAV_ITEMS } from "./navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

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
    const enabledCount = NAV_ITEMS.filter((entry) => entry.enabled).length;
    const allLinks = screen.getAllByRole("link");
    expect(allLinks).toHaveLength(enabledCount);
  });

  it("shows a tooltip explaining why a disabled item isn't clickable, on focus", async () => {
    renderSidebar();

    const providersButton = screen.getByRole("button", { name: /Provider Center/ });
    fireEvent.focus(providersButton);

    await waitFor(() => {
      // Radix renders the tooltip content twice (visible + a visually-hidden
      // a11y duplicate) - assert at least one is present, not exactly one.
      expect(screen.getAllByText(/Provider Center - not built yet/).length).toBeGreaterThan(0);
    });
  });
});
