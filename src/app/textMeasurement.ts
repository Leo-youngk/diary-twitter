type OnCut = (cut: boolean) => void;

const watched = new Map<HTMLElement, OnCut>();
let observer: ResizeObserver | undefined;
let frame = 0;

/** Read every paragraph before any callback can change the DOM. */
function measure(elements: HTMLElement[]): void {
  const results = elements.filter((element) => watched.has(element))
    .map((element) => ({ element, cut: element.scrollHeight - element.clientHeight > 1 }));
  for (const { element, cut } of results) watched.get(element)?.(cut);
}

/** ResizeObserver runs after layout and also catches width/font changes. */
export function observeClampedText(element: HTMLElement, onCut: OnCut): () => void {
  watched.set(element, onCut);
  if (typeof ResizeObserver !== 'undefined') {
    observer ??= new ResizeObserver((entries) => measure(entries.map((entry) => entry.target as HTMLElement)));
    observer.observe(element);
  } else if (!frame) {
    frame = requestAnimationFrame(() => { frame = 0; measure([...watched.keys()]); });
  }
  return () => {
    watched.delete(element);
    observer?.unobserve(element);
    if (!watched.size) {
      observer?.disconnect();
      observer = undefined;
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}
