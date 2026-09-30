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
import { loadLocal } from './data/store';

initPreferences();
installTouchGuard();
registerServiceWorker();

const root = createRoot(document.getElementById('root')!);

// The local copy loads in a few milliseconds and works offline; render once
// it is in, then let the network catch up in the background.
void loadLocal()
  .catch((error) => console.error('[boot] local data failed to load', error))
  .finally(() => {
    root.render(<App />);
    startConnection();
    void whenSynced().then(() => {
      void adoptLegacyLocalData();
      void flushUploads();
    });
    window.addEventListener('online', () => { void flushUploads(); });
  });
