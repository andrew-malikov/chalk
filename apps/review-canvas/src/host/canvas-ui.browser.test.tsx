import { themeStyles } from "@canvas/styles/theme-styles";
import type { ReviewMenuRequest } from "@chalk/review-contracts";
// oxlint-disable no-restricted-imports -- Exercise the desktop host adapter through its public UI API.
import { createCanvasUi } from "@shell/canvas-ui";
import * as stylex from "@stylexjs/stylex";
import { act } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
// oxlint-enable no-restricted-imports

import "@canvas/styles.css";

let ui: ReturnType<typeof createCanvasUi> | undefined;

afterEach(async () => {
  await act(async () => ui?.dispose());
  ui = undefined;
  document.body.replaceChildren();
});

function setup() {
  const canvas = document.createElement("div");
  canvas.className = "review-canvas-root";
  canvas.style.height = "600px";
  const container = document.createElement("div");
  container.className = stylex.props(themeStyles.vars).className ?? "";
  const trigger = document.createElement("button");
  trigger.textContent = "Actions";
  container.append(trigger);
  canvas.append(container);
  document.body.append(canvas);
  trigger.focus();
  ui = createCanvasUi(
    () => container,
    { current: () => "dark", subscribe: () => ({ dispose() {} }) },
    (error) => {
      throw error;
    },
  );

  return { container, trigger };
}

test("host menu skips disabled choices, selects with the keyboard and restores focus", async () => {
  const { trigger } = setup();
  const select = vi.fn<ReviewMenuRequest["onSelect"]>();
  const hide = vi.fn<ReviewMenuRequest["onHide"]>();
  await act(async () => {
    ui!.showMenu({
      anchor: trigger,
      items: [
        { id: "newest", label: "Newest", checked: true },
        {
          id: "unavailable",
          label: "Unavailable",
          checked: false,
          enabled: false,
        },
        { id: "oldest", label: "Oldest", checked: false },
      ],
      onSelect: select,
      onHide: hide,
    });
  });
  await expect
    .poll(() => document.activeElement?.textContent)
    .toContain("Newest");
  await act(async () => userEvent.keyboard("{ArrowDown}"));
  await expect
    .poll(() => document.activeElement?.textContent)
    .toContain("Oldest");
  await act(async () => userEvent.keyboard("{Enter}"));
  expect(select).toHaveBeenCalledExactlyOnceWith("oldest");
  expect(hide).toHaveBeenCalledOnce();
  await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
  expect(document.activeElement).toBe(trigger);
});

test("host menu dismisses on Escape without selecting an action", async () => {
  const { trigger } = setup();
  const select = vi.fn<ReviewMenuRequest["onSelect"]>();
  const hide = vi.fn<ReviewMenuRequest["onHide"]>();
  await act(async () =>
    ui!.showMenu({
      anchor: trigger,
      items: [{ id: "delete", label: "Delete" }],
      onSelect: select,
      onHide: hide,
    }),
  );
  await act(async () => userEvent.keyboard("{Escape}"));
  expect(select).not.toHaveBeenCalled();
  expect(hide).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(trigger);
});

test("pressing the anchor of an open host menu closes it", async () => {
  const { trigger } = setup();
  const hide = vi.fn<ReviewMenuRequest["onHide"]>();
  trigger.addEventListener("click", () =>
    ui!.showMenu({
      anchor: trigger,
      items: [{ id: "delete", label: "Delete" }],
      onSelect: () => {},
      onHide: hide,
    }),
  );
  await act(async () => userEvent.click(trigger));
  await expect.element(page.getByRole("menu")).toBeVisible();
  await act(async () => userEvent.click(trigger));
  await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
  expect(hide).toHaveBeenCalledOnce();
});

test("delete confirmation settles on cancellation, approval and owner disposal", async () => {
  const { trigger } = setup();
  let pending!: Promise<boolean>;
  await act(async () => {
    pending = ui!.confirmDelete!("Alpha");
  });
  await expect
    .element(page.getByRole("alertdialog", { name: "Delete Alpha?" }))
    .toBeVisible();
  expect(document.activeElement?.textContent).toBe("Cancel");
  await act(async () => userEvent.keyboard("{Escape}"));
  expect(await pending).toBe(false);
  expect(document.activeElement).toBe(trigger);
  await act(async () => {
    pending = ui!.confirmDelete!("Alpha");
  });
  await act(async () =>
    page.getByRole("button", { name: "Delete", exact: true }).click(),
  );
  expect(await pending).toBe(true);
  expect(document.activeElement).toBe(trigger);
  await act(async () => {
    pending = ui!.confirmDelete!("Alpha");
  });
  await act(async () => ui!.dispose());
  expect(await pending).toBe(false);
  await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
});
