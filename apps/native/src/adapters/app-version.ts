import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
export function useAppVersion() {
  const [currentAppVersion,setVersion] = useState<string | null>(null);
  useEffect(() => { let active = true; void App.getInfo().then(info => { if (active) setVersion(info.version); }).catch(() => undefined); return () => { active = false; }; },[]);
  return { currentAppVersion,latestAppVersion:null,updateStatus:'unknown',isTwa:false,openingStore:false,requestUpdate:async () => {} };
}
