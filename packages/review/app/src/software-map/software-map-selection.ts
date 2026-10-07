import type { NormalizedSoftwareModel } from "./model";

export function selectActiveSoftwareMapModel({
  softwareModels,
  focusElementPath,
}: {
  softwareModels: readonly NormalizedSoftwareModel[];
  focusElementPath?: string;
}): NormalizedSoftwareModel | undefined {
  if (focusElementPath) {
    const focusedModel = softwareModels.find((model) =>
      model.elementsByPath.has(focusElementPath),
    );

    if (focusedModel) return focusedModel;
  }

  return softwareModels[0];
}
