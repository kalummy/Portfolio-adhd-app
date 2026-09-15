import { NATIVE_API_ORIGIN, NATIVE_API_PREFIX, nativeApiPath } from '../../../../lib/native-api/contracts';
import { getNativeClient } from '../auth/client';
import { getNativeAuthSnapshot } from '../auth/runtime';
export async function fetchNativeApi(path: string, init: RequestInit = {}, transport: typeof fetch = fetch) {
  const local = new URL(path, 'https://localhost');
  if (local.origin !== 'https://localhost' || !nativeApiPath(local.pathname)) throw new Error('native_api_denied');
  const owner = getNativeAuthSnapshot().user?.id;
  if (!owner) throw new Error('authentication_required');
  const {data,error} = await getNativeClient().auth.getSession();
  if (error || !data.session || data.session.user.id !== owner) throw new Error('authentication_required');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  const timeout = AbortSignal.timeout(local.pathname === '/api/moods/analyze' ? 120_000 : 35_000);
  const response = await transport(`${NATIVE_API_ORIGIN}${NATIVE_API_PREFIX}${local.pathname.slice(4)}${local.search}`, {
    ...init,headers,credentials:'omit',redirect:'error',cache:'no-store',
    signal:init.signal ? AbortSignal.any([init.signal,timeout]) : timeout,
  });
  if (getNativeAuthSnapshot().user?.id !== owner) throw new Error('account_changed');
  return response;
}
export function installNativeApiFetch(transport: typeof fetch) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
    if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
      const request = new Request(input instanceof Request ? input : url, init);
      const body = ['GET','HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
      return fetchNativeApi(url.pathname + url.search, {
        method:request.method, headers:request.headers, signal:request.signal,
        body:body?.byteLength ? body : undefined,
      },transport);
    }
    return transport(input,init);
  };
}
