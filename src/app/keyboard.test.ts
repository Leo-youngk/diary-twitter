import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openComposer, releaseKeyboard, takeKeyboard } from './keyboard';

let hosts: HTMLElement[];
let active: HTMLTextAreaElement | null;
function field() {
  const input = {
    isConnected: true, value: '已有草稿',
    getClientRects: vi.fn(() => [{ height: 100 }]),
    focus: vi.fn(() => { active = input as unknown as HTMLTextAreaElement; }),
    blur: vi.fn(() => { active = null; }),
    setSelectionRange: vi.fn(),
  };
  return input as unknown as HTMLTextAreaElement;
}
function host(id: string, input: HTMLTextAreaElement) {
  return { dataset: { composeActivity: id }, querySelector: () => input } as unknown as HTMLElement;
}
beforeEach(() => {
  hosts = []; active = null;
  vi.stubGlobal('document', { querySelectorAll: () => hosts, get activeElement() { return active; } });
});
afterEach(() => vi.unstubAllGlobals());

describe('opening the writing screen and keyboard together', () => {
  it('waits for the actual editor to be committed inside the same tap, preserving its draft', () => {
    const input = field();
    openComposer(() => {
      expect(active).toBeNull();
      hosts.push(host('new', input));
      return { activityId: 'new' };
    });
    expect(active).toBe(input);
    expect(input.value).toBe('已有草稿');
    expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(input.setSelectionRange).toHaveBeenCalledWith(4, 4);
  });
  it('does not raise a keyboard when navigation never mounted a writing screen', () => {
    const old = field(); hosts.push(host('old', old));
    openComposer(() => ({ activityId: 'prevented' }));
    expect(active).toBeNull();
    expect(old.focus).not.toHaveBeenCalled();
  });
  it('focuses the newly opened editor rather than a still-mounted previous one', () => {
    const old = field(), next = field(); hosts.push(host('old', old));
    openComposer(() => { hosts.push(host('next', next)); return { activityId: 'next' }; });
    expect(active).toBe(next);
    expect(old.focus).not.toHaveBeenCalled();
    releaseKeyboard(old);
    expect(active).toBe(next);
    releaseKeyboard(next);
    expect(active).toBeNull();
  });
  it('never focuses a hidden or disconnected input', () => {
    const hidden = field(), removed = field();
    vi.mocked(hidden.getClientRects).mockReturnValue([] as unknown as DOMRectList);
    Object.assign(removed, { isConnected: false });
    takeKeyboard(hidden); takeKeyboard(removed); takeKeyboard(null);
    expect(active).toBeNull();
    expect(hidden.focus).not.toHaveBeenCalled();
    expect(removed.focus).not.toHaveBeenCalled();
  });
  it('leaves the mounted editor usable if automatic focus is refused', () => {
    const input = field(); vi.mocked(input.focus).mockImplementation(() => { throw new Error('focus refused'); });
    expect(() => openComposer(() => { hosts.push(host('new', input)); return { activityId: 'new' }; })).not.toThrow();
    expect(hosts).toHaveLength(1);
  });
});
