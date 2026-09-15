import { registerPlugin } from "@capacitor/core";
import type {
  Preferences,
  RegistrationRequest,
} from "../../../../lib/native-push/contracts";
export type PushState = RegistrationRequest & {
  owner: string;
  active: boolean;
};
export const pushBridge = registerPlugin<{
  snapshot(): Promise<PushState>;
  prepare(input: {
    owner: string;
    preferences?: Preferences;
  }): Promise<PushState>;
  acknowledge(input: {
    revision: number;
    bindingId: string;
  }): Promise<{ accepted: boolean }>;
  clearBinding(): Promise<void>;
  deleteToken(): Promise<void>;
  waitForTokenDeletion(): Promise<void>;
  storeToken(input: { token: string }): Promise<void>;
  takeTap(): Promise<{ route: string }>;
  addListener(
    event: "tap",
    fn: () => void,
  ): Promise<{ remove(): Promise<void> }>;
}>("AddiNativePush");
// Token deletion cannot delay clearing the Auth session when offline. New token
// acquisition waits for this task so it cannot race an old account's deletion.
export const waitForTokenDeletion = () => pushBridge.waitForTokenDeletion();
export async function clearNativePushBinding() {
  await pushBridge.clearBinding();
  void pushBridge.deleteToken().catch(() => undefined);
}
