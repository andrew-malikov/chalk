import { Button } from "@canvas/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@canvas/components/ui/command";
import { NativeSelect } from "@canvas/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canvas/components/ui/popover";
import { Switch } from "@canvas/components/ui/switch";
import {
  CODE_THEMES,
  codeFontFeatures,
  codeTheme,
  codeThemeMode,
  diffsAppearance,
  fontFamilyValue,
} from "@canvas/diff/code-appearance";
import {
  REVIEW_CODE_SIZES,
  type ReviewCodeSize,
  type ReviewTheme,
} from "@chalk/review-contracts";
import { MultiFileDiff } from "@pierre/diffs/react";
import { ChevronDownIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { ShellPreferences } from "./rpc";

type Fonts = Pick<ShellPreferences, "uiFont" | "codeFont" | "codeLigatures">;

/** Publishes the chosen fonts as the variables the canvas stylesheet reads. */
export function applyFonts(root: HTMLElement, fonts: Fonts) {
  const set = (name: string, family: string | null) =>
    family
      ? root.style.setProperty(name, fontFamilyValue(family))
      : root.style.removeProperty(name);

  set("--ui-font", fonts.uiFont);
  set("--code-font", fonts.codeFont);
  root.style.setProperty(
    "--diffs-font-features",
    codeFontFeatures(fonts.codeFont, fonts.codeLigatures),
  );
}

let installed: Promise<string[]> | undefined;

// queryLocalFonts needs a user gesture, so the first picker click asks for it.
function installedFamilies(): Promise<string[]> {
  // SAFETY: Local Font Access is Chromium-only and absent from lib.dom; the
  // optional member covers runtimes without it.
  const query = (
    window as { queryLocalFonts?: () => Promise<{ family: string }[]> }
  ).queryLocalFonts;

  installed ??= (query ? query() : Promise.resolve([])).then(
    (fonts) =>
      [...new Set(fonts.map((font) => font.family))].sort((a, b) =>
        a.localeCompare(b),
      ),
    () => {
      installed = undefined;

      return [];
    },
  );

  return installed;
}

const probe = document.createElement("canvas").getContext("2d");

// Fonts carry no monospace flag; equal widths for narrow and wide glyphs mark one.
function isMonospace(family: string): boolean {
  if (!probe) return true;
  probe.font = `16px ${fontFamilyValue(family)}, serif`;

  return (
    probe.measureText("iiiiiiii").width === probe.measureText("MMMMMMMM").width
  );
}

function FontPicker({
  id,
  value,
  bundled,
  monospace,
  container,
  onChange,
}: {
  id: string;
  value: string | null;
  bundled: string;
  monospace?: boolean;
  container: HTMLElement | null;
  onChange(family: string | null): void;
}) {
  const [open, setOpen] = useState(false);
  const [families, setFamilies] = useState<string[]>();

  const pick = (family: string | null) => {
    setOpen(false);
    onChange(family);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);

        if (next && !families)
          void installedFamilies().then((list) =>
            setFamilies(monospace ? list.filter(isMonospace) : list),
          );
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className="tw:w-[200px] tw:justify-between tw:font-normal"
          style={{ fontFamily: fontFamilyValue(value ?? bundled) }}
        >
          <span className="tw:truncate">{value ?? bundled}</span>
          <ChevronDownIcon aria-hidden="true" className="tw:opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        container={container}
        align="end"
        // The picker lives inside the Settings dialog, which stacks above popovers.
        className="tw:z-[calc(var(--tw-z-index-dialog)+1)]! tw:w-[260px] tw:p-0"
      >
        <Command>
          <CommandInput placeholder="Search fonts" />
          <CommandList>
            <CommandEmpty>
              {families ? "No fonts found." : "Loading fonts…"}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={`${bundled} (bundled)`}
                style={{ fontFamily: fontFamilyValue(bundled) }}
                onSelect={() => pick(null)}
              >
                {bundled} (bundled)
              </CommandItem>
              {families?.map((family) => (
                <CommandItem
                  key={family}
                  value={family}
                  style={{ fontFamily: fontFamilyValue(family) }}
                  onSelect={() => pick(family)}
                >
                  {family}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Row({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="tw:flex tw:items-center tw:justify-between tw:gap-4">
      <div className="tw:grid tw:gap-0.5">
        <label htmlFor={id}>{title}</label>
        {hint && (
          <span className="tw:text-xs tw:text-muted-foreground">{hint}</span>
        )}
      </div>
      <div className="tw:flex tw:items-center tw:gap-2">{children}</div>
    </div>
  );
}

const PREVIEW_BEFORE = `export function greet(name: string) {
  return \`Hello, \${name}!\`;
}
`;

const PREVIEW_AFTER = `export function greet(name: string | null) {
  const shown = name?.trim() || "world";
  return shown !== "world" ? \`Hello, \${shown}!\` : "Hi => 0x1f";
}
`;

export function AppearanceSettings({
  preferences,
  mode,
  container,
  save,
}: {
  preferences: ShellPreferences;
  mode: ReviewTheme;
  container: HTMLElement | null;
  save(patch: Partial<ShellPreferences>): void;
}) {
  const pinned = codeThemeMode(preferences.codeTheme);
  const theme = codeTheme(preferences.codeTheme);

  const appearance = diffsAppearance(
    mode,
    preferences.codeTheme,
    preferences.codeSize,
  );

  return (
    <section>
      <h3>Appearance</h3>
      <Row
        id="shell-appearance"
        title="Theme"
        hint={
          pinned ? `${theme.label} has only a ${pinned} variant.` : undefined
        }
      >
        <NativeSelect
          id="shell-appearance"
          value={pinned ?? preferences.theme}
          disabled={pinned !== null}
          onChange={(event) => {
            // SAFETY: the options below contain only supported themes.
            save({ theme: event.target.value as ShellPreferences["theme"] });
          }}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </NativeSelect>
      </Row>
      <Row
        id="shell-code-theme"
        title="Code theme"
        hint="Syntax colors in diffs and code blocks."
      >
        <NativeSelect
          id="shell-code-theme"
          value={theme.id}
          onChange={(event) => save({ codeTheme: event.target.value })}
        >
          {CODE_THEMES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
              {option.dark && option.light
                ? ""
                : option.dark
                  ? " (dark only)"
                  : " (light only)"}
            </option>
          ))}
        </NativeSelect>
      </Row>
      <Row
        id="shell-ui-font"
        title="Interface font"
        hint="Everything outside code."
      >
        <FontPicker
          id="shell-ui-font"
          value={preferences.uiFont}
          bundled="Fira Sans"
          container={container}
          onChange={(uiFont) => save({ uiFont })}
        />
      </Row>
      <Row
        id="shell-code-font"
        title="Code font"
        hint="Diffs, code blocks and inline code."
      >
        <FontPicker
          id="shell-code-font"
          value={preferences.codeFont}
          bundled="MonaspiceAr Nerd Font Mono"
          monospace
          container={container}
          onChange={(codeFont) => save({ codeFont })}
        />
        <NativeSelect
          aria-label="Code font size"
          className="tw:min-w-[84px]!"
          value={preferences.codeSize}
          onChange={(event) =>
            // SAFETY: the options below contain only supported sizes.
            save({ codeSize: Number(event.target.value) as ReviewCodeSize })
          }
        >
          {REVIEW_CODE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} px
            </option>
          ))}
        </NativeSelect>
      </Row>
      <Row
        id="shell-code-ligatures"
        title="Ligatures"
        hint="Join symbols such as => and !== in code."
      >
        <Switch
          id="shell-code-ligatures"
          checked={preferences.codeLigatures}
          onCheckedChange={(codeLigatures) => save({ codeLigatures })}
        />
      </Row>
      <div className="tw:overflow-hidden tw:rounded-md tw:border tw:border-border">
        <MultiFileDiff
          oldFile={{ name: "greeting.ts", contents: PREVIEW_BEFORE }}
          newFile={{ name: "greeting.ts", contents: PREVIEW_AFTER }}
          options={{
            ...appearance.options,
            diffStyle: "unified",
            disableFileHeader: true,
            hunkSeparators: "line-info",
            preferredHighlighter: "shiki-js",
            overflow: "scroll",
          }}
        />
      </div>
    </section>
  );
}
