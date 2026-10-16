import type { ReviewClientConfig } from "@canvas/host/review-client";
import type { ReviewFindQuery } from "@chalk/review-contracts";
import { assign, setup } from "xstate";
import { z } from "zod";

import type { ReviewInlineFindRegistration } from "./review-find";
import { reviewPersistence } from "./review-persistence";
import { reviewUiStateKey } from "./review-ui-state";

/** A match holds live DOM and editor handles, so it never outlives the
 * search that produced it. */
export type ReviewFindMatch =
  | { kind: "mdx"; range: Range; node: Node }
  | {
      kind: "editor";
      registration: ReviewInlineFindRegistration;
      localIndex: number;
      node: Node;
    };

export type ReviewFindOption = "matchCase" | "wholeWord" | "isRegex";

interface ReviewFindContext {
  config: ReviewClientConfig | undefined;
  query: ReviewFindQuery;
  error: string | null;
  matches: readonly ReviewFindMatch[];
  activeIndex: number;
  /** Bumped by every transition that supersedes an outstanding search. */
  generation: number;
}

type ReviewFindEvent =
  | { type: "show"; seed?: string }
  | { type: "setText"; text: string }
  | { type: "toggleOption"; option: ReviewFindOption }
  | { type: "startSearch" }
  | {
      type: "completeSearch";
      generation: number;
      matches: readonly ReviewFindMatch[];
    }
  | { type: "clearResults" }
  | { type: "rejectQuery"; error: string }
  | { type: "setActiveIndex"; index: number }
  | { type: "forgetRegistration"; registration: ReviewInlineFindRegistration }
  | { type: "close"; clearQuery?: boolean };

const emptyResults = { error: null, matches: [], activeIndex: -1 };

const savedFindQuery = z.object({
  text: z.string(),
  matchCase: z.boolean(),
  wholeWord: z.boolean(),
  isRegex: z.boolean(),
});

function persistence(config: ReviewClientConfig) {
  return reviewPersistence<ReviewFindContext, ReviewFindQuery>({
    key: reviewUiStateKey(config, "session", "find"),
    scope: "session",
    partialize: (state) => state.query,
    parse: (value) => savedFindQuery.safeParse(value).data,
    restore: (query, current) => ({ ...current, query }),
  });
}

export const reviewFindMachine = setup({
  types: {
    // SAFETY: XState reads `context` only for type inference.
    context: {} as ReviewFindContext,
    // SAFETY: XState reads `input` only for type inference.
    input: {} as ReviewClientConfig | undefined,
    // SAFETY: XState reads `events` only for type inference.
    events: {} as ReviewFindEvent,
  },
  actions: {
    clearResults: assign(({ context }) => ({
      ...emptyResults,
      generation: context.generation + 1,
    })),
    close: assign(({ context, event }) => ({
      ...emptyResults,
      query:
        event.type === "close" && event.clearQuery && context.query.text
          ? { ...context.query, text: "" }
          : context.query,
      generation: context.generation + 1,
    })),
    persist: ({ context }) => {
      if (context.config) persistence(context.config).write(context);
    },
  },
}).createMachine({
  context: ({ input: config }) => {
    const initial: ReviewFindContext = {
      config,
      query: { text: "", matchCase: false, wholeWord: false, isRegex: false },
      ...emptyResults,
      generation: 0,
    };

    return config ? persistence(config).read(initial) : initial;
  },
  initial: "closed",
  on: {
    setText: {
      guard: ({ context, event }) => context.query.text !== event.text,
      actions: [
        assign({
          query: ({ context, event }) => ({
            ...context.query,
            text: event.text,
          }),
        }),
        "persist",
      ],
    },
    toggleOption: {
      actions: [
        assign({
          query: ({ context, event }) => ({
            ...context.query,
            [event.option]: !context.query[event.option],
          }),
        }),
        "persist",
      ],
    },
    setActiveIndex: {
      actions: assign({ activeIndex: ({ event }) => event.index }),
    },
    forgetRegistration: {
      actions: assign(({ context, event }) => {
        const matches = context.matches.filter(
          (match) =>
            match.kind !== "editor" ||
            match.registration !== event.registration,
        );

        return matches.length === context.matches.length
          ? {}
          : {
              matches,
              activeIndex: Math.min(context.activeIndex, matches.length - 1),
            };
      }),
    },
    close: { target: ".closed", actions: ["close", "persist"] },
  },
  states: {
    closed: {
      on: {
        show: {
          target: "open",
          actions: [
            assign({
              query: ({ context, event }) =>
                event.seed
                  ? { ...context.query, text: event.seed }
                  : context.query,
            }),
            "persist",
          ],
        },
      },
    },
    open: {
      initial: "idle",
      on: {
        startSearch: { target: ".searching", actions: "clearResults" },
        clearResults: { target: ".idle", actions: "clearResults" },
        rejectQuery: {
          target: ".invalid",
          // An invalid expression keeps the last valid results on screen.
          actions: assign(({ context, event }) => ({
            error: event.error,
            generation: context.generation + 1,
          })),
        },
      },
      states: {
        idle: {},
        searching: {
          on: {
            completeSearch: {
              guard: ({ context, event }) =>
                event.generation === context.generation,
              target: "idle",
              actions: assign({ matches: ({ event }) => event.matches }),
            },
          },
        },
        invalid: {},
      },
    },
  },
});
