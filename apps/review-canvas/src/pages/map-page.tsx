import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canvas/components/ui/popover";
import { Switch } from "@canvas/components/ui/switch";
import { useReviewSession } from "@canvas/host/review-session";
import { cn } from "@canvas/lib/utils";
import { useReview } from "@canvas/review/review-context";
import {
  useReviewPanel,
  useReviewPanelActor,
} from "@canvas/review/review-panel";
import { useReviewDebugSettings } from "@canvas/settings/debug-settings";
import { Choice } from "@canvas/settings/settings-choice";
import type {
  NormalizedSoftwareElement,
  NormalizedSoftwareModel,
} from "@canvas/software-map/model";
import { SoftwareMapTopologyUnavailable } from "@canvas/software-map/software-map-absence";
import { selectActiveSoftwareMapModel } from "@canvas/software-map/software-map-selection";
import { SoftwareMap } from "@canvas/software-map/SoftwareMap";
import { shellStyles } from "@canvas/styles/shell-styles";
import { IconButton } from "@canvas/ui/button";
import { SettingsSlidersIcon } from "@canvas/ui/icons";
import type { SoftwareMapTopologyDiff } from "@review/software-map/software-map-topology-diff";
import { type ReactElement, useMemo, useRef, useState } from "react";

export function MapPage({
  softwareModels,
  repoSoftwareMap,
  baseSoftwareMap,
  softwareMapTopologyDiff,
  showFloatingActions,
}: {
  softwareModels: NormalizedSoftwareModel[];
  repoSoftwareMap: NormalizedSoftwareModel | null;
  baseSoftwareMap: NormalizedSoftwareModel | null;
  softwareMapTopologyDiff: SoftwareMapTopologyDiff | null;
  showFloatingActions: boolean;
}): ReactElement {
  const session = useReviewSession();
  const review = useReview();
  const panelActor = useReviewPanelActor();
  const mapFocus = useReviewPanel((state) => state.context.mapFocus);

  const activeSoftwareMapSource = useMemo(
    () =>
      selectActiveSoftwareMapModel({
        softwareModels,
        focusElementPath: mapFocus?.elementPath,
      }),
    [mapFocus?.elementPath, softwareModels],
  );

  const activeSoftwareMap = useMemo(
    () =>
      applySoftwareMapTopologyStatuses(
        activeSoftwareMapSource,
        softwareMapTopologyDiff,
      ),
    [activeSoftwareMapSource, softwareMapTopologyDiff],
  );

  return (
    <div className={cn("review-map-view", shellStyles.mapView, styles.view)}>
      <div className={cn(shellStyles.mapCanvasShell, styles.canvasShell)}>
        <SoftwareMapTopologyUnavailable
          repoSoftwareMap={repoSoftwareMap}
          baseSoftwareMap={baseSoftwareMap}
          baseRef={review.resolvedBaseRef ?? undefined}
          headRef={review.resolvedHeadRef ?? undefined}
        />
        <SoftwareMap
          model={activeSoftwareMap ?? undefined}
          pinnedData={
            activeSoftwareMapSource
              ? session.softwareMapData?.(activeSoftwareMapSource)
              : undefined
          }
          focusRequest={mapFocus?.pending ? mapFocus : null}
          onFocusRequestHandled={(requestId) =>
            panelActor.send({ type: "consumeMapFocus", requestId })
          }
          height="100%"
          showChrome={false}
          showFloatingActions={showFloatingActions}
          variant="view"
        />
        <MapSettingsControl />
      </div>
    </div>
  );
}

/**
 * Map settings, floating over the map canvas. They used to sit behind a topbar
 * gear that held nothing else, which put map-only controls in front of readers
 * who never open the map.
 */
function MapSettingsControl(): ReactElement {
  const {
    showModifiedOnly,
    setShowModifiedOnly,
    showRemovedNodes,
    setShowRemovedNodes,
    nodeTint,
    setNodeTint,
  } = useReviewDebugSettings();

  const controlRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div ref={controlRef} className="tw:absolute tw:right-4 tw:bottom-4 tw:z-3">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <IconButton
            size="large"
            className="tw:rounded-lg tw:border tw:border-input tw:bg-[var(--tray)] tw:shadow-md"
            aria-label="Map settings"
          >
            <SettingsSlidersIcon />
          </IconButton>
        </PopoverTrigger>
        <PopoverContent
          container={
            controlRef.current?.closest<HTMLElement>(".review-app") ??
            controlRef.current
          }
          align="end"
          side="top"
          aria-label="Map settings"
          className="tw:w-[268px] tw:p-0"
        >
          <DebugSwitch
            label="Show modified nodes only"
            checked={showModifiedOnly}
            onChange={setShowModifiedOnly}
          />
          <DebugSwitch
            label="Show removed nodes"
            checked={showRemovedNodes}
            onChange={setShowRemovedNodes}
          />
          <div className="tw:grid tw:gap-2 tw:p-2.5">
            <span className="tw:text-xs tw:font-semibold tw:text-muted-foreground">
              Map node tint
            </span>
            <Choice
              label="Node tint"
              value={nodeTint}
              labels={{ none: "None", slate: "Slate", mineral: "Mineral" }}
              disabled={false}
              onChange={setNodeTint}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function DebugSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): ReactElement {
  return (
    <div className="tw:flex tw:min-h-[50px] tw:items-center tw:justify-between tw:gap-3.5 tw:border-b tw:border-border tw:px-3 tw:py-2.5 tw:text-[13px]">
      <span>{label}</span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function applySoftwareMapTopologyStatuses(
  model: NormalizedSoftwareModel | undefined,
  diff: SoftwareMapTopologyDiff | null,
): NormalizedSoftwareModel | undefined {
  if (!model || !diff) return model;

  const elements = model.elements.map((element): NormalizedSoftwareElement => {
    const topologyStatus = diff.elementStatusByPath[element.path];

    return topologyStatus
      ? { ...element, changeStatus: topologyStatus }
      : element;
  });

  return {
    ...model,
    elements,
    elementsByPath: new Map(elements.map((element) => [element.path, element])),
  };
}

// Map settings float over the map canvas instead of sitting behind a topbar
// gear, so map-only controls stay with the map.
const styles = {
  view: "tw:bg-[color:var(--bg)]",
  canvasShell:
    "tw:border-[0] tw:border-none tw:border-[color:currentcolor] tw:rounded-none tw:bg-[color:var(--bg)] tw:[box-shadow:none]",
};
