import { Provider } from 'tinybase/ui-react';
import { Stack } from '@/app/stack';
import DesktopRail from '@/components/DesktopRail';
import Toasts from '@/components/Toasts';
import { indexes, store } from '@/data/store';

/**
 * Phone: the page stack fills the screen. Wide screens: a navigation rail on
 * the left and the same stack in a centred 600px column.
 */
export default function App() {
  return (
    <Provider store={store as never} indexes={indexes as never}>
      <div className="flex h-full justify-center">
        <DesktopRail />
        <main className="relative h-full w-full min-w-0 md:max-w-[600px] md:border-x md:border-x-border">
          <Stack />
        </main>
      </div>
      <Toasts />
    </Provider>
  );
}
