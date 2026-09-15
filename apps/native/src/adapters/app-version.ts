export function useAppVersion() {
  return { currentAppVersion: '0.1.0-prototype', latestAppVersion: null, updateStatus: 'unknown', isTwa: false, openingStore: false, requestUpdate: async () => {} };
}
