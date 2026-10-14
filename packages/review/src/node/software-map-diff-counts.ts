import {
  type LocalVcsKind,
  diff as readLocalVcsDiff,
} from "@blackboard/local-vcs";
import {
  type SoftwareMapCodeElementInput,
  type SoftwareMapCoverageClaimInput,
  type SoftwareMapDiffLineCount,
  type SoftwareMapUnmappedDiffSummary,
  mapDiffLineCountsToCoverageClaims,
  mapDiffLineCountsToSoftwareMapElements,
  parseGitUnifiedDiffLineCounts,
} from "@review/software-map/software-map-diff-counts";

type SoftwareMapDiffCountsByElementPath = Record<
  string,
  SoftwareMapDiffLineCount
>;

type SoftwareMapUnmappedDiffByElementPath = Record<
  string,
  SoftwareMapUnmappedDiffSummary
>;

interface SoftwareMapDiffCountsResult {
  baseRef?: string;
  headRef?: string;
  countsByElementPath: SoftwareMapDiffCountsByElementPath;
  unmappedByElementPath: SoftwareMapUnmappedDiffByElementPath;
}

interface ResolveSoftwareMapDiffCountsInput {
  /** Already retained source diff, when the source is a working generation. */
  patch?: string;
  sourceRootPath: string;
  /** The source repository's kind, when the caller already detected it. */
  sourceVcsKind?: LocalVcsKind;
  side?: "base" | "head";
  baseRef?: string;
  headRef?: string;
  codeElements: SoftwareMapCodeElementInput[];
  coverageClaims?: SoftwareMapCoverageClaimInput[];
}

export async function resolveSoftwareMapDiffCounts(
  input: ResolveSoftwareMapDiffCountsInput,
): Promise<SoftwareMapDiffCountsResult> {
  const baseRef = input.baseRef?.trim();

  if (!baseRef) {
    return { countsByElementPath: {}, unmappedByElementPath: {} };
  }

  const headRef = input.headRef?.trim() || undefined;
  const sourceRootPath = input.sourceRootPath;

  const diff =
    input.patch ??
    (await readLocalVcsDiff({
      rootPath: sourceRootPath,
      kind: input.sourceVcsKind,
      baseRef,
      headRef,
      contextLines: 0,
    }).catch(() => ""));

  if (!diff.trim()) {
    return {
      baseRef,
      headRef,
      countsByElementPath: {},
      unmappedByElementPath: {},
    };
  }

  const countsByFile = parseGitUnifiedDiffLineCounts(diff, input.side);

  if (countsByFile.size === 0) {
    return {
      baseRef,
      headRef,
      countsByElementPath: {},
      unmappedByElementPath: {},
    };
  }

  const mapped = mapDiffLineCountsToSoftwareMapElements({
    codeElements: input.codeElements,
    countsByFile,
  });

  const unmappedByElementPath = mapDiffLineCountsToCoverageClaims({
    coverageClaims: input.coverageClaims ?? [],
    countsByFile,
  });

  return {
    baseRef,
    headRef,
    countsByElementPath: mapped.countsByElementPath,
    unmappedByElementPath,
  };
}
