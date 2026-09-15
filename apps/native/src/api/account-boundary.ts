import { getNativeAuthSnapshot, subscribeNativeAuth } from '../auth/runtime';
// Unsaved web registration drafts must never cross Native account boundaries.
export function startNativeAccountBoundary() {
  let owner = '';
  const clear = () => {
    const next = getNativeAuthSnapshot().user?.id ?? '';
    if (next === owner) return;
    for (const key of ['addi-medication-registration-draft','addi-last-saved-medication-ids','addi-manual-medication-return-href','addi-photo-capture-retry']) sessionStorage.removeItem(key);
    owner = next;
  };
  return subscribeNativeAuth(clear);
}
