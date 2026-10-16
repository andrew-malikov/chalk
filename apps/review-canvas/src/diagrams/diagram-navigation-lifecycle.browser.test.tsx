import { useSelector } from "@xstate/react";
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";

import { useDatabaseLensSelection } from "./database-lens-machine";
import { useDiagramNavigation } from "./diagram-navigation-machine";

it("restores each review's selections when mounted hooks change keys under Strict Mode", async () => {
  localStorage.clear();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  const render = (scope: string) =>
    act(async () => {
      root.render(
        <StrictMode>
          <Selections scope={scope} />
        </StrictMode>,
      );
    });

  const select = () =>
    act(async () => {
      container.querySelector<HTMLButtonElement>("button")!.click();
    });

  try {
    await render("a");
    await select();
    expect(container.querySelector("output")?.textContent).toBe(
      "a.child:second",
    );
    await render("b");
    expect(container.querySelector("output")?.textContent).toBe("none:first");
    await select();
    expect(container.querySelector("output")?.textContent).toBe(
      "b.child:second",
    );
    await render("a");
    expect(container.querySelector("output")?.textContent).toBe(
      "a.child:second",
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

function Selections({ scope }: { scope: string }) {
  const graph = useDiagramNavigation(`graph:${scope}`, scope, new Set());
  const lens = useDatabaseLensSelection(`lens:${scope}`, ["first", "second"]);

  const selected = useSelector(
    graph,
    (snapshot) => snapshot.context.selectedNodeId,
  );

  const useCase = useSelector(
    lens,
    (snapshot) => snapshot.context.activeUseCaseId,
  );

  return (
    <>
      <output>
        {selected ?? "none"}:{useCase}
      </output>
      <button
        onClick={() => {
          graph.send({ type: "setSelectedNodeId", next: `${scope}.child` });
          lens.send({ type: "selectUseCase", id: "second" });
        }}
      >
        Select
      </button>
    </>
  );
}
