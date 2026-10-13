import type {
  ReviewCanvasInstallContent,
  ReviewCliInstallStatus,
} from "@blackboard/review-protocol";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewHome } from "./review-home-view";
import {
  REVIEW_CONNECT_COPIED_STORAGE_KEY,
  STEP_ADVANCE_DELAY_MS,
  WelcomePage,
} from "./welcome-page";

const fresh: ReviewCliInstallStatus = {
  fingerprint: "test",
  stamp: null,
  stale: false,
  updateNeeded: false,
  shim: {
    path: "/tmp/review",
    installed: false,
    profileConfigured: false,
    onPath: false,
  },

  cli: { path: "/tmp/cli.js", version: "0.0.1" },
  connect: {
    command: "sh",
    args: ["-c", 'exec "$HOME/.local/bin/review" mcp'],
    prompts: {
      claude: "claude prompt",
      codex: "codex prompt",
      opencode: "opencode prompt",
      pi: "pi prompt",
      omp: "omp prompt",
      copilot: "copilot prompt",
    },
    plugins: {
      claude: { label: "claude plugin", command: "claude command" },
      codex: { label: "codex plugin", command: "codex command" },
      opencode: { label: "opencode plugin", command: "opencode command" },
      pi: { label: "pi plugin", command: "pi command" },
      omp: { label: "omp plugin", command: "omp command" },
      copilot: { label: "copilot plugin", command: "copilot command" },
    },
  },
};

function content(status: ReviewCliInstallStatus): ReviewCanvasInstallContent {
  const same = async () => status;

  return {
    status,
    apply: vi.fn<ReviewCanvasInstallContent["apply"]>(same),
    remove: vi.fn<ReviewCanvasInstallContent["remove"]>(same),
    finishUpdate: vi.fn<ReviewCanvasInstallContent["finishUpdate"]>(
      async () => ({ ...status, updateNeeded: false }),
    ),
    decline: vi.fn<ReviewCanvasInstallContent["decline"]>(same),
    skip: vi.fn<ReviewCanvasInstallContent["skip"]>(same),
    enablePrompts: vi.fn<ReviewCanvasInstallContent["enablePrompts"]>(same),
  };
}

