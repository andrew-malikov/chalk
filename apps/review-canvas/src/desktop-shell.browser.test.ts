import { defaultPreferences } from "@shell/rpc";
import { mountElectrobunShell } from "@shell/shell";
import { act } from "react";
import { expect, it, vi } from "vitest";

import "./styles.css";

it("keeps the desktop review area inside the window", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockRejectedValue(new Error("Offline")),
  );
  const container = document.createElement("div");
  container.style.cssText = "width: 1200px; height: 600px";
  document.body.append(container);

  let shell: ReturnType<typeof mountElectrobunShell> | undefined;

  try {
    await act(async () => {
      shell = mountElectrobunShell(container, {
        state: {
          status: "ready",
          discovery: {
            version: 3,
            url: "http://localhost:9999",
            token: "test-token",
            instanceId: "test-instance",
            appPid: 1,
            serverPid: 2,
            startedAt: 1,
          },
          preferences: defaultPreferences,
        },
        rpc: {
          request: {
            getState: async () => ({ status: "starting" }),
            setPreferences: async (patch) => ({
              ...defaultPreferences,
              ...patch,
            }),
            openSource: async () => {},
            openExternal: async () => {},
            focusWindow: async () => {},
          },
          send: { diagnostic: () => {} },
        },
        wasmUrl: "",
      });
    });

    const content = container.querySelector("main")!;
    expect(content.getBoundingClientRect().width).toBe(1200);
    expect(content.getBoundingClientRect().height).toBeGreaterThan(400);
    expect(content.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      container.getBoundingClientRect().bottom,
    );
  } finally {
    await act(async () => shell?.dispose());
    container.remove();
    vi.unstubAllGlobals();
  }
});
