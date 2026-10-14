import { Electroview } from "electrobun/view";

import type { AppRPC, HostState } from "./rpc";
import { mountElectrobunShell } from "./shell";

const container = document.getElementById("app")!;

const wasmUrl = new URL(
  "../../../node_modules/@mr_mint/elkjs-libavoid/dist/libavoid.wasm",
  import.meta.url,
).href;

let shell: ReturnType<typeof mountElectrobunShell> | undefined;

let receivedState = false;

function render(state: HostState) {
  if (state.status === "ready") {
    if (!shell) {
      container.replaceChildren();
      shell = mountElectrobunShell(container, {
        state,
        rpc,
        wasmUrl,
        nativeTitlebar: navigator.platform.startsWith("Mac"),
      });
    }

    return;
  }

  shell?.dispose();
  shell = undefined;
  const status = document.createElement("main");
  status.className = "review-shell-loading tw:p-8";
  status.setAttribute("role", state.status === "starting" ? "status" : "alert");
  status.textContent = state.message ?? "Starting Chalk…";
  container.replaceChildren(status);
}

const rpc = Electroview.defineRPC<AppRPC>({
  maxRequestTime: 120000,
  handlers: {
    requests: {},
    messages: {
      hostState: (state) => {
        receivedState = true;
        render(state);
      },
      command: (value) => shell?.command(value),
    },
  },
});

const electroview = new Electroview({ rpc });

void electroview
  .rpc!.request.getState()
  .then((state) => {
    if (!receivedState) render(state);
  })
  .catch((error) => render({ status: "error", message: String(error) }));
