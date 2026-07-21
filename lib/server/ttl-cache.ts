// Tiny in-memory TTL + LRU cache for server routes. Per serverless instance
// (ephemeral), so it reduces repeated upstream calls within a warm instance
// without persisting anything. Not a durable store — just quota/latency relief.
export function createTtlCache<V>(opts: { ttlMs: number; max: number }) {
  const map = new Map<string, { v: V; exp: number }>()
  return {
    get(key: string): V | undefined {
      const entry = map.get(key)
      if (!entry) return undefined
      if (Date.now() > entry.exp) {
        map.delete(key)
        return undefined
      }
      // touch for LRU ordering
      map.delete(key)
      map.set(key, entry)
      return entry.v
    },
    set(key: string, v: V) {
      map.delete(key)
      map.set(key, { v, exp: Date.now() + opts.ttlMs })
      while (map.size > opts.max) {
        const oldest = map.keys().next().value
        if (oldest === undefined) break
        map.delete(oldest)
      }
    },
  }
}
