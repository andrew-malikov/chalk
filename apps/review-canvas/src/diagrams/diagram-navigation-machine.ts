import { reviewPersistence } from "@canvas/review/review-persistence";
import { isStringValue } from "@chalk/review-contracts";
import { useActorRef } from "@xstate/react";
import type { SetStateAction } from "react";
import { useLayoutEffect } from "react";
import { type ActorRefFrom, assign, setup } from "xstate";
import { z } from "zod";

const savedDiagram = z.object({
  modelKey: z.string().optional(),
  expandedNodeIds: z.array(z.string()),
  selectedNodeId: z.string().nullable(),
  expanded: z.boolean(),
});

type SavedDiagram = z.infer<typeof savedDiagram>;

interface DiagramNavigationInput {
  key: string;
  modelKey: string | undefined;
  expandedNodeIds: Set<string>;
}

interface DiagramNavigation extends DiagramNavigationInput {
  selectedNodeId: string | null;
  expanded: boolean;
  restored: boolean;
}

type DiagramNavigationEvent =
  | { type: "configure"; input: DiagramNavigationInput }
  | { type: "setExpandedNodeIds"; next: SetStateAction<Set<string>> }
  | { type: "setSelectedNodeId"; next: SetStateAction<string | null> }
  | { type: "setExpanded"; expanded: boolean };

function persistence({ key, modelKey }: DiagramNavigationInput) {
  return reviewPersistence<DiagramNavigation, SavedDiagram>({
    key,
    scope: "session",
    partialize: (state) => ({
      modelKey: state.modelKey,
      expandedNodeIds: [...state.expandedNodeIds],
      selectedNodeId: state.selectedNodeId,
      expanded: state.expanded,
    }),
    parse: (value) => {
      const saved = savedDiagram.safeParse(value).data;

      return saved?.modelKey === modelKey ? saved : undefined;
    },
    restore: (saved, current) => ({
      ...current,
      ...saved,
      expandedNodeIds: new Set(saved.expandedNodeIds),
      restored: true,
    }),
  });
}

function initialNavigation(input: DiagramNavigationInput): DiagramNavigation {
  return persistence(input).read({
    ...input,
    selectedNodeId: null,
    expanded: false,
    restored: false,
  });
}

export const diagramNavigationMachine = setup({
  types: {
    // SAFETY: XState reads `context` only for type inference.
    context: {} as DiagramNavigation,
    // SAFETY: XState reads `input` only for type inference.
    input: {} as DiagramNavigationInput,
    // SAFETY: XState reads `events` only for type inference.
    events: {} as DiagramNavigationEvent,
  },
  actions: {
    persist: ({ context }) => persistence(context).write(context),
  },
}).createMachine({
  context: ({ input }) => initialNavigation(input),
  on: {
    configure: {
      guard: ({ context, event }) =>
        context.key !== event.input.key ||
        context.modelKey !== event.input.modelKey,
      actions: assign(({ event }) => initialNavigation(event.input)),
    },
    setExpandedNodeIds: {
      actions: [
        assign({
          expandedNodeIds: ({ context, event }) =>
            event.next instanceof Set
              ? event.next
              : event.next(context.expandedNodeIds),
        }),
        "persist",
      ],
    },
    setSelectedNodeId: {
      actions: [
        assign({
          selectedNodeId: ({ context, event }) =>
            event.next === null || isStringValue(event.next)
              ? event.next
              : event.next(context.selectedNodeId),
        }),
        "persist",
      ],
    },
    setExpanded: {
      actions: [assign({ expanded: ({ event }) => event.expanded }), "persist"],
    },
  },
});

export type DiagramNavigationActor = ActorRefFrom<
  typeof diagramNavigationMachine
>;

export function useDiagramNavigation(
  key: string,
  modelKey: string | undefined,
  expandedNodeIds: Set<string>,
) {
  const actor = useActorRef(diagramNavigationMachine, {
    input: { key, modelKey, expandedNodeIds },
  });

  useLayoutEffect(() => {
    actor.send({
      type: "configure",
      input: { key, modelKey, expandedNodeIds },
    });
  }, [actor, key, modelKey]);

  return actor;
}
