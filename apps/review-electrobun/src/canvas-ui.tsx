import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@canvas/components/ui/alert-dialog";
import { buttonVariants } from "@canvas/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@canvas/components/ui/dropdown-menu";
import type {
  ReviewCanvasUi,
  ReviewDisposable,
} from "@dev.fast/review-protocol";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

export function createCanvasUi(
  parent: () => HTMLElement,
  theme: NonNullable<ReviewCanvasUi["theme"]>,
  onError: (cause: unknown) => void,
): ReviewCanvasUi & ReviewDisposable {
  let currentMenu: ReviewDisposable | undefined;
  const dialogs = new Set<() => void>();

  // Keep the host's imperative API; React owns the shared shadcn overlays.
  const mount = (content: ReactNode) => {
    const container = document.createElement("div");
    parent().append(container);
    const root = createRoot(container);
    flushSync(() => root.render(content));

    return () => {
      container.remove();
      // A menu selection may dispose its owner during a React event.
      queueMicrotask(() => root.unmount());
    };
  };

  return {
    theme,
    showMenu(request) {
      currentMenu?.dispose();
      const box = request.anchor.getBoundingClientRect();
      let closed = false;
      let unmount = () => {};

      const finish = () => {
        if (closed) return;
        closed = true;
        currentMenu = undefined;
        unmount();
        request.onHide();

        if (request.anchor.isConnected) request.anchor.focus();
      };

      const select = (id: string) => {
        finish();
        void Promise.resolve()
          .then(() => request.onSelect(id))
          .catch(onError);
      };

      unmount = mount(
        <DropdownMenu
          open
          modal={false}
          onOpenChange={(open) => {
            if (!open) finish();
          }}
        >
          <DropdownMenuTrigger
            aria-hidden="true"
            tabIndex={-1}
            className="tw:pointer-events-none tw:fixed tw:opacity-0"
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
            }}
          />
          <DropdownMenuContent
            container={parent()}
            align="start"
            className="tw:min-w-[180px] tw:font-[family-name:var(--chrome-font)]"
            onCloseAutoFocus={(event) => {
              event.preventDefault();

              if (
                !currentMenu &&
                dialogs.size === 0 &&
                request.anchor.isConnected
              )
                request.anchor.focus();
            }}
            onFocus={(event) => {
              if (event.target !== event.currentTarget) return;
              (
                event.currentTarget.querySelector<HTMLElement>(
                  '[aria-checked="true"]:not([data-disabled])',
                ) ??
                event.currentTarget.querySelector<HTMLElement>(
                  '[role^="menuitem"]:not([data-disabled])',
                )
              )?.focus();
            }}
          >
            <DropdownMenuRadioGroup
              value={request.items.find((item) => item.checked)?.id}
            >
              {request.items.map((item) =>
                item.checked === undefined ? (
                  <DropdownMenuItem
                    key={item.id}
                    disabled={item.enabled === false}
                    onSelect={() => select(item.id)}
                  >
                    {item.label}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuRadioItem
                    key={item.id}
                    value={item.id}
                    disabled={item.enabled === false}
                    onSelect={() => select(item.id)}
                  >
                    {item.label}
                  </DropdownMenuRadioItem>
                ),
              )}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>,
      );
      currentMenu = { dispose: finish };

      return currentMenu;
    },
    confirmDelete(title) {
      return new Promise((resolve) => {
        const previous = document.activeElement;
        let closed = false;
        let unmount = () => {};

        const finish = (accepted: boolean) => {
          if (closed) return;
          closed = true;
          dialogs.delete(dispose);
          unmount();

          if (previous instanceof HTMLElement && previous.isConnected)
            previous.focus();
          resolve(accepted);
        };

        const dispose = () => finish(false);
        dialogs.add(dispose);
        unmount = mount(
          <AlertDialog
            open
            onOpenChange={(open) => {
              if (!open) dispose();
            }}
          >
            <AlertDialogContent
              container={parent()}
              className="tw:sm:max-w-[360px]"
              onCloseAutoFocus={(event) => {
                event.preventDefault();

                if (
                  !currentMenu &&
                  dialogs.size === 0 &&
                  previous instanceof HTMLElement &&
                  previous.isConnected
                )
                  previous.focus();
              }}
            >
              <AlertDialogTitle>Delete {title}?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the review and its saved progress.
              </AlertDialogDescription>
              <div className="tw:flex tw:justify-end tw:gap-2">
                <AlertDialogCancel onClick={dispose}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className={buttonVariants({ variant: "destructive" })}
                  onClick={() => finish(true)}
                >
                  Delete
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>,
        );
      });
    },
    dispose() {
      currentMenu?.dispose();

      for (const dispose of dialogs) dispose();
    },
  };
}