describe("WelcomePage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    localStorage.removeItem(REVIEW_CONNECT_COPIED_STORAGE_KEY);
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  const buttons = (label: string) =>
    [...container.querySelectorAll("button")].filter(
      (button) =>
        button.textContent === label && button.parentElement?.tagName !== "LI",
    );

  const step = (index: number) => container.querySelectorAll("ol > li")[index];

  const stepState = (index: number) => step(index)?.getAttribute("data-state");

  const stepOpen = (index: number) => step(index)?.getAttribute("data-open");

  it("opens on the install step until the blackboard command is installed", async () => {
    const onClose = vi.fn<() => void>();

    const setupActions = {
      load: vi.fn<() => Promise<ReviewCanvasInstallContent>>(async () =>
        content({
          ...fresh,
          shim: { ...fresh.shim, installed: true, profileConfigured: true },
        }),
      ),
      installCli: vi.fn<() => Promise<void>>(async () => {}),
    };

    await act(async () =>
      root.render(
        <WelcomePage
          install={content(fresh)}
          setupActions={setupActions}
          onClose={onClose}
        />,
      ),
    );
    expect(buttons("Close")[0]?.disabled).toBe(true);
    expect(stepOpen(0)).toBe("true");
    expect(stepState(0)).toBe("todo");
    expect(stepState(1)).toBe("todo");
    expect(buttons("Install blackboard in PATH")).toHaveLength(1);

    for (const index of [1, 2, 3]) {
      const header = step(index)?.querySelector("button") as HTMLButtonElement;
      expect(header.disabled).toBe(true);
      await act(async () => header.click());
      expect(stepOpen(index)).toBe("false");
    }

    await act(async () => buttons("Install blackboard in PATH")[0]?.click());
    await waitForStepAdvance();
    expect(setupActions.installCli).toHaveBeenCalledOnce();
    expect(buttons("Close")[0]?.disabled).toBe(false);
    expect(stepState(0)).toBe("done");
    expect(stepOpen(1)).toBe("true");
    expect(buttons("Install blackboard in PATH")).toHaveLength(0);
    expect(
      (step(1)?.querySelector("button") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("offers recovery instead of installation until a missing CLI is available", async () => {
    const setupActions = {
      load: vi.fn<() => Promise<ReviewCanvasInstallContent>>(async () =>
        content(fresh),
      ),
      installCli: vi.fn<() => Promise<void>>(async () => {}),
    };

    await act(async () =>
      root.render(
        <WelcomePage
          install={content({ ...fresh, cli: null })}
          setupActions={setupActions}
        />,
      ),
    );
    expect(stepState(0)).toBe("todo");
    expect(container.textContent).toContain("CLI build missing.");
    expect(buttons("Install blackboard in PATH")).toHaveLength(0);
    expect(
      (step(1)?.querySelector("button") as HTMLButtonElement).disabled,
    ).toBe(true);

    await act(async () => buttons("Refresh")[0]?.click());
    expect(setupActions.load).toHaveBeenCalledOnce();
    expect(setupActions.installCli).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("CLI build missing.");
    expect(buttons("Install blackboard in PATH")).toHaveLength(1);
    expect(
      (step(1)?.querySelector("button") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("blocks an existing command until PATH is configured", async () => {
    const install = content({
      ...fresh,
      updateNeeded: true,
      shim: { ...fresh.shim, installed: true },
    });

    await act(async () => root.render(<WelcomePage install={install} />));
    expect(stepState(0)).toBe("todo");
    expect(
      (step(1)?.querySelector("button") as HTMLButtonElement).disabled,
    ).toBe(true);

    await act(async () =>
      root.render(
        <WelcomePage
          install={content({
            ...install.status,
            shim: { ...install.status.shim, onPath: true },
          })}
        />,
      ),
    );
    expect(stepState(0)).toBe("done");
    expect(
      (step(1)?.querySelector("button") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("tells a Windows reader to open a terminal rather than edit a POSIX PATH", async () => {
    const shimPath = "C:\\Users\\tester\\.local\\bin\\blackboard.cmd";
    await act(async () =>
      root.render(
        <WelcomePage
          install={content({
            ...fresh,
            shim: { ...fresh.shim, path: shimPath, installed: true },
          })}
        />,
      ),
    );
    expect(container.textContent).not.toContain("~/.local/bin");
    expect(container.textContent).toContain("new terminal");
  });

  it("finishes the connect step once a prompt is copied", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();

    await act(async () =>
      root.render(
        <WelcomePage
          install={content({
            ...fresh,
            shim: { ...fresh.shim, installed: true, profileConfigured: true },
          })}
        />,
      ),
    );
    expect(stepState(1)).toBe("todo");
    await act(async () => buttons("Copy prompt")[0]?.click());
    expect(stepState(1)).toBe("done");
    expect(stepOpen(1)).toBe("true");
    expect(buttons("Copied")).toHaveLength(1);
    await waitForStepAdvance();
    expect(stepOpen(2)).toBe("true");
    expect(localStorage.getItem(REVIEW_CONNECT_COPIED_STORAGE_KEY)).toBe("1");
    writeText.mockRestore();
  });

  it("advances to Dismiss after copying an upgrade prompt", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();

    await act(async () =>
      root.render(
        <WelcomePage
          install={content({
            ...fresh,
            updateNeeded: true,
            shim: { ...fresh.shim, installed: true, onPath: true },
          })}
        />,
      ),
    );
    await act(async () => buttons("Copy prompt")[0]?.click());
    await waitForStepAdvance();
    expect(stepOpen(1)).toBe("false");
    expect(stepOpen(2)).toBe("true");
    expect(buttons("Dismiss").at(-1)?.disabled).toBe(false);
    writeText.mockRestore();
  });

  it("requires opening the agent card even if a prompt was copied previously", async () => {
    localStorage.setItem(REVIEW_CONNECT_COPIED_STORAGE_KEY, "1");
    await act(async () =>
      root.render(
        <WelcomePage
          onClose={() => {}}
          install={content({
            ...fresh,
            shim: { ...fresh.shim, installed: true, onPath: true },
          })}
        />,
      ),
    );
    expect(buttons("Close")[0]?.disabled).toBe(true);
    await act(async () =>
      (step(1)?.querySelector("button") as HTMLButtonElement).click(),
    );
    expect(buttons("Close")[0]?.disabled).toBe(false);
  });

  it("stays on installation when it fails or PATH remains unavailable", async () => {
    const setupActions = {
      load: vi.fn<() => Promise<ReviewCanvasInstallContent>>(async () =>
        content(fresh),
      ),
      installCli: vi.fn<() => Promise<void>>(async () => {
        throw new Error("Installation failed");
      }),
    };

    await act(async () =>
      root.render(
        <WelcomePage
          install={content(fresh)}
          setupActions={setupActions}
          onClose={() => {}}
        />,
      ),
    );
    await act(async () => buttons("Install blackboard in PATH")[0]?.click());
    expect(container.textContent).toContain("Installation failed");
    expect(stepOpen(0)).toBe("true");
    expect(buttons("Close")[0]?.disabled).toBe(true);
    setupActions.installCli.mockResolvedValue(undefined);
    await act(async () => buttons("Install blackboard in PATH")[0]?.click());
    expect(stepOpen(0)).toBe("true");
    expect(buttons("Close")[0]?.disabled).toBe(true);
  });

  it("dismisses an upgrade from empty Home with PATH ready and the agent card open", async () => {
    const install = content({
      ...fresh,
      updateNeeded: true,
      shim: { ...fresh.shim, installed: true, onPath: true },
    });

    await act(async () =>
      root.render(
        <ReviewHome reviews={[]} onOpen={() => {}} install={install} />,
      ),
    );
    await act(async () => buttons("Dismiss")[0]?.click());
    expect(install.finishUpdate).toHaveBeenCalledOnce();
    expect(container.querySelector("ol")).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Sessions");
  });
});

function waitForStepAdvance() {
  return act(() => vi.advanceTimersByTime(STEP_ADVANCE_DELAY_MS));
}
