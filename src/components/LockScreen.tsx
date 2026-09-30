import { useState } from 'react';
import { signIn, type SignInResult } from '@/data/auth';
import { XLogo } from './Icon';

const MESSAGES: Partial<Record<SignInResult, string>> = {
  wrong: '口令不对，再试一次',
  unreachable: '连不上服务器，联网后再试',
  unavailable: '服务器暂时不可用，稍后再试',
};

/**
 * Shown on a device that has never been let in. One passphrase for the whole
 * app; the device keeps its token afterwards and syncs on its own.
 */
export default function LockScreen() {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setError('');
    const result = await signIn(value);
    setBusy(false);
    if (result !== 'ok') setError(MESSAGES[result] ?? '');
  };

  return (
    <div className="flex h-full items-center justify-center bg-x-dark px-8">
      <form onSubmit={(event) => { void submit(event); }} className="-mt-16 w-full max-w-[340px]">
        <XLogo size={34} className="mx-auto" />
        <h1 className="mt-7 text-center text-[24px] font-bold">输入口令</h1>
        <p className="mt-2 text-center text-[15px] leading-relaxed text-x-gray">每台设备只需一次，之后自动同步</p>
        {/* Lets iCloud Keychain / the browser save the passphrase and fill it on the next device. */}
        <input type="text" name="username" autoComplete="username" value="随想" readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={value}
          onChange={(event) => { setValue(event.target.value); setError(''); }}
          placeholder="口令"
          aria-label="口令"
          className="mt-8 h-12 w-full rounded-xl border border-x-border bg-x-darker px-4 text-[17px] outline-none placeholder:text-x-gray focus:border-x-blue"
        />
        <p className="mt-2 min-h-[20px] text-[14px] text-x-danger" role="alert">{error}</p>
        <button
          type="submit"
          disabled={!value.trim() || busy}
          className="pressable mt-2 h-12 w-full rounded-full bg-x-fg text-[16px] font-bold text-x-dark disabled:opacity-40"
        >
          {busy ? '正在验证…' : '进入'}
        </button>
      </form>
    </div>
  );
}
