import { jsonObject, parseJsonText } from "@blackboard/review-protocol";
import type { ReviewSoftwareMapBundle } from "@review/software-map/software-map-bundle";
import {
  hydrateSoftwareModel,
  softwareModelDataSchema,
} from "@review/software-map/software-map-model";

export interface MapResourcePayload {
  side: "base" | "head";
  commit: string;
  json: string;
}

/** The two sides of a presented software map bundle as `map` resources in
 * the shape `LocalReviewData.map` reads back. */
export function mapResourcesFromBundle(
  bundle: ReviewSoftwareMapBundle,
): MapResourcePayload[] {
  const one = (
    side: "base" | "head",
    json: string,
    commit: string,
  ): MapResourcePayload => {
    // The bundle file wraps the model data with its format tag.
    const { format: _format, ...data } = jsonObject(parseJsonText(json)) ?? {};

    const model = hydrateSoftwareModel(softwareModelDataSchema.parse(data));

    return {
      side,
      commit,
      json: JSON.stringify({
        commit,
        side,
        elements: model.elements,
        relationships: model.relationships,
      }),
    };
  };

  return [
    one("base", bundle.baseJson, bundle.baseCommit),
    one("head", bundle.headJson, bundle.headCommit),
  ];
}
