import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ADDI_PROFILE_IDS,
  DEFAULT_ADDI_PROFILE_ID,
  getAddiProfileAsset,
  getAddiProfileId,
  isAddiProfileId,
} from "../lib/profile.ts";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

assert.deepEqual(ADDI_PROFILE_IDS, ["calico", "hedgehog", "duck", "rabbit"]);
assert.equal(isAddiProfileId("duck"), true);
assert.equal(isAddiProfileId("cat"), false);
assert.equal(getAddiProfileId(null), DEFAULT_ADDI_PROFILE_ID);
assert.equal(
  getAddiProfileId({ user_metadata: { addi_profile: "rabbit" } }),
  "rabbit",
);
assert.equal(getAddiProfileAsset("hedgehog"), "/profile/profile-hedgehog.svg");

const [styles, authClient, bottomNavigation, homeScreen, myHome, deleteAccount, socialRoute] =
  await Promise.all([
    readSource("app/globals.css"),
    readSource("lib/auth/client.ts"),
    readSource("components/bottom-navigation.tsx"),
    readSource("components/home-screen.tsx"),
    readSource("components/my-home-screen.tsx"),
    readSource("components/my-home-delete-account.tsx"),
    readSource("app/my/social-login/page.tsx"),
  ]);

assert.match(authClient, /auth\.updateUser\(/);
assert.match(authClient, /auth\.getUserIdentities\(/);
assert.match(authClient, /auth\.linkIdentity\(/);
assert.match(authClient, /auth\.unlinkIdentity\(/);
assert.match(authClient, /identities\.length <= 1/);
assert.match(myHome, /href="\/my\/social-login"/);
assert.match(myHome, /updateAddiProfile\(candidateProfileId\)/);
assert.match(myHome, /PROFILE_SHEET_CLOSE_DURATION_MS = 240/);
assert.match(myHome, /PROFILE_SHEET_DRAG_DISMISS_RATIO = 0\.28/);
assert.match(myHome, /PROFILE_SHEET_FLICK_DISMISS_VELOCITY = 0\.8/);
assert.match(myHome, /requestAnimationFrame\(\(\) => setProfileEntered\(true\)\)/);
assert.match(myHome, /className="my-home-sheet-dimmed"/);
assert.match(myHome, /onClick={closeProfileSheet}/);
assert.match(myHome, /className="cancel" onClick={closeProfileSheet}/);
assert.match(myHome, /dragHandle\.addEventListener\("pointerdown", handlePointerDown\)/);
assert.match(myHome, /window\.addEventListener\("pointermove", handlePointerMove/);
assert.match(myHome, /window\.addEventListener\("pointercancel", handlePointerCancel\)/);
assert.match(myHome, /finishProfileDrag\("pointer", event\.pointerId, cancelled\)/);
assert.match(myHome, /!cancelled && \(dismissByDistance \|\| dismissByFlick\)/);
assert.match(myHome, /setProfileDragOffset\(0\)/);
assert.match(myHome, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
assert.match(myHome, /if \(reducedMotionRef\.current\) \{[\s\S]*?finish\(\)/);
assert.match(myHome, /pointerEvents: profileClosing \? "none" : undefined/);
assert.match(myHome, /document\.body\.style\.overflow = "hidden"/);
assert.match(myHome, /event\.key !== "Tab"/);
assert.match(styles, /\.my-home-sheet-drag-handle\s*\{[^}]*touch-action: none/s);
assert.match(styles, /prefers-reduced-motion[\s\S]*?\.my-home-sheet-dimmed/);
assert.match(styles, /prefers-reduced-motion[\s\S]*?\.my-home-profile-sheet/);
assert.match(socialRoute, /if \(!user\) redirect\("\/auth\/login\?next=\/my\/social-login"\)/);

assert.doesNotMatch(bottomNavigation, />집중</);
assert.match(
  styles,
  /\.bottom-navigation-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s,
);
assert.doesNotMatch(homeScreen, /home-notification-button/);
assert.match(homeScreen, /setProfileId\(getAddiProfileId\(authState\.user\)\)/);
assert.match(homeScreen, /src=\{getAddiProfileAsset\(profileId\)\}/);
assert.match(homeScreen, /<BottomNavigation activeTab="home" profileId=\{profileId\}/);
assert.doesNotMatch(deleteAccount, /개인정보·기록 보관이 걱정돼요/);
assert.match(deleteAccount, /직접 입력할게요/);

console.log("my-home settings fixtures: PASS");
