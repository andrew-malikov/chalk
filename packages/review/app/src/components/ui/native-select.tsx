import { cn } from "@canvas/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import * as React from "react";

function NativeSelect({
  className,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & { size?: "sm" | "default" }) {
  return (
    <div
      className="tw:group/native-select tw:relative tw:w-fit tw:has-[select:disabled]:opacity-50"
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          "tw:h-9 tw:w-full tw:min-w-0 tw:appearance-none tw:rounded-md tw:border tw:border-input tw:bg-transparent tw:px-3 tw:py-2 tw:pr-9 tw:text-sm tw:shadow-xs tw:transition-[color,box-shadow] tw:outline-none tw:selection:bg-primary tw:selection:text-primary-foreground tw:placeholder:text-muted-foreground tw:disabled:pointer-events-none tw:disabled:cursor-not-allowed tw:data-[size=sm]:h-8 tw:data-[size=sm]:py-1 tw:dark:bg-input/30 tw:dark:hover:bg-input/50",
          "tw:focus-visible:border-ring tw:focus-visible:ring-[3px] tw:focus-visible:ring-ring/50",
          "tw:aria-invalid:border-destructive tw:aria-invalid:ring-destructive/20 tw:dark:aria-invalid:ring-destructive/40",
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:right-3.5 tw:size-4 tw:-translate-y-1/2 tw:text-muted-foreground tw:opacity-50 tw:select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  );
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("tw:bg-[Canvas] tw:text-[CanvasText]", className)}
      {...props}
    />
  );
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("tw:bg-[Canvas] tw:text-[CanvasText]", className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
