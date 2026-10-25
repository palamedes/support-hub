// The thank-you moment's memory: when it last showed, whether the visitor
// asked never to see it again, and whether they've already clicked a support
// option. Kept in localStorage only. Every access is wrapped in try/catch,
// and if storage is blocked it falls back to memory for this page load, so
// the note shows at most once per visit and never throws.

const PREFIX = 'supportHub:';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {() => Storage} getStorage - usually () => window.localStorage. It's a
 *   function because even reading window.localStorage throws in some browsers
 *   when storage is blocked.
 */
export function createStore(getStorage) {
  let storage = null;
  try {
    storage = getStorage();
    const probe = PREFIX + 'probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
  } catch {
    storage = null;
  }
  const memory = new Map();
  return {
    persistent: storage !== null,
    get(key) {
      if (memory.has(key)) return memory.get(key);
      try {
        return storage ? storage.getItem(PREFIX + key) : null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      memory.set(key, String(value));
      try {
        if (storage) storage.setItem(PREFIX + key, String(value));
      } catch {
        // Storage filled up or was blocked mid-visit; memory still has it.
      }
    },
    remove(key) {
      memory.delete(key);
      try {
        if (storage) storage.removeItem(PREFIX + key);
      } catch {
        // Nothing else to do.
      }
    },
  };
}

/** Should the thank-you note show for this tool right now? */
export function shouldShowThanks(store, toolId, { now = Date.now(), intervalDays = 30 } = {}) {
  if (store.get('supported') === '1') return false;
  if (store.get('never') === '1') return false;
  const last = Number(store.get('last:' + (toolId || '_')));
  if (Number.isFinite(last) && last > 0 && now - last < intervalDays * DAY_MS) return false;
  return true;
}

export function markThanksShown(store, toolId, now = Date.now()) {
  store.set('last:' + (toolId || '_'), now);
}

/** "Don't show again": turns the note off for good, for every tool on this site. */
export function markNever(store) {
  store.set('never', '1');
}

/** Someone clicked a support option, so stop showing thank-you notes. */
export function markSupported(store) {
  store.set('supported', '1');
}

/** Forget everything (used by the demo page's "Reset" button). */
export function resetThanks(store, toolIds) {
  store.remove('never');
  store.remove('supported');
  for (const id of toolIds.concat('_')) store.remove('last:' + id);
}
