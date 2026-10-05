import { defineConfig } from '@stackflow/config';
import { stackflow } from '@stackflow/react';
import { immediateRendererPlugin } from './immediateRendererPlugin';
import { basicUIPlugin } from '@stackflow/plugin-basic-ui';
import { historySyncPlugin } from '@stackflow/plugin-history-sync';
import MainActivity from '@/activities/MainActivity';
import PostActivity from '@/activities/PostActivity';
import ComposeActivity from '@/activities/ComposeActivity';
import ProfileActivity from '@/activities/ProfileActivity';
import SettingsActivity from '@/activities/SettingsActivity';

declare module '@stackflow/config' {
  interface Register {
    Main: Record<string, never>;
    Post: { postId: string; focusReply?: string };
    Compose: { editId?: string; replyTo?: string; writingPrompt?: string };
    Profile: { tab?: 'posts' | 'replies' | 'saved' };
    Settings: Record<string, never>;
  }
}

export const config = defineConfig({
  activities: [
    { name: 'Main', route: '/' },
    { name: 'Post', route: '/post/:postId' },
    { name: 'Compose', route: '/compose' },
    { name: 'Profile', route: '/me' },
    { name: 'Settings', route: '/settings' },
  ],
  transitionDuration: 350,
});

export const { Stack, actions } = stackflow({
  config,
  components: {
    Main: MainActivity,
    Post: PostActivity,
    Compose: ComposeActivity,
    Profile: ProfileActivity,
    Settings: SettingsActivity,
  },
  plugins: [
    immediateRendererPlugin(),
    basicUIPlugin({
      theme: 'cupertino',
      backgroundColor: 'var(--color-x-dark)',
      dimBackgroundColor: 'rgba(0, 0, 0, 0.25)',
    }),
    historySyncPlugin({ config, fallbackActivity: () => 'Main' }),
  ],
});
