import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeClampedText } from './textMeasurement';

let resize: ResizeObserverCallback;
const cleanups: Array<() => void> = [];
const entryOf = (target: HTMLElement): ResizeObserverEntry => ({
  target, contentRect: {} as DOMRectReadOnly,
  borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [],
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

describe('clamped paragraph measurements', () => {
  it('reads all heights before callbacks can invalidate layout', () => {
    const order: string[] = [];
    const first = { get scrollHeight() { order.push('read first'); return 200; }, clientHeight: 100 } as HTMLElement;
    const second = { get scrollHeight() { order.push('read second'); return 100; }, clientHeight: 100 } as HTMLElement;
    cleanups.push(observeClampedText(first, (cut) => { order.push(`write first ${cut}`); }));
    cleanups.push(observeClampedText(second, (cut) => { order.push(`write second ${cut}`); }));
    resize([entryOf(first), entryOf(second)], {} as ResizeObserver);
    expect(order).toEqual(['read first', 'read second', 'write first true', 'write second false']);
  });

  it('does not read or update a paragraph removed before delivery', () => {
    const read = vi.fn(() => 200);
    const paragraph = { get scrollHeight() { return read(); }, clientHeight: 100 } as HTMLElement;
    const update = vi.fn();
    const stop = observeClampedText(paragraph, update);
    stop();
    resize([entryOf(paragraph)], {} as ResizeObserver);
    expect(read).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
