/*---------------------------------------------------------------------------------------------
 *  Copyright (c) dev.fast. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the repository root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type JsonValue, parseJsonText } from "@dev.fast/json";
import { createParser } from "eventsource-parser";

const DEFAULT_MAX_EVENT_CHARACTERS = 1024 * 1024;

export interface ConsumeReviewEventStreamOptions {
  readonly maxEventCharacters?: number;
}

export async function consumeReviewEventStream(
  stream: ReadableStream<Uint8Array>,
  onValue: (value: JsonValue) => void | Promise<void>,
  signal: AbortSignal,
  options: ConsumeReviewEventStreamOptions = {},
): Promise<void> {
  const maxEventCharacters =
    options.maxEventCharacters ?? DEFAULT_MAX_EVENT_CHARACTERS;

  if (!Number.isSafeInteger(maxEventCharacters) || maxEventCharacters <= 0) {
    throw new Error("maxEventCharacters must be a positive safe integer.");
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const pendingPayloads: string[] = [];

  const parser = createParser({
    onEvent: (event) => pendingPayloads.push(event.data),
    maxBufferSize: maxEventCharacters,
    onError: (error) => {
      throw error;
    },
  });

  const feed = (chunk: string): void => {
    parser.feed(chunk);
  };

  const drain = async (): Promise<void> => {
    while (pendingPayloads.length > 0 && !signal.aborted) {
      const payload = pendingPayloads.shift();

      if (payload === undefined) continue;
      await onValue(parseJsonText(payload));
    }
  };

  const cancelReader = (): void => {
    void reader.cancel().catch(() => undefined);
  };

  signal.addEventListener("abort", cancelReader, { once: true });

  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();

      if (signal.aborted) return;

      if (done) {
        const trailing = decoder.decode();

        if (trailing) feed(trailing);
        parser.reset();
        await drain();

        return;
      }

      const decoded = decoder.decode(value, { stream: true });

      if (decoded) feed(decoded);
      await drain();
    }
  } finally {
    signal.removeEventListener("abort", cancelReader);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
