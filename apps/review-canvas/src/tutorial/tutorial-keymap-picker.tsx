import { Button as ButtonPrimitive } from "@canvas/components/ui/button";
import { cn } from "@canvas/lib/utils";
import { controlStyles } from "@canvas/styles/controls-styles";
import type { ReviewKeymapChoice } from "@chalk/review-contracts";
import type { ReviewComponentProps } from "@review/documents/authoring";
import { useState } from "react";

import { useTutorial } from "./tutorial-context";

const choices: readonly { value: ReviewKeymapChoice; label: string }[] = [
  { value: "none", label: "VS Code default" },
  { value: "vim", label: "Vim" },
  { value: "emacs", label: "Emacs" },
  { value: "sublime", label: "Sublime Text" },
];

export function TutorialKeymapPicker(
  _props: ReviewComponentProps<"TutorialKeymapPicker">,
) {
  const tutorial = useTutorial();
  const [pending, setPending] = useState<ReviewKeymapChoice | null>(null);

  return (
    // The class is the tutorial's target.
    <div
      className={cn(
        "tutorial-keymap-picker",
        controlStyles.segmented,
        styles.group,
      )}
      role="group"
      aria-label="Keybindings"
    >
      {choices.map((choice) => {
        const pressed = tutorial?.content.keymap === choice.value;
        const disabled = !tutorial || pending !== null;

        return (
          <ButtonPrimitive
            variant="ghost"
            size="xs"
            key={choice.value}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            className={cn(
              controlStyles.segment,
              controlStyles.segmentLarge,
              pressed && controlStyles.segmentActive,
            )}
            onClick={() => {
              if (!tutorial) return;
              setPending(choice.value);
              void tutorial
                .selectKeymap(choice.value)
                .finally(() => setPending(null));
            }}
          >
            {pending === choice.value ? "Applying…" : choice.label}
          </ButtonPrimitive>
        );
      })}
    </div>
  );
}

// Inline-flex so the tutorial ring hugs the group.
const styles = {
  group: "tw:inline-flex tw:m-[6px_0_12px]",
};
