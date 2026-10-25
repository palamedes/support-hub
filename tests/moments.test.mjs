import { describe, it, expect } from 'vitest';
import {
  createStore, shouldShowThanks, markThanksShown, markNever, markSupported, resetThanks,
} from '../src/widget/moments.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

describe('thank-you note timing', () => {
  it('shows the first time, then waits 30 days', () => {
    const store = createStore(memoryStorage);
    expect(shouldShowThanks(store, 'tool-a', { now: T0 })).toBe(true);
    markThanksShown(store, 'tool-a', T0);
    expect(shouldShowThanks(store, 'tool-a', { now: T0 + 1 })).toBe(false);
    expect(shouldShowThanks(store, 'tool-a', { now: T0 + 29 * DAY })).toBe(false);
    expect(shouldShowThanks(store, 'tool-a', { now: T0 + 30 * DAY })).toBe(true);
  });

  it('counts each tool separately', () => {
    const store = createStore(memoryStorage);
    markThanksShown(store, 'tool-a', T0);
    expect(shouldShowThanks(store, 'tool-b', { now: T0 + DAY })).toBe(true);
  });

  it('uses the configured interval', () => {
    const store = createStore(memoryStorage);
    markThanksShown(store, 'tool-a', T0);
    expect(shouldShowThanks(store, 'tool-a', { now: T0 + 6 * DAY, intervalDays: 7 })).toBe(false);
    expect(shouldShowThanks(store, 'tool-a', { now: T0 + 7 * DAY, intervalDays: 7 })).toBe(true);
  });

  it('remembers across visits (a new store on the same storage)', () => {
    const storage = memoryStorage();
    markThanksShown(createStore(() => storage), 'tool-a', T0);
    expect(shouldShowThanks(createStore(() => storage), 'tool-a', { now: T0 + DAY })).toBe(false);
  });
});

describe('"Don\'t show again" and supporters', () => {
  it('"Don\'t show again" turns it off for good, for every tool', () => {
    const storage = memoryStorage();
    markNever(createStore(() => storage));
    const later = createStore(() => storage);
    expect(shouldShowThanks(later, 'tool-a', { now: T0 + 1000 * DAY })).toBe(false);
    expect(shouldShowThanks(later, 'tool-b', { now: T0 + 1000 * DAY })).toBe(false);
  });

  it('never shows to someone who clicked a support option', () => {
    const store = createStore(memoryStorage);
    markSupported(store);
    expect(shouldShowThanks(store, 'tool-a', { now: T0 })).toBe(false);
  });

  it('reset forgets everything', () => {
    const store = createStore(memoryStorage);
    markNever(store);
    markSupported(store);
    markThanksShown(store, 'tool-a', T0);
    resetThanks(store, ['tool-a']);
    expect(shouldShowThanks(store, 'tool-a', { now: T0 + 1 })).toBe(true);
  });
});

describe('when storage is blocked', () => {
  it('survives localStorage itself throwing, and shows once per visit', () => {
    const store = createStore(() => { throw new DOMException('blocked', 'SecurityError'); });
    expect(store.persistent).toBe(false);
    expect(shouldShowThanks(store, 'tool-a', { now: T0 })).toBe(true);
    markThanksShown(store, 'tool-a', T0);
    expect(shouldShowThanks(store, 'tool-a', { now: T0 + 1 })).toBe(false);
  });

  it('survives every read and write throwing', () => {
    const throwing = {
      getItem() { throw new Error('nope'); },
      setItem() { throw new Error('nope'); },
      removeItem() { throw new Error('nope'); },
    };
    const store = createStore(() => throwing);
    expect(() => {
      shouldShowThanks(store, 'tool-a', { now: T0 });
      markThanksShown(store, 'tool-a', T0);
      markNever(store);
      markSupported(store);
      resetThanks(store, ['tool-a']);
    }).not.toThrow();
  });

  it('keeps working in memory when writes start failing mid-visit (storage full)', () => {
    const storage = memoryStorage();
    const store = createStore(() => storage);
    storage.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    markNever(store);
    expect(shouldShowThanks(store, 'tool-a', { now: T0 })).toBe(false);
  });
});
