import { removeAddiOwnedStorageKeys } from '../../../../lib/addi-storage';
/** Auth and Push Keystore cleanup runs through clearDeletedAccountSession/signOutNative. */
export async function clearDeletedAccountLocalData() {
  removeAddiOwnedStorageKeys(window.localStorage);
  removeAddiOwnedStorageKeys(window.sessionStorage);
}
