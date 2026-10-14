import type {
  ReviewCanvasInstallContent,
  ReviewCliInstallStatus,
} from "@blackboard/review-contracts";
import { CanvasUiContext } from "@canvas/host/canvas-ui";
import { testCanvasUi } from "@canvas/test/canvas-ui-test-utils";
import { type ReactNode, act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectCard, REVIEW_CONNECT_TARGET_STORAGE_KEY } from "./connect-card";

const status: ReviewCliInstallStatus = {
  fingerprint: "f",
  stamp: null,
  stale: false,
  updateNeeded: false,
  shim: {
    path: "/tmp/review",
    installed: true,
    profileConfigured: true,
    onPath: true,
  },

  cli: { path: "/tmp/cli.js", version: "0.0.1" },
  connect: {
    command: "sh",
    args: ["-c", 'exec "$HOME/.local/bin/review" mcp'],
    prompts: {
      claude: "CLAUDE PROMPT",
      codex: "CODEX PROMPT",
      opencode: "OPENCODE PROMPT",
      pi: "PI PROMPT",
      omp: "OMP PROMPT",
      copilot: "COPILOT PROMPT",
    },
    plugins: {
      claude: {
        label: "Install the Claude Code plugin",
        command: "CLAUDE COMMAND",
      },
      codex: { label: "Install the Codex plugin", command: "CODEX COMMAND" },
      opencode: {
        label: "Install the OpenCode plugin",
        command: "OPENCODE COMMAND",
      },
      pi: { label: "Install the Pi package", command: "PI COMMAND" },
      omp: { label: "Install the oh-my-pi package", command: "OMP COMMAND" },
      copilot: {
        label: "Install the Copilot CLI plugin",
        command: "COPILOT COMMAND",
      },
    },
  },
};

function content(
  overrides: Partial<ReviewCliInstallStatus> = {},
): ReviewCanvasInstallContent {
  const s = { ...status, ...overrides };

  const same = async () => s;

  return {
    status: s,
    apply: vi.fn<ReviewCanvasInstallContent["apply"]>(same),
    remove: vi.fn<ReviewCanvasInstallContent["remove"]>(same),
    finishUpdate: vi.fn<ReviewCanvasInstallContent["finishUpdate"]>(same),
    decline: vi.fn<ReviewCanvasInstallContent["decline"]>(same),
    skip: vi.fn<ReviewCanvasInstallContent["skip"]>(same),
    enablePrompts: vi.fn<ReviewCanvasInstallContent["enablePrompts"]>(same),
  };
}

const mounted: { root: Root; container: HTMLDivElement }[] = [];

async function mount(node: ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);

  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(node));

  return container;
}

afterEach(async () => {
  localStorage.removeItem(REVIEW_CONNECT_TARGET_STORAGE_KEY);

  for (const { root, container } of mounted.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
});

function button(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  );
}

function body(container: HTMLElement) {
  return container.querySelector("pre")?.textContent;
}

function otherTrigger(container: HTMLElement) {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="Other agent"]',
  );
}

function copyButton(container: HTMLElement) {
  return container.querySelector<HTMLButtonElement>("[aria-live]");
}

