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
assert.match(socialRoute, /if \(!user\) redirect\("\/auth\/login\?next=\/my\/social-login"\)/);

assert.doesNotMatch(bottomNavigation, />집중</);
assert.match(
  styles,
  /\.bottom-navigation-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s,
);
assert.doesNotMatch(homeScreen, /home-notification-button/);
assert.match(homeScreen, /setProfileId\(getAddiProfileId\(authState\.user\)\)/);
assert.match(homeScreen, /src=\{getAddiProfileAsset\(profileId\)\}/);
assert.match(homeScreen, /<BottomNavigation activeTab="home" profileId=\{profileId\}/);
assert.doesNotMatch(deleteAccount, /개인정보·기록 보관이 걱정돼요/);
assert.match(deleteAccount, /직접 입력할게요/);

console.log("my-home settings fixtures: PASS");
