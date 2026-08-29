export type StorageKeySource = {
  key: (index: number) => string | null;
  length: number;
  removeItem: (key: string) => void;
};

export function isAddiOwnedStorageKey(key: string) {
  return key.startsWith("addi:") || key.startsWith("addi-");
}

export function removeAddiOwnedStorageKeys(storage: StorageKeySource) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key && isAddiOwnedStorageKey(key)));
  keys.forEach((key) => storage.removeItem(key));
  return keys;
}
