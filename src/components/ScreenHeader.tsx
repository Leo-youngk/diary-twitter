import { useBack } from '@/app/useBack';
import Icon from './Icon';

/** Back button, a title and an optional action on the right. */
export default function ScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const back = useBack();
  return (
    <header className="frosted sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-x-border px-2">
      <button type="button" onClick={back} className="pressable rounded-full p-2" aria-label="返回">
        <Icon name="back" size={22} />
      </button>
      <h1 className="flex-1 truncate text-[17px] font-semibold">{title}</h1>
      <div className="flex items-center">{right}</div>
    </header>
  );
}