describe("ConnectCard", () => {
  it("shows the Claude Code prompt first and switches harness on click", async () => {
    const container = await mount(<ConnectCard install={content()} />);

    expect(button(container, "Claude Code")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(body(container)).toBe("CLAUDE PROMPT");

    await act(async () => button(container, "Codex")?.click());
    expect(button(container, "Codex")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(button(container, "Claude Code")?.getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(body(container)).toBe("CODEX PROMPT");
    expect(localStorage.getItem(REVIEW_CONNECT_TARGET_STORAGE_KEY)).toBe(
      "codex",
    );
  });

  it("preselects the stored harness", async () => {
    localStorage.setItem(REVIEW_CONNECT_TARGET_STORAGE_KEY, "pi");

    const container = await mount(<ConnectCard install={content()} />);

    expect(otherTrigger(container)?.textContent).toBe("Pi");
    expect(otherTrigger(container)?.getAttribute("aria-pressed")).toBe("true");
    expect(body(container)).toBe("PI PROMPT");
  });

  it.each(["cursor", "unknown"])(
    "falls back to Claude Code for an unsupported stored agent: %s",
    async (target) => {
      localStorage.setItem(REVIEW_CONNECT_TARGET_STORAGE_KEY, target);

      const container = await mount(<ConnectCard install={content()} />);

      expect(
        button(container, "Claude Code")?.getAttribute("aria-pressed"),
      ).toBe("true");
      expect(body(container)).toBe("CLAUDE PROMPT");
    },
  );

  it("swaps between the other agents from the menu", async () => {
    const host = testCanvasUi();

    const container = await mount(
      <CanvasUiContext.Provider value={host.ui}>
        <ConnectCard install={content()} />
      </CanvasUiContext.Provider>,
    );

    expect(otherTrigger(container)?.textContent).toBe("Other…");
    expect(otherTrigger(container)?.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector("[role=menu]")).toBeNull();

    await act(async () => otherTrigger(container)?.click());
    expect(host.menu.items.map((item) => item.label)).toEqual([
      "Pi",
      "oh-my-pi",
      "Copilot CLI",
    ]);
    await act(async () => host.select("omp"));
    expect(container.querySelector("[role=menu]")).toBeNull();
    expect(otherTrigger(container)?.textContent).toBe("oh-my-pi");
    expect(otherTrigger(container)?.getAttribute("aria-pressed")).toBe("true");
    expect(
      otherTrigger(container)?.querySelector("#review-agent-logo-omp-gradient"),
    ).not.toBeNull();
    expect(button(container, "Claude Code")?.getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(body(container)).toBe("OMP PROMPT");
    expect(localStorage.getItem(REVIEW_CONNECT_TARGET_STORAGE_KEY)).toBe("omp");

    await act(async () => button(container, "Install the plugin")?.click());
    expect(body(container)).toBe("OMP COMMAND");
    expect(copyButton(container)?.getAttribute("aria-label")).toBe(
      "Copy install command for oh-my-pi",
    );

    await act(async () => button(container, "Codex")?.click());
    expect(otherTrigger(container)?.textContent).toBe("Other…");
    expect(otherTrigger(container)?.getAttribute("aria-pressed")).toBe("false");
  });

  it("copies whichever text is shown", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();

    const container = await mount(<ConnectCard install={content()} />);

    await act(async () => button(container, "Codex")?.click());
    expect(copyButton(container)?.getAttribute("aria-label")).toBe(
      "Copy prompt for Codex",
    );
    await act(async () => copyButton(container)?.click());
    expect(writeText).toHaveBeenLastCalledWith("CODEX PROMPT");
    expect(copyButton(container)?.textContent).toBe("Copied");

    await act(async () => button(container, "Install the plugin")?.click());
    expect(body(container)).toBe("CODEX COMMAND");
    expect(copyButton(container)?.textContent).toBe("Copy command");
    expect(copyButton(container)?.getAttribute("aria-label")).toBe(
      "Copy install command for Codex",
    );
    await act(async () => copyButton(container)?.click());
    expect(writeText).toHaveBeenLastCalledWith("CODEX COMMAND");
    expect(copyButton(container)?.textContent).toBe("Copied");
    writeText.mockRestore();
  });

  it("reports a successful copy", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();

    const onCopied = vi.fn<() => void>();

    const container = await mount(
      <ConnectCard install={content()} onCopied={onCopied} />,
    );

    await act(async () => copyButton(container)?.click());
    expect(onCopied).toHaveBeenCalledOnce();
    writeText.mockRestore();
  });

  it.each([
    { cli: null, shim: { ...status.shim, installed: false } },
    { shim: { ...status.shim, installed: false } },
    { shim: { ...status.shim, onPath: false, profileConfigured: false } },
  ])(
    "blocks setup actions until prerequisites are complete: %j",
    async (overrides) => {
      const container = await mount(
        <ConnectCard install={content(overrides)} />,
      );

      expect(container.querySelector("button")).toBeNull();
      expect(container.querySelector("a")).toBeNull();
      expect(container.querySelector("pre")).toBeNull();
    },
  );

  it("collapses a long prompt until the reader expands it, and copies all of it", async () => {
    const long = Array.from({ length: 8 }, (_, i) => `line ${i + 1}`).join(
      "\n",
    );

    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();

    const container = await mount(
      <ConnectCard
        install={content({
          connect: {
            ...status.connect,
            prompts: { ...status.connect.prompts, claude: long },
          },
        })}
      />,
    );

    const body = container.querySelector("pre");
    expect(body?.dataset.collapsed).toBe("true");

    const toggle = container.querySelector("pre + [aria-expanded]");

    expect(toggle?.textContent).toBe("Show full prompt");
    await act(async () => (toggle as HTMLButtonElement).click());
    expect(body?.dataset.collapsed).toBe("false");
    expect(container.querySelector('[aria-expanded="true"]')?.textContent).toBe(
      "Show less",
    );

    const copy = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Copy prompt",
    );

    await act(async () => copy?.click());
    expect(writeText).toHaveBeenCalledWith(long);

    const short = await mount(<ConnectCard install={content()} />);
    expect(short.querySelector("pre")?.dataset.collapsed).toBe("false");
    expect(short.querySelector("pre + [aria-expanded]")).toBeNull();
  });
});
