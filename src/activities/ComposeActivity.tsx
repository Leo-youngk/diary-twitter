import { useActivity, type ActivityComponentType } from '@stackflow/react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import { useNav } from '@/app/nav';
import Composer from '@/components/Composer';

const ComposeActivity: ActivityComponentType<'Compose'> = ({ params }) => {
  const { pop } = useNav();
  const { id } = useActivity();
  return (
    <AppScreen CUPERTINO_ONLY_modalPresentationStyle="fullScreen" preventSwipeBack>
      <Composer params={params} onClose={pop} activityId={id} />
    </AppScreen>
  );
};

export default ComposeActivity;
