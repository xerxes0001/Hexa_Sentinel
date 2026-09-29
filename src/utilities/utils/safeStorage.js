/**
 * Safe localStorage wrapper — falls back to an in-memory store if
 * localStorage is unavailable (private browsing, disabled storage, or a
 * non-browser test environment) rather than crashing the caller over it.
 *
 * Previously this exact block was copy-pasted independently into
 * rpkiGapScanner.js and changeHistory.js; consolidated here so there's
 * one implementation to maintain. Safe to share a single in-memory Map
 * across all callers since every caller namespaces its own storage key
 * (e.g. 'shyen_rpki_scan_history', 'shyen_change_history').
 */
const memoryFallback = new Map()

export function safeGetItem(key) {
  try { return localStorage.getItem(key) }
  catch { return memoryFallback.get(key) ?? null }
}

export function safeSetItem(key, value) {
  try { localStorage.setItem(key, value) }
  catch { memoryFallback.set(key, value) }
  // Keep the in-memory fallback in sync even when localStorage succeeds,
  // so a later failure (e.g. quota exceeded) still reads the latest value.
  memoryFallback.set(key, value)
}

export function safeRemoveItem(key) {
  try { localStorage.removeItem(key) }
  catch { /* ignore */ }
  memoryFallback.delete(key)
}
