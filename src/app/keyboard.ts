/**
 * iOS only raises the keyboard for a focus() made during the tap itself, and
 * when an input is focused while it is still off-screen (a page sliding up)
 * Safari scrolls the whole page to "make room" — the jolt that made opening
 * 发帖 stutter.
 *
 * So the tap focuses an invisible proxy field pinned at the top of the screen
 * (already in view, nothing to scroll): the keyboard rises together with the
 * page. Once the page has arrived, focus moves to the real field without
 * scrolling; moving focus between fields keeps the keyboard up.
 * Technique: https://gist.github.com/searls/d6fd21a57b7c70be12f65beb17bb6149
 */

let proxy: HTMLInputElement | null = null;

function getProxy(): HTMLInputElement {
  if (proxy?.isConnected) return proxy;
  proxy = document.createElement('input');
  proxy.type = 'text';
  proxy.tabIndex = -1;
  proxy.setAttribute('aria-hidden', 'true');
  proxy.setAttribute('autocomplete', 'off');
  // 16px so iOS does not zoom; fixed at the top so focusing it never scrolls.
  proxy.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px;pointer-events:none;';
  document.body.appendChild(proxy);
  return proxy;
}

/** Call inside the tap that opens a writing screen. */
export function primeKeyboard(): void {
  try { getProxy().focus({ preventScroll: true }); } catch { /* not critical */ }
}

/** Hand the raised keyboard over to the real field, once it is on screen. */
export function takeKeyboard(field: HTMLTextAreaElement | HTMLInputElement | null): void {
  if (!field) return;
  field.focus({ preventScroll: true });
  const end = field.value.length;
  try { field.setSelectionRange(end, end); } catch { /* some inputs do not support it */ }
}

/** Put the keyboard away if the proxy still holds it (the screen closed before taking over). */
export function releaseKeyboard(): void {
  if (proxy && document.activeElement === proxy) proxy.blur();
}
