import { useState } from 'react';
import { applyUpdate, useUpdateReady } from '@/app/swUpdate';
import Icon from './Icon';

/** 「有新版本」 on the main screen, just above the tab bar; one tap updates. */
export default function UpdatePrompt() {
  const ready = useUpdateReady();
  const [updating, setUpdating] = useState(false);
  if (!ready) return null;
  return (
    <button
      type="button"
      onClick={() => { setUpdating(true); applyUpdate(); }}
      disabled={updating}
      className="pressable absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-x-blue px-4 py-2 text-[14px] font-semibold text-white shadow-lg md:bottom-6"
      style={{ bottom: 'calc(max(10px, env(safe-area-inset-bottom) - 6px) + 74px)' }}
    >
      <Icon name="refresh" size={16} strokeWidth={2.2} />
      {updating ? '正在更新…' : '有新版本，点击更新'}
    </button>
  );
}
