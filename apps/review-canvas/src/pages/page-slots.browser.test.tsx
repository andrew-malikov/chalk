import { act, useMemo, useState } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PageSidebar, PageSlotsContext, PageToolbar } from "./page-slots";

describe("page slots", () => {
  let container: HTMLDivElement;
  let root: Root;
  let showPage: (shown: boolean) => void;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root.render(<Shell />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("frames a page's toolbar and sidebar only while the page shows", async () => {
    expect(container.querySelector("header")?.hidden).toBe(true);
    expect(container.querySelector("aside")?.hidden).toBe(true);

    await act(async () => showPage(true));

    expect(container.querySelector("header")?.hidden).toBe(false);
    expect(container.querySelector("header")?.textContent).toBe("Settings");
    expect(container.querySelector("aside")?.hidden).toBe(false);
    expect(container.querySelector("aside")?.textContent).toBe("Comments");

    await act(async () => showPage(false));

    expect(container.querySelector("header")?.hidden).toBe(true);
    expect(container.querySelector("aside")?.hidden).toBe(true);
  });

  function Shell() {
    const [toolbarEnd, setToolbarEnd] = useState<HTMLElement | null>(null);
    const [sidebar, setSidebar] = useState<HTMLElement | null>(null);
    const [toolbarShown, showToolbar] = useState(false);
    const [sidebarShown, showSidebar] = useState(false);
    const [page, setPage] = useState(false);

    showPage = setPage;

    const slots = useMemo(
      () => ({
        toolbarStart: null,
        toolbarEnd,
        overlay: null,
        sidebar,
        showToolbar,
        showSidebar,
      }),
      [toolbarEnd, sidebar],
    );

    return (
      <PageSlotsContext.Provider value={slots}>
        <header ref={setToolbarEnd} hidden={!toolbarShown} />
        <aside ref={setSidebar} hidden={!sidebarShown} />
        {page && (
          <>
            <PageToolbar>Settings</PageToolbar>
            <PageSidebar>Comments</PageSidebar>
          </>
        )}
      </PageSlotsContext.Provider>
    );
  }
});
