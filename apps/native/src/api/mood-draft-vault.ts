import type { SecureStore } from '../auth/flow';
/** Encrypted storage implementation is injected; plaintext never reaches Web Storage. */
export class MoodDraftVault {
  private owner = '';
  private generation = 0;
  private data = new Map<string, string>();
  private queue: Promise<void> = Promise.resolve();
  constructor(private store: SecureStore) {}
  async restore(owner: string) {
    this.generation++;
    await this.queue;
    this.owner = ''; this.data.clear();
    if (!owner) return;
    const raw = await this.store.getItem(`addi-native-mood-drafts-${owner}`);
    if (raw) {
      try {
        const rows: unknown = JSON.parse(raw);
        if (Array.isArray(rows)) for (const row of rows) {
          if (Array.isArray(row) && row.length === 2 && typeof row[0] === 'string'
            && /^addi:mood-draft:\d{4}-\d{2}-\d{2}$/.test(row[0]) && typeof row[1] === 'string') this.data.set(row[0], row[1]);
        }
      } catch { /* Corrupt drafts cannot be restored as another account's data. */ }
    }
    this.owner = owner;
  }
  storage(owner: string): Storage {
    const generation = this.generation;
    const valid = () => Boolean(owner) && this.owner === owner && generation === this.generation;
    const persist = () => {
      const key = `addi-native-mood-drafts-${owner}`, value = JSON.stringify([...this.data]);
      this.queue = this.queue.catch(() => undefined).then(() => value === '[]'
        ? this.store.removeItem(key) : this.store.setItem(key, value));
      // Keep failures observable via flush without an unhandled rejection.
      void this.queue.catch(() => undefined);
    };
    const data = this.data;
    return {
      get length() { return valid() ? data.size : 0; },
      getItem: key => valid() ? data.get(key) ?? null : null,
      key: index => valid() ? [...data.keys()][index] ?? null : null,
      setItem: (key,value) => { if (valid()) { data.set(key,value); persist(); } },
      removeItem: key => { if (valid()) { data.delete(key); persist(); } },
      clear: () => { if (valid()) { data.clear(); persist(); } },
    };
  }
  flush() { return this.queue; }
  async lock() { this.generation++; this.owner = ''; this.data.clear(); await this.queue.catch(() => undefined); }
}
