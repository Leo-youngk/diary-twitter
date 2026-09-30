/**
 * TEMPORARY — remove once the launch-scroll stutter is understood.
 *
 * For 30s after each launch or return to the foreground, records what could
 * make a fast scroll stutter on the phone:
 * - 主线程阻塞: a 16ms heartbeat that fired late (JS busy),
 * - 掉帧: animation frames that came late while JS was free (painting),
 * - plus timed app work (sync, data changes, list appends, touch handling)
 * and scroll speed, so the stalls can be matched to their cause.
 * Shown in 设置 → 性能诊断.
 */

export interface ProbeEntry {
  at: number;
  kind: string;
  ms?: number;
  note?: string;
}

const WINDOW_MS = 30_000;
const MAX_ENTRIES = 300;
const STALL_MS = 50;

let t0 = performance.now();
let session = '启动';
let entries: ProbeEntry[] = [];
let lastBeat = 0;

function inWindow(): boolean {
  return performance.now() - t0 < WINDOW_MS && document.visibilityState === 'visible';
}

export function probeMark(kind: string, ms?: number, note?: string): void {
  if (!inWindow() || entries.length >= MAX_ENTRIES) return;
  entries.push({ at: performance.now() - t0, kind, ms, note });
}

/** Time a piece of work; call the returned function when it ends. Only slow ones are kept. */
export function probeSpan(kind: string, minMs = 8): (note?: string) => void {
  const start = performance.now();
  return (note) => {
    const ms = performance.now() - start;
    if (ms >= minMs) probeMark(kind, ms, note);
  };
}

export function probeReport(): { session: string; entries: ProbeEntry[] } {
  return { session, entries: [...entries] };
}

function heartbeat(): void {
  const now = performance.now();
  if (lastBeat && document.visibilityState === 'visible') {
    const late = now - lastBeat - 16;
    if (late > STALL_MS) probeMark('主线程阻塞', late);
  }
  lastBeat = now;
  if (inWindow()) setTimeout(heartbeat, 16);
  else lastBeat = 0;
}

let lastFrame = 0;
function frame(now: number): void {
  // A late frame while the heartbeat was on time means painting, not JS.
  if (lastFrame && now - lastFrame > STALL_MS && now - lastBeat < 40) probeMark('掉帧', now - lastFrame);
  lastFrame = now;
  if (inWindow()) requestAnimationFrame(frame);
  else lastFrame = 0;
}

let scrollAt = 0;
let scrollTop = 0;
let lastScrollMark = 0;
function onScroll(event: Event): void {
  const target = event.target as HTMLElement;
  if (!(target instanceof HTMLElement)) return;
  const now = performance.now();
  if (now - lastScrollMark > 250 && scrollAt) {
    const speed = Math.abs(target.scrollTop - scrollTop) / Math.max(1, now - scrollAt) * 1000;
    probeMark('滚动', undefined, `${Math.round(speed)}px/s`);
    lastScrollMark = now;
  }
  scrollAt = now;
  scrollTop = target.scrollTop;
}

function begin(label: string): void {
  t0 = performance.now();
  session = label;
  entries = [];
  lastBeat = 0;
  lastFrame = 0;
  setTimeout(heartbeat, 16);
  requestAnimationFrame(frame);
}

export function startProbe(): void {
  t0 = 0; // measure the launch from navigation start
  session = '冷启动';
  setTimeout(heartbeat, 16);
  requestAnimationFrame(frame);
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = performance.now(); return; }
    begin(`回到前台（离开 ${Math.round((performance.now() - hiddenAt) / 1000)}s）`);
  });
}
