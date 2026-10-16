import { ReviewSessionProvider } from "@canvas/host/review-session";
import {
  testDiffPreferences,
  testReviewSession,
} from "@canvas/test/review-session-test-utils";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { DiffSettingsControl } from "./diff-settings";

describe("DiffSettingsControl", () => {
  let container: HTMLDivElement;
  let root: Root;
  let preferences: ReturnType<typeof testDiffPreferences>;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    preferences = testDiffPreferences();
    vi.spyOn(preferences, "setDiffPreference");

    await act(async () => {
      root.render(
        <ReviewSessionProvider session={testReviewSession({}, preferences)}>
          <DiffSettingsControl />
        </ReviewSessionProvider>,
      );
    });
    await userEvent.click(control('button[aria-label="Diff settings"]'));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("writes several settings in one visit and does not rewrite the current one", async () => {
    await userEvent.click(radio("Split"));
    expect(preferences.setDiffPreference).not.toHaveBeenCalled();
    await userEvent.click(radio("Unified"));
    await userEvent.click(control('[aria-label="Structural diff"]'));
    await userEvent.click(control('[aria-label="Wrap lines"]'));
    expect(vi.mocked(preferences.setDiffPreference).mock.calls).toEqual([
      ["layout", "unified"],
      ["mode", "structural"],
      ["wrap", true],
    ]);
    expect(radio("Unified").getAttribute("aria-checked")).toBe("true");
  });

  it("shows a choice until the desktop confirms it, and drops it if the write fails", async () => {
    const write = Promise.withResolvers<void>();
    vi.mocked(preferences.setDiffPreference).mockImplementationOnce(
      () => write.promise,
    );
    const wrap = () => control('[aria-label="Wrap lines"]');

    await userEvent.click(wrap());
    expect(wrap().getAttribute("aria-checked")).toBe("true");
    expect(preferences.diffPreference("wrap")).toBe(false);
    await act(async () => write.reject(new Error("Read-only settings")));
    expect(wrap().getAttribute("aria-checked")).toBe("false");
    await act(async () => preferences.setDiffPreference("wrap", true));
    expect(wrap().getAttribute("aria-checked")).toBe("true");
  });

  function control(selector: string) {
    const element = document.querySelector<HTMLElement>(selector);

    if (!element) throw new Error(`${selector} not found`);

    return element;
  }

  function radio(label: string) {
    const element = [
      ...document.querySelectorAll<HTMLElement>('[role="radio"]'),
    ].find((item) => item.textContent === label);

    if (!element) throw new Error(`${label} radio not found`);

    return element;
  }
});
