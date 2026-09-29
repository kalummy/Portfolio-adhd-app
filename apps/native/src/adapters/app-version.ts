import { useEffect, useState, useCallback } from 'react';
import { App } from '@capacitor/app';
import { registerPlugin } from '@capacitor/core';
export type NativeUpdateState = { supported: boolean; status: 'unsupported' | 'unknown' | 'current' | 'available' };
const play = registerPlugin<{ status():Promise<NativeUpdateState>; open():Promise<void> }>('AddiPlayUpdate');
export function useAppVersion() {
  const [currentAppVersion,setVersion]=useState<string|null>(null);
  const [state,setState]=useState<NativeUpdateState>({supported:false,status:'unknown'});
  const [openingStore,setOpening]=useState(false);
  useEffect(()=>{
    let active=true;
    const refresh=()=>{ setOpening(false); void play.status().then(value=>{if(active)setState(value);}).catch(()=>{if(active)setState({supported:false,status:'unknown'});}); };
    void App.getInfo().then(info=>{if(active)setVersion(info.version);}).catch(()=>undefined);
    refresh(); window.addEventListener('focus',refresh);
    return ()=>{active=false;window.removeEventListener('focus',refresh);};
  },[]);
  const requestUpdate=useCallback(async()=>{
    if(!state.supported||state.status!=='available'||openingStore)return;
    setOpening(true);
    try { await play.open(); } catch { /* fail open; retry remains available */ } finally { setOpening(false); }
  },[state,openingStore]);
  // Existing My UI's isTwa flag means "show store update" here; no TWA runtime is loaded.
  return {currentAppVersion,latestAppVersion:'최신',updateStatus:state.status==='available'?'available':'current',isTwa:state.supported&&state.status==='available',openingStore,requestUpdate};
}
