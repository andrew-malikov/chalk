import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { CommentEditor } from "./comment-editor";

it("keeps two editors for the same draft in sync", async () => {
  function Twins() {
    const [text, setText] = useState("well");
    const props = {
      value: text,
      onChange: setText,
      onSubmit: () => {},
      disabled: false,
      focused: false,
      placeholder: "",
    };

    return (
      <>
        <CommentEditor {...props} labelledBy="inline" inline />
        <CommentEditor {...props} labelledBy="sidebar" />
      </>
    );
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () => root.render(<Twins />));
    const [inline, sidebar] = [
      ...container.querySelectorAll<HTMLElement>('[role="textbox"]'),
    ];

    await userEvent.click(sidebar!);
    await userEvent.keyboard("{End} done");

    expect(inline!.textContent).toBe("well done");
    expect(sidebar!.textContent).toBe("well done");
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
