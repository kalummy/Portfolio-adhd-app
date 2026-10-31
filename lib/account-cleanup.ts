/** Client-only cleanup metadata. Never store a user ID, credential, or record here. */
export type CleanupReason = "logout" | "account_deletion";

export type CleanupStep =
  | "analytics"
  | "local_data"
  | "auth"
  | "secure_storage"
  | "push"
  | "drafts"
  | "identity_link"
  | "auth_flow"
  | "recovery";

export type CleanupResult = {
  status: "complete" | "pending";
  failedSteps: readonly CleanupStep[];
};

export type CleanupRecovery = {
  version: 1;
  reason: CleanupReason;
};

// Generic ADDI record cleanup deliberately leaves this non-personal retry hint.
// Only verified completion removes it. A hint never proves server deletion and
// never authorizes another DELETE request.
export const CLEANUP_RECOVERY_KEY = "addi_privacy_cleanup_required_v1";

type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storageOrDefault(storage?: RecoveryStorage): RecoveryStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readCleanupRecovery(storage?: RecoveryStorage): CleanupRecovery | null {
  try {
    const raw = storageOrDefault(storage)?.getItem(CLEANUP_RECOVERY_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (record.version !== 1
      || (record.reason !== "logout" && record.reason !== "account_deletion")) return null;
    return { version: 1, reason: record.reason };
  } catch {
    // An unreadable/corrupt hint does not become authorization or server proof.
    return null;
  }
}

export function writeCleanupRecovery(
  reason: CleanupReason,
  storage?: RecoveryStorage,
): boolean {
  try {
    const target = storageOrDefault(storage);
    if (!target) return false;
    target.setItem(CLEANUP_RECOVERY_KEY, JSON.stringify({ version: 1, reason }));
    return readCleanupRecovery(target)?.reason === reason;
  } catch {
    return false;
  }
}

export function clearCleanupRecovery(storage?: RecoveryStorage): boolean {
  try {
    const target = storageOrDefault(storage);
    if (!target) return false;
    target.removeItem(CLEANUP_RECOVERY_KEY);
    return target.getItem(CLEANUP_RECOVERY_KEY) === null;
  } catch {
    return false;
  }
}
