import type { ReviewCliInstallStatus } from "@blackboard/review-contracts";

export function cliInstallReady(status?: ReviewCliInstallStatus): boolean {
  return (
    !!status?.shim.installed &&
    (status.shim.onPath || status.shim.profileConfigured)
  );
}
