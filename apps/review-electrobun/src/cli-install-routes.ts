import {
  type ReviewCliInstallApplyResponse,
  type ReviewDesktopDiscovery,
  parseReviewCliInstallApplyRequest,
} from "@chalk/review-contracts";
import {
  type ReviewHonoEnv,
  readBoundedRequestJson,
} from "@chalk/server/hono-http";
import { serverJson } from "@chalk/server/review-server-core";
import {
  applyCliInstall,
  declineCliInstall,
  finishCliInstallUpdate,
  removeCliInstall,
  resetCliInstall,
  resolveCliInstallStatus,
  skipCliInstall,
} from "@review/node/cli-install";
import type { Hono } from "hono";

export function mountCliInstallRoutes(
  app: Hono<ReviewHonoEnv>,
  discovery: ReviewDesktopDiscovery,
  cliPackageRoot: string,
): void {
  app.get("/install/status", async () =>
    serverJson(
      200,
      await resolveCliInstallStatus({ packageRoot: cliPackageRoot }),
    ),
  );
  app.post("/install/apply", async (context) => {
    const request = parseReviewCliInstallApplyRequest(
      await readBoundedRequestJson(context.req.raw),
    );

    const applyInput: Parameters<typeof applyCliInstall>[0] = {
      packageRoot: cliPackageRoot,
    };

    if (request.shim !== undefined) applyInput.shim = request.shim;

    if (request.autoUpdate) applyInput.autoUpdate = true;

    if (discovery.cliPath) applyInput.cliPath = discovery.cliPath;

    if (discovery.cliRuntimePath) {
      applyInput.cliRuntimePath = discovery.cliRuntimePath;
    }

    const result = await applyCliInstall(applyInput);

    const body: ReviewCliInstallApplyResponse = {
      ok: result.code === 0,
      output: result.output,
    };

    if (result.shimPath) body.shimPath = result.shimPath;

    return serverJson(result.code === 0 ? 200 : 500, body);
  });
  app.post("/install/remove", async (context) => {
    const request = parseReviewCliInstallApplyRequest(
      await readBoundedRequestJson(context.req.raw),
    );

    const removeInput: Parameters<typeof removeCliInstall>[0] = {};

    if (request.shim) removeInput.shim = true;

    const result = await removeCliInstall(removeInput);

    return serverJson(200, { ok: true, output: result.output });
  });
  app.post("/install/finish-update", async () => {
    await finishCliInstallUpdate();

    return serverJson(200, { ok: true });
  });
  app.post("/install/decline", async () => {
    await declineCliInstall();

    return serverJson(200, { ok: true });
  });
  app.post("/install/skip", async () => {
    await skipCliInstall();

    return serverJson(200, { ok: true });
  });
  app.post("/install/reset", async () => {
    await resetCliInstall();

    return serverJson(200, { ok: true });
  });
}
