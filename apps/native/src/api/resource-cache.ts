/** In-memory data only. No tokens, persistence, or changes to server authorization. */
export class ResourceCache {
  private scope = '';
  private generations = new Map<string, number>();
  private entries = new Map<string, { resource: string; until: number; value: unknown }>();
  private pending = new Map<string, Promise<unknown>>();
  constructor(private readonly ttl = 30_000, private readonly now = () => performance.now(), private readonly limit = 64) {}
  setScope(scope: string) {
    if (scope === this.scope) return;
    this.clear();
    this.scope = scope;
  }
  clear() {
    for (const resource of this.generations.keys()) this.invalidate(resource);
    this.entries.clear();
    this.pending.clear();
  }
  /** Repeated resume events share the refresh already in progress. */
  expire() { this.entries.clear(); }
  invalidate(resource: string) {
    this.generations.set(resource, (this.generations.get(resource) ?? 0) + 1);
    for (const [key, entry] of this.entries) if (entry.resource === resource) this.entries.delete(key);
    for (const key of this.pending.keys()) if (key.startsWith(resource + ':')) this.pending.delete(key);
  }
  peek<T>(resource: string, key: string): T | undefined {
    const entry = this.entries.get(resource + ':' + key);
    return entry && entry.until > this.now() ? entry.value as T : undefined;
  }
  async read<T>(resource: string, key: string, fetcher: () => Promise<T>, retain: (value: T) => boolean = () => true): Promise<T> {
    const cached = this.peek<T>(resource, key);
    if (cached !== undefined) return cached;
    const id = resource + ':' + key;
    const existing = this.pending.get(id);
    if (existing) return existing as Promise<T>;
    const generation = this.generations.get(resource) ?? 0;
    this.generations.set(resource, generation);
    const scope = this.scope;
    const request = fetcher().then(value => {
      if (scope !== this.scope || generation !== this.generations.get(resource)) throw new Error('cache_invalidated');
      if (retain(value)) {
        if (this.entries.size >= this.limit) this.entries.delete(this.entries.keys().next().value!);
        this.entries.set(id, { resource, until: this.now() + this.ttl, value });
      }
      return value;
    }).finally(() => { if (this.pending.get(id) === request) this.pending.delete(id); });
    this.pending.set(id, request);
    return request;
  }
}
