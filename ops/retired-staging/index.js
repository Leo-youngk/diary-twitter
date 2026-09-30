// The test site diary-app-next is retired. Every page says where the app is
// now; the service worker of the old app is replaced by one that removes
// itself and reloads, so an installed copy lands on that page too; sync is
// refused, so nothing more is written here.
import { DurableObject } from 'cloudflare:workers';

const APP_URL = 'https://diary-app.yk2958374240.workers.dev';

// Not used any more; exported so the stored data is kept, not deleted.
export class DiarySpace extends DurableObject {}

const SELF_REMOVING_WORKER = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
`;

const PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>测试站已停用</title>
<style>
  :root { color-scheme: light dark; --bg: #f7f5f0; --fg: #111; --muted: #6b6b6b; --line: #e3dfd6; --accent: #1d9bf0; }
  @media (prefers-color-scheme: dark) { :root { --bg: #000; --fg: #e7e9ea; --muted: #8b8f94; --line: #2f3336; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 32px 24px;
    background: var(--bg); color: var(--fg); font: 16px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }
  main { width: 100%; max-width: 360px; }
  h1 { margin: 0 0 8px; font-size: 24px; }
  p { margin: 0 0 16px; color: var(--muted); font-size: 15px; }
  ol { margin: 0 0 24px; padding-left: 20px; font-size: 15px; }
  li { margin-bottom: 6px; }
  .url { display: block; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; font-size: 15px; word-break: break-all; color: var(--accent); text-decoration: none; }
  button { margin-top: 12px; width: 100%; height: 48px; border: 0; border-radius: 999px; background: var(--fg); color: var(--bg); font: 600 16px/1 inherit; }
</style>
</head>
<body>
<main>
  <h1>测试站已停用</h1>
  <p>这个图标连的是测试站，数据已经并入正式站。请换成正式站：</p>
  <ol>
    <li>删掉主屏上的这个图标</li>
    <li>用 Safari 打开下面的网址</li>
    <li>点分享 → 添加到主屏幕，打开后输入一次口令</li>
  </ol>
  <a class="url" href="${APP_URL}">${APP_URL.replace('https://', '')}</a>
  <button type="button" id="copy">复制网址</button>
</main>
<script>
  document.getElementById('copy').addEventListener('click', async (event) => {
    try { await navigator.clipboard.writeText('${APP_URL}'); event.target.textContent = '已复制'; }
    catch { event.target.textContent = '复制失败，请长按上面的网址'; }
  });
</script>
</body>
</html>`;

export default {
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === '/sw.js') {
      return new Response(SELF_REMOVING_WORKER, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });
    }
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: '测试站已停用' }, { status: 410 });
    }
    return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  },
};
