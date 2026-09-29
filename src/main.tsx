import { createRoot } from 'react-dom/client';
import '@stackflow/plugin-basic-ui/index.css';
import './styles/globals.css';
import App from './App';
import { initPreferences } from './app/preferences';
import { registerServiceWorker } from './app/swUpdate';
import { installTouchGuard } from './app/touchGuard';
import { flushUploads } from './data/blobs';
import { startConnection, whenSynced } from './data/connection';
import { adoptLegacyLocalData } from './data/legacyLocal';
import { loadLocal, store } from './data/store';
import { probeMark, probeSpan, startProbe } from './app/perfProbe';

startProbe(); // TEMPORARY, see app/perfProbe.ts
initPreferences();
installTouchGuard();
registerServiceWorker();

const root = createRoot(document.getElementById('root')!);

// The local copy loads in a few milliseconds and works offline; render once
// it is in, then let the network catch up in the background.
const localLoaded = probeSpan('本地加载', 0);
// TEMPORARY: time every data change (sync merges, saves) for the probe.
let txStart = 0;
store.addStartTransactionListener(() => { txStart = performance.now(); });
store.addDidFinishTransactionListener(() => { const ms = performance.now() - txStart; if (ms >= 8) probeMark('数据变更', ms); });
void loadLocal()
  .then(() => localLoaded())
  .catch((error) => console.error('[boot] local data failed to load', error))
  .finally(() => {
    const rendered = probeSpan('首屏渲染', 0);
    root.render(<App />);
    requestAnimationFrame(() => rendered());
    startConnection();
    void whenSynced().then(() => {
      void adoptLegacyLocalData();
      void flushUploads();
    });
    window.addEventListener('online', () => { void flushUploads(); });
  });
