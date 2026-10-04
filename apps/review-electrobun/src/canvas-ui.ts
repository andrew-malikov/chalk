import type {
  ReviewCanvasUi,
  ReviewDisposable,
} from "@dev.fast/review-protocol";

export function createCanvasUi(
  parent: () => HTMLElement,
  theme: NonNullable<ReviewCanvasUi["theme"]>,
  onError: (cause: unknown) => void,
): ReviewCanvasUi & ReviewDisposable {
  let currentMenu: ReviewDisposable | undefined;
  const dialogs = new Set<() => void>();

  return {
    theme,
    showMenu(request) {
      currentMenu?.dispose();
      const menu = document.createElement("div");
      menu.className = "review-shell-menu";
      menu.setAttribute("role", "menu");
      menu.popover = "auto";
      let closed = false;

      const finish = () => {
        if (closed) return;
        closed = true;
        currentMenu = undefined;
        menu.remove();
        request.onHide();

        if (request.anchor.isConnected) request.anchor.focus();
      };

      const buttons = request.items.map((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = item.label;
        button.disabled = item.enabled === false;
        button.setAttribute(
          "role",
          item.checked === undefined ? "menuitem" : "menuitemradio",
        );

        if (item.checked !== undefined)
          button.setAttribute("aria-checked", String(item.checked));
        button.addEventListener("click", () => {
          finish();
          void Promise.resolve()
            .then(() => request.onSelect(item.id))
            .catch(onError);
        });
        menu.append(button);

        return button;
      });

      menu.addEventListener("keydown", (event) => {
        const enabled = buttons.filter((button) => !button.disabled);

        const index = enabled.findIndex(
          (button) => button === document.activeElement,
        );

        if (event.key === "Escape") {
          event.preventDefault();
          finish();
        } else if (event.key === "Tab") finish();
        else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          enabled[index]?.click();
        } else if (
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
        ) {
          event.preventDefault();

          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? enabled.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    enabled.length) %
                  enabled.length;

          enabled[next]?.focus();
        }
      });
      menu.addEventListener("toggle", () => {
        if (!menu.matches(":popover-open")) finish();
      });
      parent().append(menu);
      menu.showPopover();
      const box = request.anchor.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(box.left, innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(box.bottom + 4, innerHeight - menu.offsetHeight - 8))}px`;
      (
        buttons.find(
          (button, index) => request.items[index]?.checked && !button.disabled,
        ) ?? buttons.find((button) => !button.disabled)
      )?.focus();
      currentMenu = { dispose: finish };

      return currentMenu;
    },
    confirmDelete(title) {
      return new Promise((resolve) => {
        const previous = document.activeElement;
        const dialog = document.createElement("dialog");
        dialog.className = "review-shell-dialog";
        dialog.setAttribute("aria-label", "Delete review");
        const heading = document.createElement("h2");
        heading.textContent = `Delete ${title}?`;
        const text = document.createElement("p");
        text.textContent = "This removes the review and its saved progress.";

        const cancel = document.createElement("button"),
          remove = document.createElement("button");

        cancel.textContent = "Cancel";
        remove.textContent = "Delete";
        remove.className = "review-shell-destructive";
        let closed = false;

        const finish = (accepted: boolean) => {
          if (closed) return;
          closed = true;
          dialogs.delete(dispose);
          dialog.remove();

          if (previous instanceof HTMLElement && previous.isConnected)
            previous.focus();
          resolve(accepted);
        };

        const dispose = () => finish(false);
        dialogs.add(dispose);
        cancel.onclick = dispose;
        remove.onclick = () => finish(true);
        dialog.addEventListener("cancel", (event) => {
          event.preventDefault();
          dispose();
        });
        dialog.append(heading, text, cancel, remove);
        parent().append(dialog);
        dialog.showModal();
        cancel.focus();
      });
    },
    dispose() {
      currentMenu?.dispose();

      for (const dispose of dialogs) dispose();
    },
  };
}
