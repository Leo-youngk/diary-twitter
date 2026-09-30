import type { ActivityComponentType } from '@stackflow/react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import PostDetail from '@/components/PostDetail';

const PostActivity: ActivityComponentType<'Post'> = ({ params }) => (
  <AppScreen><PostDetail params={params} /></AppScreen>
);

export default PostActivity;
