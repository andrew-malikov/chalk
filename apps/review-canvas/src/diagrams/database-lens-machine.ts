import { reviewPersistence } from "@canvas/review/review-persistence";
import { useActorRef } from "@xstate/react";
import { useLayoutEffect } from "react";
import { assign, setup } from "xstate";
import { z } from "zod";

interface DatabaseLensInput {
  key: string;
  useCaseIds: readonly string[];
}

interface DatabaseLensState extends DatabaseLensInput {
  activeUseCaseId: string | null;
}

type DatabaseLensEvent =
  | { type: "configure"; input: DatabaseLensInput }
  | { type: "selectUseCase"; id: string };

const savedUseCase = z.object({ activeUseCaseId: z.string().nullable() });

function persistence({ key, useCaseIds }: DatabaseLensInput) {
  return reviewPersistence<DatabaseLensState, z.infer<typeof savedUseCase>>({
    key,
    scope: "session",
    partialize: ({ activeUseCaseId }) => ({ activeUseCaseId }),
    parse: (value) => {
      const saved = savedUseCase.safeParse(value).data;

      return saved?.activeUseCaseId &&
        useCaseIds.includes(saved.activeUseCaseId)
        ? saved
        : undefined;
    },
  });
}

function initialSelection(input: DatabaseLensInput): DatabaseLensState {
  return persistence(input).read({
    ...input,
    activeUseCaseId: input.useCaseIds[0] ?? null,
  });
}

export const databaseLensMachine = setup({
  types: {
    // SAFETY: XState reads `context` only for type inference.
    context: {} as DatabaseLensState,
    // SAFETY: XState reads `input` only for type inference.
    input: {} as DatabaseLensInput,
    // SAFETY: XState reads `events` only for type inference.
    events: {} as DatabaseLensEvent,
  },
}).createMachine({
  context: ({ input }) => initialSelection(input),
  on: {
    configure: {
      guard: ({ context, event }) =>
        context.key !== event.input.key ||
        JSON.stringify(context.useCaseIds) !==
          JSON.stringify(event.input.useCaseIds),
      actions: assign(({ event }) => initialSelection(event.input)),
    },
    selectUseCase: {
      guard: ({ context, event }) => context.useCaseIds.includes(event.id),
      actions: [
        assign({ activeUseCaseId: ({ event }) => event.id }),
        ({ context }) => persistence(context).write(context),
      ],
    },
  },
});

export function useDatabaseLensSelection(
  key: string,
  useCaseIds: readonly string[],
) {
  const actor = useActorRef(databaseLensMachine, {
    input: { key, useCaseIds },
  });

  const idsKey = JSON.stringify(useCaseIds);

  useLayoutEffect(() => {
    actor.send({ type: "configure", input: { key, useCaseIds } });
  }, [actor, key, idsKey]);

  return actor;
}
