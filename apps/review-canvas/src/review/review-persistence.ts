import {
  type JsonValue,
  isJsonObject,
  jsonNumber,
} from "@chalk/review-contracts";

import {
  type ReviewUiScope,
  readReviewUiState,
  removeReviewUiState,
  writeReviewUiState,
} from "./review-ui-state";

interface ReviewPersistence<T, Saved> {
  key: string;
  scope: ReviewUiScope;
  partialize(state: T): Saved;
  parse(value: JsonValue): Saved | undefined;
  restore?(saved: Saved, current: T): T;
  /** Existing unwrapped JSON at this key is read as version zero. */
  legacy?: boolean;
}

const VERSION = 1;

/** Persist only resumable data; validate it before it can enter a live actor. */
export function reviewPersistence<T, Saved>({
  key,
  scope,
  partialize,
  parse,
  restore = (saved, current) => ({ ...current, ...saved }),
  legacy = false,
}: ReviewPersistence<T, Saved>) {
  return {
    read(current: T): T {
      const value = readReviewUiState<JsonValue>(scope, key);

      if (value === null) return current;
      const wrapped = isJsonObject(value) && "state" in value;
      const version = wrapped ? jsonNumber(value.version) : 0;

      if (version !== VERSION && !(legacy && version === 0)) return current;
      const saved = parse(wrapped ? value.state : value);

      if (saved === undefined) return current;
      const restored = restore(saved, current);

      if (version === 0) this.write(restored);

      return restored;
    },
    write(state: T): void {
      writeReviewUiState(scope, key, {
        state: partialize(state),
        version: VERSION,
      });
    },
    clear(): void {
      removeReviewUiState(scope, key);
    },
  };
}
