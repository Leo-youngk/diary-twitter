import { Provider } from 'tinybase/ui-react';
import { Stack } from '@/app/stack';
import DesktopRail from '@/components/DesktopRail';
import ErrorBoundary from '@/components/ErrorBoundary';
import Toasts from '@/components/Toasts';
import { indexes, store } from '@/data/store';

/**
 * Phone: the page stack fills the screen. Wide screens: a navigation rail on
 * the left, with room for the timeline and its writing/detail panel.
 */
export default function App() {
  return (
    <Provider store={store as never} indexes={indexes as never}>
      <div className="mx-auto flex h-full max-w-[1360px] justify-center md:px-4">
        <DesktopRail />
        <main className="relative h-full w-full min-w-0 md:max-w-[600px] md:border-x md:border-x-border lg:max-w-[800px] xl:max-w-[1120px]">
          <ErrorBoundary>
            <Stack />
          </ErrorBoundary>
        </main>
      </div>
      <Toasts />
    </Provider>
  );
}
