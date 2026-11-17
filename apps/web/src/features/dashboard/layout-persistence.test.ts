import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LAYOUT_STATE,
  LOCAL_LAYOUT_KEY,
  readLocalLayout,
  resolveInitialLayout,
  toLayoutPayload,
  writeLocalLayout,
  type WidgetLayoutState,
} from './layout';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k]! : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

const custom: WidgetLayoutState = {
  order: ['alerts', ...DEFAULT_LAYOUT_STATE.order.filter((id) => id !== 'alerts')],
  hidden: ['metal-rates'],
};

describe('local dashboard layout', () => {
  it('round-trips a saved layout and its dirty flag', () => {
    const s = memoryStorage();
    writeLocalLayout(custom, true, s);
    expect(readLocalLayout(s)).toEqual({ state: custom, dirty: true });
  });
  it('ignores corrupt or unknown data', () => {
    expect(readLocalLayout(memoryStorage({ [LOCAL_LAYOUT_KEY]: '{nope' }))).toBeNull();
    expect(readLocalLayout(memoryStorage())).toBeNull();
    const withJunk = memoryStorage({
      [LOCAL_LAYOUT_KEY]: JSON.stringify({ state: { order: ['alerts', 'bogus', 'alerts'], hidden: ['bogus', 'metal-rates'] }, dirty: false }),
    });
    const e = readLocalLayout(withJunk)!;
    expect(e.state.order[0]).toBe('alerts');
    expect(e.state.order).toHaveLength(DEFAULT_LAYOUT_STATE.order.length);
    expect(e.state.hidden).toEqual(['metal-rates']);
  });
  it('works without storage', () => {
    expect(readLocalLayout(null)).toBeNull();
    expect(() => writeLocalLayout(custom, true, null)).not.toThrow();
  });
});

describe('resolveInitialLayout', () => {
  const serverLayout = toLayoutPayload(DEFAULT_LAYOUT_STATE);
  it('prefers an unsynced local layout (quick reload keeps the layout) and asks to sync', () => {
    const r = resolveInitialLayout(serverLayout, { state: custom, dirty: true });
    expect(r).toEqual({ state: custom, needsSync: true });
  });
  it('uses the server layout when local is synced or absent', () => {
    expect(resolveInitialLayout(serverLayout, { state: custom, dirty: false }).needsSync).toBe(false);
    expect(resolveInitialLayout(toLayoutPayload(custom), null).state).toEqual(custom);
  });
});
