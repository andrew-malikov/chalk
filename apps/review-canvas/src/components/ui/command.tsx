"use client";

import { cn } from "@canvas/lib/utils";
import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "tw:flex tw:h-full tw:w-full tw:flex-col tw:overflow-hidden tw:rounded-md tw:bg-background tw:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandDialog({
  title = "Command palette",
  description = "Search for a command to run…",
  children,
  container,
  filter,
  ...props
}: React.ComponentProps<typeof Dialog> &
  Pick<React.ComponentProps<typeof CommandPrimitive>, "filter"> & {
    title?: string;
    description?: string;
    container?: HTMLElement | null;
  }) {
  const previousFocus = React.useRef<Element | null>(null);

  return (
    <Dialog {...props}>
      <DialogContent
        container={container}
        className="tw:top-[20%] tw:translate-y-0 tw:gap-0 tw:overflow-hidden tw:p-0"
        showCloseButton={false}
        // Without a DialogTrigger, Radix would drop focus to the body on close.
        onOpenAutoFocus={() => {
          previousFocus.current = document.activeElement;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const previous = previousFocus.current;

          if (previous instanceof HTMLElement && previous.isConnected)
            previous.focus();
        }}
      >
        <DialogHeader className="tw:sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Command
          filter={filter}
          className="tw:[&_[cmdk-group-heading]]:px-2 tw:[&_[cmdk-group-heading]]:py-1.5 tw:[&_[cmdk-group-heading]]:text-xs tw:[&_[cmdk-group-heading]]:font-medium tw:[&_[cmdk-group-heading]]:text-muted-foreground tw:[&_[cmdk-item]]:px-2 tw:[&_[cmdk-item]]:py-2"
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="tw:flex tw:h-11 tw:items-center tw:gap-2 tw:border-b tw:border-border tw:px-3 tw:text-muted-foreground tw:[&_svg]:size-4 tw:[&_svg]:flex-none"
    >
      <SearchIcon aria-hidden="true" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "tw:flex tw:h-10 tw:w-full tw:bg-transparent tw:py-3 tw:text-sm tw:text-foreground tw:outline-hidden tw:placeholder:text-muted-foreground tw:disabled:cursor-not-allowed tw:disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "tw:max-h-[min(360px,60vh)] tw:scroll-py-1 tw:overflow-x-hidden tw:overflow-y-auto tw:p-1 tw:[scrollbar-width:thin]",
        className,
      )}
      {...props}
    />
  );
}

function CommandEmpty(
  props: React.ComponentProps<typeof CommandPrimitive.Empty>,
) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="tw:py-6 tw:text-center tw:text-sm tw:text-muted-foreground"
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn("tw:overflow-hidden tw:p-1", className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "tw:relative tw:flex tw:cursor-default tw:items-center tw:gap-2 tw:rounded-sm tw:text-sm tw:outline-hidden tw:select-none tw:data-[disabled=true]:pointer-events-none tw:data-[disabled=true]:opacity-50 tw:data-[selected=true]:bg-muted tw:data-[selected=true]:text-foreground tw:[&_svg]:pointer-events-none tw:[&_svg]:shrink-0 tw:[&_svg:not([class*='size-'])]:size-4 tw:[&_svg]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
};
