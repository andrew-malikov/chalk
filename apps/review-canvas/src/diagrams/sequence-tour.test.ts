import { selectSource } from "@review/documents/lens-selection";
import { describe, expect, it } from "vitest";

import {
  createSequenceTourEntry,
  sequenceActiveMessageScrollTarget,
  sequenceActiveMessageScrollTopTarget,
  sequenceView,
} from "./diagrams";

const source = selectSource({
  side: "head",
  file: "src/example.ts",
  fromLine: 1,
  toLine: 3,
});

describe("sequence diagram guided tour", () => {
  it("turns source steps into ordered code-tour stops", () => {
    const sequence = sequenceView({
      id: "sequence-bootstrap",
      title: "Sign in and workspace bootstrap",
      actors: {
        auth: "Better Auth",
        org: "Organization helper",
        db: "Web D1",
        settings: "Settings page",
      },
      steps: [
        {
          type: "step",
          style: "call",
          id: "authUserWrite",
          from: "auth",
          to: "db",
          label: "write user",
          source,
        },
        {
          type: "step",
          style: "call",
          id: "orgCreate",
          from: "org",
          to: "db",
          label: "create organization",
          source,
        },
        {
          type: "step",
          style: "call",
          id: "settingsOrgRead",
          from: "db",
          to: "settings",
          label: "read organization",
          source,
        },
      ],
    });

    const tour = createSequenceTourEntry(sequence);

    expect(tour.title).toBe("Sign in and workspace bootstrap");
    expect(tour.stops).toMatchObject([
      {
        anchor: { id: "authUserWrite" },
        label: "write user",
        detail: "Better Auth -> Web D1",
        content: { kind: "source" },
      },
      {
        anchor: { id: "orgCreate" },
        label: "create organization",
        detail: "Organization helper -> Web D1",
        content: { kind: "source" },
      },
      {
        anchor: { id: "settingsOrgRead" },
        label: "read organization",
        detail: "Web D1 -> Settings page",
        content: { kind: "source" },
      },
    ]);
    expect(sequence.participants.map((participant) => participant.id)).toEqual([
      "auth",
      "org",
      "db",
      "settings",
    ]);
  });

  it("includes inline code in a tour stop without a source range", () => {
    const sequence = sequenceView({
      id: "sequence-labels",
      title: "Label readability",
      actors: { code: "Code element node", symbol: "Symbol label" },
      steps: [
        {
          type: "step",
          style: "call",
          id: "code-step",
          from: "code",
          to: "symbol",
          label: "allocates more horizontal room",
          code: { language: "bash", text: "chalk api review_edit" },
        },
      ],
    });

    expect(createSequenceTourEntry(sequence).stops).toEqual([
      {
        anchor: { id: "code-step", title: "allocates more horizontal room" },
        label: "allocates more horizontal room",
        detail: "Code element node -> Symbol label",
        content: {
          kind: "inline-code",
          language: "bash",
          text: "chalk api review_edit",
        },
      },
    ]);
  });

  it("keeps tour stops distinct when steps share a source range", () => {
    const sequence = sequenceView({
      id: "sequence-reuse",
      title: "Reuse",
      actors: { a: "A", b: "B" },
      steps: [
        {
          type: "step",
          style: "call",
          id: "send",
          from: "a",
          to: "b",
          label: "Send",
          source,
        },
        {
          type: "step",
          style: "call",
          id: "reply",
          from: "b",
          to: "a",
          label: "Reply",
          source,
        },
      ],
    });

    expect(
      createSequenceTourEntry(sequence).stops.map((stop) => stop.anchor.id),
    ).toEqual(["send", "reply"]);
    expect(sequence.messages[1]?.source).toEqual(source);
  });

  it("calculates scroll targets that reveal the active message participants", () => {
    const sequence = sequenceView({
      id: "sequence-evidence",
      title: "Evidence tour",
      actors: {
        reviewer: "Reviewer",
        app: "Review app",
        server: "Server",
        source: "Source reader",
        worker: "Worker",
      },
      steps: [
        {
          type: "step",
          style: "call",
          id: "localPreview",
          from: "reviewer",
          to: "app",
          label: "open preview",
          source,
        },
        {
          type: "step",
          style: "call",
          id: "sourceLookup",
          from: "app",
          to: "server",
          label: "resolve source range",
          source,
        },
        {
          type: "step",
          style: "call",
          id: "workerRefresh",
          from: "source",
          to: "worker",
          label: "refresh worker evidence",
          source,
        },
      ],
    });

    const baseScrollInput = {
      sequence,
      laneWidth: 176,
      viewportWidth: 420,
      scrollWidth: 880,
    };

    expect(
      sequenceActiveMessageScrollTarget({
        ...baseScrollInput,
        activeAnchor: "workerRefresh",
        currentScrollLeft: 0,
      }),
    ).toBe(460);
    expect(
      sequenceActiveMessageScrollTarget({
        ...baseScrollInput,
        activeAnchor: "sourceLookup",
        currentScrollLeft: 150,
      }),
    ).toBe(150);
    expect(
      sequenceActiveMessageScrollTarget({
        ...baseScrollInput,
        activeAnchor: "sourceLookup",
        currentScrollLeft: 480,
      }),
    ).toBe(152);
    expect(
      sequenceActiveMessageScrollTarget({
        ...baseScrollInput,
        activeAnchor: "missing",
        currentScrollLeft: 0,
      }),
    ).toBeNull();

    // Vertical counterpart: rows at messageTop + index * messageGap must be
    // brought into the capped, scrollable diagram body as the tour advances.
    const baseScrollTopInput = {
      sequence,
      messageTop: 112,
      messageGap: 76,
      viewportHeight: 200,
      scrollHeight: 990,
    };

    expect(
      sequenceActiveMessageScrollTopTarget({
        ...baseScrollTopInput,
        activeAnchor: "workerRefresh",
        currentScrollTop: 0,
      }),
    ).toBe(164);
    expect(
      sequenceActiveMessageScrollTopTarget({
        ...baseScrollTopInput,
        activeAnchor: "localPreview",
        currentScrollTop: 50,
      }),
    ).toBe(50);
    expect(
      sequenceActiveMessageScrollTopTarget({
        ...baseScrollTopInput,
        activeAnchor: "localPreview",
        currentScrollTop: 400,
      }),
    ).toBe(88);
    expect(
      sequenceActiveMessageScrollTopTarget({
        ...baseScrollTopInput,
        activeAnchor: "missing",
        currentScrollTop: 0,
      }),
    ).toBeNull();
    expect(
      sequenceActiveMessageScrollTopTarget({
        ...baseScrollTopInput,
        scrollHeight: 200,
        activeAnchor: "workerRefresh",
        currentScrollTop: 0,
      }),
    ).toBeNull();
  });
});
