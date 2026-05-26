'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context';

type Mode = 'login' | 'reset';

export default function AuthGate() {
  const { signInWithEmail } = useApp();
  const [mode, setMode] = useState<Mode>('login');

  return mode === 'login'
    ? <LoginForm onForgot={() => setMode('reset')} signInWithEmail={signInWithEmail} />
    : <ResetForm onBack={() => setMode('login')} signInWithEmail={signInWithEmail} />;
}

// ── Login form ────────────────────────────────────────────────────────────────
function LoginForm({
  onForgot,
  signInWithEmail,
}: {
  onForgot: () => void;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || password.length < 6) {
      setError('请输入邮箱和至少 6 位密码');
      return;
    }
    setLoading(true);
    setError('');
    const err = await signInWithEmail(email.trim(), password);
    if (err) { setError(err); setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex items-center justify-center p-4">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-blue-400 to-indigo-500" />

      <div className="w-full max-w-[400px]">
        <div className="text-center mb-10">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-blue-500 items-center justify-center mb-4 shadow-lg shadow-blue-200">
            <svg viewBox="0 0 24 24" className="w-9 h-9 fill-white">
              <path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6H6zm7 1.5L18.5 9H13V3.5zM6 4h5v7h7v9H6V4zm2 9v2h8v-2H8zm0 4v2h5v-2H8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">我的日记本</h1>
          <p className="text-sm text-gray-400 mt-1">你的私密空间，跨设备同步</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-gray-100 border border-gray-100 p-7">
          <h2 className="text-base font-semibold text-gray-700 mb-5">
            输入邮箱和密码
            <span className="text-gray-400 font-normal ml-1 text-sm">· 自动注册或登录</span>
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">邮箱</label>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all text-[15px]"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">密码</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="至少 6 位"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-gray-900 placeholder-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all text-[15px]"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors">
                  <EyeIcon open={showPw} />
                </button>
              </div>
            </div>

            {error && <ErrorBox msg={error} />}

            <button type="submit"
              disabled={loading || !email || password.length < 6}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-[15px] transition-colors mt-1 flex items-center justify-center gap-2">
              {loading ? <Spinner /> : '进入日记本'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button onClick={onForgot}
              className="text-sm text-gray-400 hover:text-blue-500 transition-colors">
              忘记密码？
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          未注册将自动创建账号 · 数据加密存储 · 仅你可见
        </p>
      </div>
    </div>
  );
}

// ── Reset password form ───────────────────────────────────────────────────────
function ResetForm({
  onBack,
  signInWithEmail,
}: {
  onBack: () => void;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
}) {
  const [email, setEmail] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('请输入邮箱'); return; }
    if (newPw.length < 6) { setError('新密码至少 6 位'); return; }
    if (newPw !== confirmPw) { setError('两次密码不一致'); return; }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '重置失败，请重试');
        setLoading(false);
        return;
      }
      // Auto login with new password
      const err = await signInWithEmail(email.trim(), newPw);
      if (err) { setError(err); setLoading(false); }
      // On success, context sets sessionReady=true → AppShell removes this gate
    } catch {
      setError('网络错误，请重试');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex items-center justify-center p-4">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-blue-400 to-indigo-500" />

      <div className="w-full max-w-[400px]">
        <div className="text-center mb-10">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-blue-500 items-center justify-center mb-4 shadow-lg shadow-blue-200">
            <svg viewBox="0 0 24 24" className="w-9 h-9 fill-white">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">重置密码</h1>
          <p className="text-sm text-gray-400 mt-1">输入新密码，立即生效</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-gray-100 border border-gray-100 p-7">
          <form onSubmit={handleReset} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">注册邮箱</label>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all text-[15px]"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">新密码</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="至少 6 位"
                  value={newPw}
                  onChange={(e) => { setNewPw(e.target.value); setError(''); }}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-gray-900 placeholder-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all text-[15px]"
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors">
                  <EyeIcon open={showPw} />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">确认新密码</label>
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="再输一遍"
                value={confirmPw}
                onChange={(e) => { setConfirmPw(e.target.value); setError(''); }}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all text-[15px]"
                autoComplete="new-password"
                disabled={loading}
              />
            </div>

            {error && <ErrorBox msg={error} />}

            <button type="submit"
              disabled={loading || !email || newPw.length < 6 || newPw !== confirmPw}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-[15px] transition-colors mt-1 flex items-center justify-center gap-2">
              {loading ? <Spinner /> : '重置并登录'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button onClick={onBack}
              className="text-sm text-gray-400 hover:text-blue-500 transition-colors flex items-center gap-1 mx-auto">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M7.414 13l5.043 5.04-1.414 1.42L3.586 12l7.457-7.46 1.414 1.42L7.414 11H21v2H7.414z"/>
              </svg>
              返回登录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
      <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
    </svg>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-red-400 shrink-0 mt-0.5">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
      <p className="text-red-500 text-sm">{msg}</p>
    </div>
  );
}

function Spinner() {
  return (
    <>
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      处理中…
    </>
  );
}
