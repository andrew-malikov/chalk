import type { ReviewCliInstallStatus } from "@chalk/review-contracts";

export function cliInstallReady(status?: ReviewCliInstallStatus): boolean {
  return (
    !!status?.shim.installed &&
    (status.shim.onPath || status.shim.profileConfigured)
  );
}
