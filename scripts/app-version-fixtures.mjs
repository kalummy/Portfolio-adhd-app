import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ANDROID_PACKAGE_ID,
  APP_VERSION_POLICY,
  CURRENT_APP_VERSION,
  PLAY_STORE_URL,
  applyQaVersionPolicy,
  getAppUpdateStatus,
  loadAppVersionPolicy,
  resolveTwaRuntimeContext,
} from "../lib/app-version.ts";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

assert.equal(CURRENT_APP_VERSION, "1.0.0");
assert.deepEqual(APP_VERSION_POLICY, {
  currentAppVersion: "1.0.0",
  minimumSupportedAppVersion: "1.0.0",
  latestAppVersion: "1.0.0",
});
assert.equal(ANDROID_PACKAGE_ID, "com.addi.app");
assert.equal(
  PLAY_STORE_URL,
  "https://play.google.com/store/apps/details?id=com.addi.app",
);

assert.equal(getAppUpdateStatus("1.0.0", APP_VERSION_POLICY), "current");
assert.equal(getAppUpdateStatus("1.1.0", APP_VERSION_POLICY), "current");
assert.equal(getAppUpdateStatus("1.0.0", {
  ...APP_VERSION_POLICY,
  latestAppVersion: "1.1.0",
}), "optional");
assert.equal(getAppUpdateStatus("0.9.0", APP_VERSION_POLICY), "required");
assert.equal(getAppUpdateStatus("not-a-version", APP_VERSION_POLICY), "current");
assert.equal(getAppUpdateStatus("1.0.0", {
  ...APP_VERSION_POLICY,
  minimumSupportedAppVersion: "2.0.0",
  latestAppVersion: "1.0.0",
}), "current");

assert.deepEqual(
  resolveTwaRuntimeContext("?addi_platform=android-twa&addi_version=1.0.0", null),
  { isTwa: true, currentAppVersion: "1.0.0", cameFromLaunchQuery: true },
);
assert.deepEqual(
  resolveTwaRuntimeContext("", "0.9.0"),
  { isTwa: true, currentAppVersion: "0.9.0", cameFromLaunchQuery: false },
);
assert.deepEqual(
  resolveTwaRuntimeContext("", null),
  { isTwa: false, currentAppVersion: "1.0.0", cameFromLaunchQuery: false },
);

assert.deepEqual(
  applyQaVersionPolicy(
    APP_VERSION_POLICY,
    "?addi_qa_min=1.0.0&addi_qa_latest=1.1.0",
    "localhost",
  ),
  { ...APP_VERSION_POLICY, latestAppVersion: "1.1.0" },
);
assert.deepEqual(
  applyQaVersionPolicy(
    APP_VERSION_POLICY,
    "?addi_qa_min=1.0.0&addi_qa_latest=9.9.9",
    "addi-gamma.vercel.app",
  ),
  APP_VERSION_POLICY,
);

assert.equal(await loadAppVersionPolicy(async () => {
  throw new Error("network unavailable");
}), null);
assert.equal(await loadAppVersionPolicy(async () => new Response("unavailable", { status: 503 })), null);
assert.equal(await loadAppVersionPolicy(async () => Response.json({ invalid: true })), null);

const [provider, myHome, dialog, routes, routeHandler, layout, styles] = await Promise.all([
  readSource("components/app-version-provider.tsx"),
  readSource("components/my-home-screen.tsx"),
  readSource("components/visit-dialog.tsx"),
  readSource("lib/auth/routes.ts"),
  readSource("app/api/app-version/route.ts"),
  readSource("app/layout.tsx"),
  readSource("app/globals.css"),
]);

assert.match(provider, /updateStatus === "required"/);
assert.match(provider, /confirmLabel="업데이트"/);
assert.doesNotMatch(provider, /cancelLabel=/);
assert.match(provider, /window\.location\.assign\(PLAY_STORE_URL\)/);
assert.match(myHome, /아디 버전/);
assert.match(myHome, /최신 버전 업데이트가 필요합니다\./);
assert.match(myHome, /isTwa && updateStatus !== "current"/);
assert.match(dialog, /role="alertdialog"/);
assert.match(dialog, /cancelLabel && onCancel/);
assert.match(routes, /"\/api\/app-version"/);
assert.match(routeHandler, /"Cache-Control": "no-store, max-age=0"/);
assert.match(layout, /<AppVersionProvider>/);
assert.match(styles, /\.my-home-version-row/);
assert.match(styles, /\.app-update-dialog/);

console.log("app version fixtures: PASS");
