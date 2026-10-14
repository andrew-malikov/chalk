import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { listenForDesktopHostShutdown } from "./desktop-host-shutdown";

describe("listenForDesktopHostShutdown", () => {
  it("unwraps Electron utility-process parentPort messages", () => {
    const processEvents = new EventEmitter();
    const parentPort = new EventEmitter();
    const onShutdown = vi.fn<() => void>();
    const onStageRustAnalyzer = vi.fn<(path: string) => void>();

    const dispose = listenForDesktopHostShutdown(
      Object.assign(processEvents, { parentPort }),
      onShutdown,
      onStageRustAnalyzer,
    );

    parentPort.emit("message", { data: { type: "shutdown" } });
    parentPort.emit("message", {
      data: {
        type: "stage-rust-analyzer",
        path: "/extensions/rust/server/rust-analyzer",
      },
    });
    processEvents.emit("message", { type: "shutdown" });
    parentPort.emit("message", { data: { type: "continue" } });
    dispose();
    parentPort.emit("message", { data: { type: "shutdown" } });

    expect(onShutdown).toHaveBeenCalledOnce();
    expect(onStageRustAnalyzer).toHaveBeenCalledWith(
      "/extensions/rust/server/rust-analyzer",
    );
  });

  it("accepts direct Node child-process messages", () => {
    const processEvents = new EventEmitter();
    const onShutdown = vi.fn<() => void>();
    const dispose = listenForDesktopHostShutdown(processEvents, onShutdown);

    processEvents.emit("message", { type: "shutdown" });
    processEvents.emit("message", { type: "continue" });
    dispose();
    processEvents.emit("message", { type: "shutdown" });

    expect(onShutdown).toHaveBeenCalledOnce();
  });
});
