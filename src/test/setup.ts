import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia or ResizeObserver. Both are used
// unconditionally by the vendored shadcn Sidebar/Tooltip components
// (src/hooks/use-mobile.ts, Radix's internal size measurement) - any test
// rendering the shell needs these stubs in place.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
