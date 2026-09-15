import { Capacitor, registerPlugin } from '@capacitor/core';
import type { SecureStore } from './flow';
interface SecureStoragePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
  clearVerifiers(): Promise<void>;
  clear(): Promise<void>;
}
const plugin = registerPlugin<SecureStoragePlugin>('AddiSecureStorage');
function requireAndroid() {
  if (Capacitor.getPlatform() !== 'android') throw new Error('android_secure_storage_required');
}
export const secureStorage: SecureStore = {
  async getItem(key) { requireAndroid(); return (await plugin.get({ key })).value; },
  async setItem(key, value) { requireAndroid(); await plugin.set({ key, value }); },
  async removeItem(key) { requireAndroid(); await plugin.remove({ key }); },
};
export async function clearVerifiers() { requireAndroid(); await plugin.clearVerifiers(); }
export async function clearNativeStorage() { requireAndroid(); await plugin.clear(); }
