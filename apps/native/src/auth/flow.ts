export type Provider = 'google' | 'kakao';
export type Attempt = { id: string; flowId: string; provider: Provider; createdAt: number };
export interface SecureStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export const ATTEMPT_KEY = 'addi-native-attempt';
export const ATTEMPT_TTL = 5 * 60_000;
export class AuthFlowError extends Error {
  constructor(public readonly reason: 'invalid_callback' | 'expired' | 'no_attempt' | 'cancelled' | 'exchange' | 'busy') { super(reason); }
}
export function callbackCode(raw: string, expected: string, attempt: Attempt, now: number) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new AuthFlowError('invalid_callback'); }
  const base = new URL(expected);
  const allowed = new Set(['attempt', 'code', 'error', 'error_code', 'error_description']);
  if (url.origin !== base.origin || url.pathname !== base.pathname || url.username || url.password || url.hash
    || [...url.searchParams.keys()].some(key => !allowed.has(key) || url.searchParams.getAll(key).length !== 1)
    || url.searchParams.get('attempt') !== attempt.id) throw new AuthFlowError('invalid_callback');
  if (now < attempt.createdAt || now - attempt.createdAt >= ATTEMPT_TTL) throw new AuthFlowError('expired');
  if (url.searchParams.has('error')) throw new AuthFlowError('cancelled');
  const code = url.searchParams.get('code');
  if (!code || code.length > 2048 || /\s/.test(code)) throw new AuthFlowError('invalid_callback');
  return code;
}
/** All mutations run in order. A callback is consumed durably BEFORE exchange. */
export class NativeAuthFlow {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private deps: {
    store: SecureStore; callback: string; now: () => number; random: () => string;
    authorize: (provider: Provider, redirect: string) => Promise<{ url: string; flowId: string }>;
    open: (url: string) => Promise<void>;
    exchange: (code: string, flowId: string) => Promise<void>;
    clearVerifier: () => Promise<void>;
  }) {}
  serial<T>(run: () => Promise<T>): Promise<T> {
    const task = this.queue.then(run, run);
    this.queue = task.catch(() => undefined);
    return task;
  }
  start(provider: Provider) {
    return this.serial(async () => {
      if (provider !== 'google' && provider !== 'kakao') throw new AuthFlowError('invalid_callback');
      const old = await this.pending();
      if (old && this.deps.now() - old.createdAt < ATTEMPT_TTL) throw new AuthFlowError('busy');
      await this.clear();
      const id = this.deps.random();
      const redirect = new URL(this.deps.callback);
      redirect.searchParams.set('attempt', id);
      try {
        const result = await this.deps.authorize(provider, redirect.href);
        await this.deps.store.setItem(ATTEMPT_KEY, JSON.stringify({ id, provider, flowId: result.flowId, createdAt: this.deps.now() }));
        await this.deps.open(result.url);
      } catch (error) { await this.clear(); throw error; }
    });
  }
  async pending(): Promise<Attempt | null> {
    const value = await this.deps.store.getItem(ATTEMPT_KEY);
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as Attempt;
      if (!/^[a-f0-9]{64}$/.test(parsed.id) || !/^[a-f0-9]{32}$/.test(parsed.flowId)
        || !['google', 'kakao'].includes(parsed.provider) || !Number.isFinite(parsed.createdAt)) throw new Error();
      return parsed;
    } catch { throw new AuthFlowError('no_attempt'); }
  }
  callback(raw: string) {
    return this.serial(async () => {
      const attempt = await this.pending();
      if (!attempt) throw new AuthFlowError('no_attempt');
      let code: string;
      try { code = callbackCode(raw, this.deps.callback, attempt, this.deps.now()); }
      catch (error) {
        // Unrelated/forged URLs must not cancel a valid pending attempt.
        if (error instanceof AuthFlowError && ['expired', 'cancelled'].includes(error.reason)) await this.clear();
        throw error;
      }
      await this.deps.store.removeItem(ATTEMPT_KEY);
      try { await this.deps.exchange(code, attempt.flowId); }
      finally { await this.deps.clearVerifier(); }
    });
  }
  cancel() { return this.serial(() => this.clear()); }
  private async clear() {
    await this.deps.store.removeItem(ATTEMPT_KEY);
    await this.deps.clearVerifier();
  }
}
