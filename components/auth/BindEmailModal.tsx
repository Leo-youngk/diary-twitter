'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context';

interface Props {
  onClose: () => void;
}

export default function BindEmailModal({ onClose }: Props) {
  const { bindEmail, addToast } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);

  const handleBind = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || password.length < 6) {
      setError('邮箱和密码（至少6位）不能为空');
      return;
    }
    setLoading(true);
    setError('');
    const err = await bindEmail(email.trim(), password);
    if (err) {
      setError(err);
      setLoading(false);
    } else {
      addToast('账号绑定成功！现在可以在其他设备登录了 🎉');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#16181c] rounded-2xl w-full max-w-[360px] p-6 border border-[#2f3336]">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold">绑定账号</h2>
            <p className="text-xs text-x-gray mt-0.5">绑定后可在任意设备同步数据</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleBind} className="space-y-3">
          <input
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            className="w-full bg-black border border-[#2f3336] rounded-xl px-4 py-3 text-white placeholder-x-gray outline-none focus:border-x-blue transition-colors text-sm"
            autoComplete="email"
            disabled={loading}
          />
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="设置密码（至少6位）"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              className="w-full bg-black border border-[#2f3336] rounded-xl px-4 py-3 pr-11 text-white placeholder-x-gray outline-none focus:border-x-blue transition-colors text-sm"
              autoComplete="new-password"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-x-gray hover:text-white transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                {showPw
                  ? <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                  : <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
                }
              </svg>
            </button>
          </div>

          {error && <p className="text-red-400 text-xs px-1">{error}</p>}

          <button
            type="submit"
            disabled={loading || !email || password.length < 6}
            className="w-full bg-x-blue hover:bg-x-blue-hover disabled:opacity-40 text-white font-bold rounded-xl py-2.5 text-sm transition-colors"
          >
            {loading ? '绑定中…' : '确认绑定'}
          </button>
        </form>

        <p className="text-center text-xs text-x-gray mt-4">
          绑定后，现有日记数据全部保留
        </p>
      </div>
    </div>
  );
}
