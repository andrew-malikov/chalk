import { defineSoftwareModel } from "@canvas/software-map/model";
import {
  type CodePeekProps,
  createReviewDefinitionSession,
} from "@review/documents/authoring";

export function createTestReviewDefinitionSession(
  options: {
    softwareMap?: ReturnType<typeof defineSoftwareModel>;
    validateCodePeek?: (props: CodePeekProps) => Promise<void>;
  } = {},
) {
  const softwareMap =
    options.softwareMap ?? defineSoftwareModel({ systems: {} });

  return createReviewDefinitionSession({
    softwareMap,
    baseSoftwareMap: softwareMap,
    validateCodePeek: options.validateCodePeek ?? (async () => {}),
  });
}
