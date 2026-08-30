"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { VisitDialog } from "@/components/visit-dialog";
import {
  APP_VERSION_POLICY,
  CURRENT_APP_VERSION,
  PLAY_STORE_URL,
  TWA_VERSION_SESSION_KEY,
  applyQaVersionPolicy,
  getAppUpdateStatus,
  isAppVersionQaHost,
  loadAppVersionPolicy,
  resolveTwaRuntimeContext,
  type AppUpdateStatus,
} from "@/lib/app-version";

type AppVersionContextValue = {
  currentAppVersion: string;
  latestAppVersion: string;
  updateStatus: AppUpdateStatus;
  isTwa: boolean;
  openingStore: boolean;
  requestUpdate: () => void;
};

const AppVersionContext = createContext<AppVersionContextValue>({
  currentAppVersion: CURRENT_APP_VERSION,
  latestAppVersion: APP_VERSION_POLICY.latestAppVersion,
  updateStatus: "current",
  isTwa: false,
  openingStore: false,
  requestUpdate: () => undefined,
});

export function AppVersionProvider({ children }: { children: ReactNode }) {
  const [currentAppVersion, setCurrentAppVersion] = useState(CURRENT_APP_VERSION);
  const [latestAppVersion, setLatestAppVersion] = useState(APP_VERSION_POLICY.latestAppVersion);
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus>("current");
  const [isTwa, setIsTwa] = useState(false);
  const [openingStore, setOpeningStore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let storedVersion: string | null = null;
    try {
      storedVersion = window.sessionStorage.getItem(TWA_VERSION_SESSION_KEY);
    } catch {
      // Version detection remains fail-open when browser storage is unavailable.
    }

    const runtime = resolveTwaRuntimeContext(window.location.search, storedVersion);
    setIsTwa(runtime.isTwa);
    setCurrentAppVersion(runtime.currentAppVersion);

    if (!runtime.isTwa) return;

    if (runtime.cameFromLaunchQuery) {
      try {
        window.sessionStorage.setItem(TWA_VERSION_SESSION_KEY, runtime.currentAppVersion);
      } catch {
        // The launch query remains sufficient for the current page when storage is unavailable.
      }
    }

    const searchParams = new URLSearchParams(window.location.search);
    const simulateNetworkFailure = isAppVersionQaHost(window.location.hostname)
      && searchParams.get("addi_qa_policy") === "network-error";

    void (async () => {
      const loadedPolicy = simulateNetworkFailure ? null : await loadAppVersionPolicy();
      if (cancelled || !loadedPolicy) return;
      const policy = applyQaVersionPolicy(
        loadedPolicy,
        window.location.search,
        window.location.hostname,
      );
      setLatestAppVersion(policy.latestAppVersion);
      setUpdateStatus(getAppUpdateStatus(runtime.currentAppVersion, policy));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (updateStatus !== "required") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [updateStatus]);

  useEffect(() => {
    const resetOpeningStore = () => setOpeningStore(false);
    window.addEventListener("pageshow", resetOpeningStore);
    return () => window.removeEventListener("pageshow", resetOpeningStore);
  }, []);

  const requestUpdate = useCallback(() => {
    if (!isTwa || openingStore) return;
    setOpeningStore(true);
    try {
      window.location.assign(PLAY_STORE_URL);
      window.setTimeout(() => setOpeningStore(false), 1500);
    } catch {
      setOpeningStore(false);
    }
  }, [isTwa, openingStore]);

  const value = useMemo<AppVersionContextValue>(() => ({
    currentAppVersion,
    latestAppVersion,
    updateStatus,
    isTwa,
    openingStore,
    requestUpdate,
  }), [currentAppVersion, isTwa, latestAppVersion, openingStore, requestUpdate, updateStatus]);

  return (
    <AppVersionContext.Provider value={value}>
      {children}
      {isTwa && updateStatus === "required" ? (
        <VisitDialog
          title="새로운 버전이 나왔어요"
          description="더 안정적으로 아디를 이용할 수 있도록 업데이트해 주세요."
          confirmLabel="업데이트"
          onConfirm={requestUpdate}
          busy={openingStore}
          className="app-update-dialog"
          layerClassName="app-update-dialog-layer"
        />
      ) : null}
    </AppVersionContext.Provider>
  );
}

export function useAppVersion() {
  return useContext(AppVersionContext);
}
