/** Bounded local Dev timings. No payloads, tokens, user IDs, or external reporting. */
type Timing = { name: string; start: number; duration: number };
const timings: Timing[] = [];
export function recordNativeTiming(name: string, start: number, duration: number) {
  timings.push({ name, start, duration });
  if (timings.length > 300) timings.shift();
}
export async function measureNative<T>(name: string, action: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try { return await action(); }
  finally { recordNativeTiming(name, start, performance.now() - start); }
}
export function markNative(name: string) { recordNativeTiming(name, performance.now(), 0); }
export function readNativeTimings() { return timings.map(timing => ({ ...timing })); }
