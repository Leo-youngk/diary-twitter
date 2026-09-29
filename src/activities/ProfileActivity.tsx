import type { ActivityComponentType } from '@stackflow/react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import ProfileView from '@/components/ProfileView';

/** The profile as its own page (/me): wide screens and direct links. On the phone it slides in from the avatar instead. */
const ProfileActivity: ActivityComponentType<'Profile'> = ({ params }) => (
  <AppScreen>
    <ProfileView initialTab={params.tab ?? 'posts'} />
  </AppScreen>
);

export default ProfileActivity;
