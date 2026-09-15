import { nativePush, PhaseUnavailableError } from './boundaries';
export type CurrentPushState = 'unsupported' | 'default' | 'denied' | 'granted-unsubscribed' | 'subscribed';
export async function getCurrentPushState(): Promise<CurrentPushState> { return 'unsupported'; }
export async function requestPushSubscription(): Promise<{ status: 'subscribed' | 'denied' }> { await nativePush.register(); throw new PhaseUnavailableError(3); }
export const unsubscribeFromPush = () => nativePush.unregister();
export const isPushUnavailableError = (error: unknown) => error instanceof PhaseUnavailableError;
