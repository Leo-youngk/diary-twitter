'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import { Theme } from '@/lib/context';
import Avatar from '@/components/ui/Avatar';

function compressImage(file: File, maxWidth: number, maxKB: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.85;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > maxKB * 1024 * 1.37 && quality > 0.1) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed')); };
    img.src = url;
  });
}

export default function SettingsPage() {
  const router = useRouter();
  const { currentUser, updateUser, theme, setTheme, addToast, syncId, restoreFromSyncId } = useApp();
  const [restoreId, setRestoreId] = useState('');
  const [restoring, setRestoring] = useState(false);

  const handleCopySyncId = async () => {
    try {
      await navigator.clipboard.writeText(syncId);
      addToast('同步码已复制');
    } catch {
      addToast('复制失败', 'error');
    }
  };

  const handleRestore = async () => {
    const id = restoreId.trim();
    if (!id) return;
    setRestoring(true);
    const ok = await restoreFromSyncId(id);
    setRestoring(false);
    if (ok) {
      addToast('已恢复该设备的数据');
      setRestoreId('');
    } else {
      addToast('未找到该同步码对应的数据', 'error');
    }
  };
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [username, setUsername] = useState(currentUser.username);
  const [bio, setBio] = useState(currentUser.bio);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 400, 200);
      updateUser({ avatar: compressed });
      addToast('头像已更新');
    } catch {
      addToast('图片处理失败', 'error');
    }
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 1200, 500);
      updateUser({ banner: compressed });
      addToast('背景已更新');
    } catch {
      addToast('图片处理失败', 'error');
    }
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  };

  const handleSaveProfile = () => {
    updateUser({
      displayName: displayName.trim() || currentUser.displayName,
      username: username.trim() || currentUser.username,
      bio: bio.trim(),
    });
    addToast('资料已保存');
  };

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-x-dark border-b border-x-border">
        <div className="flex items-center gap-4 px-4 py-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-full hover:bg-x-hover transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M7.414 13l5.043 5.04-1.414 1.42L3.586 12l7.457-7.46 1.414 1.42L7.414 11H21v2H7.414z" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">设置</h1>
        </div>
      </div>

      {/* Theme */}
      <div className="px-4 py-4 border-b border-x-border">
        <h2 className="font-bold text-lg mb-3">主题</h2>
        <div className="flex gap-3">
          <button
            onClick={() => setTheme('dark')}
            className={`flex-1 py-3 px-4 rounded-xl border-2 transition-colors ${
              theme === 'dark'
                ? 'border-x-blue bg-x-blue/10'
                : 'border-x-border hover:border-x-gray'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-black border border-gray-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-center">深色</p>
          </button>
          <button
            onClick={() => setTheme('light')}
            className={`flex-1 py-3 px-4 rounded-xl border-2 transition-colors ${
              theme === 'light'
                ? 'border-x-blue bg-x-blue/10'
                : 'border-x-border hover:border-x-gray'
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-white border border-gray-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-center">浅色</p>
          </button>
          <button
            onClick={() => setTheme('zen')}
            className={`flex-1 py-3 px-4 rounded-xl border-2 transition-colors ${
              theme === 'zen'
                ? 'border-x-blue bg-x-blue/10'
                : 'border-x-border hover:border-x-gray'
            }`}
          >
            {/* 圆形预览：左半米白 + 右半苔绿，直观展示两种主色 */}
            <div
              className="w-8 h-8 rounded-full mx-auto mb-2"
              style={{ background: 'linear-gradient(135deg, #f5f0e8 50%, #5a8a72 50%)' }}
            />
            <p className="text-sm font-bold text-center">禅</p>
          </button>
        </div>
      </div>

      {/* Avatar & Banner */}
      <div className="px-4 py-4 border-b border-x-border">
        <h2 className="font-bold text-lg mb-3">头像与背景</h2>
        <div className="flex items-center gap-4 mb-4">
          <div className="relative">
            <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="xl" />
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
                <path d="M9.697 3H11v2h-.697l-2 2H5c-.276 0-.5.224-.5.5v11c0 .276.224.5.5.5h14c.276 0 .5-.224.5-.5V10h2v8.5c0 1.381-1.119 2.5-2.5 2.5h-14C3.619 21 2.5 19.881 2.5 18.5v-11C2.5 6.119 3.619 5 5 5h1.697l2-2zM12 10.5c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3zm0-2c2.761 0 5 2.239 5 5s-2.239 5-5 5-5-2.239-5-5 2.239-5 5-5zM17 2c.552 0 1 .448 1 1v2h2c.552 0 1 .448 1 1s-.448 1-1 1h-2v2c0 .552-.448 1-1 1s-1-.448-1-1V7h-2c-.552 0-1-.448-1-1s.448-1 1-1h2V3c0-.552.448-1 1-1z" />
              </svg>
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-x-gray">点击头像更换</p>
            <p className="text-xs text-x-gray mt-1">建议使用正方形图片</p>
          </div>
        </div>
        <button
          onClick={() => bannerInputRef.current?.click()}
          className="w-full py-3 px-4 border border-x-border rounded-xl hover:bg-x-hover transition-colors text-sm"
        >
          {currentUser.banner ? '更换背景图片' : '上传背景图片'}
        </button>
        <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />
      </div>

      {/* Profile Info */}
      <div className="px-4 py-4 border-b border-x-border">
        <h2 className="font-bold text-lg mb-3">个人资料</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-x-gray block mb-1">昵称</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-transparent border border-x-border rounded-lg px-3 py-2 text-[15px] outline-none focus:border-x-blue transition-colors"
            />
          </div>
          <div>
            <label className="text-sm text-x-gray block mb-1">用户名</label>
            <div className="flex items-center border border-x-border rounded-lg focus-within:border-x-blue transition-colors">
              <span className="text-x-gray pl-3">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="flex-1 bg-transparent px-2 py-2 text-[15px] outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-x-gray block mb-1">简介</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full bg-transparent border border-x-border rounded-lg px-3 py-2 text-[15px] outline-none focus:border-x-blue transition-colors resize-none"
            />
          </div>
          <button
            onClick={handleSaveProfile}
            className="w-full bg-x-blue hover:bg-x-blue-hover text-white font-bold rounded-full py-2.5 transition-colors"
          >
            保存
          </button>
        </div>
      </div>

      {/* Data */}
      <div className="px-4 py-4">
        <h2 className="font-bold text-lg mb-3">数据</h2>
        <p className="text-sm text-x-gray mb-2">数据保存在本机，并自动同步到云端。任何持有下方同步码的人都能访问这些数据，请勿分享给他人。</p>
        <p className="text-sm text-x-gray mb-4">建议定期在「我的」页面导出 Markdown 备份。</p>

        <div className="border border-x-border rounded-lg p-3 mb-3">
          <p className="text-xs text-x-gray mb-1">本设备同步码</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm break-all">{syncId}</code>
            <button
              onClick={handleCopySyncId}
              className="shrink-0 text-sm text-x-blue hover:underline"
            >
              复制
            </button>
          </div>
        </div>

        <div className="border border-x-border rounded-lg p-3">
          <p className="text-xs text-x-gray mb-2">从其他设备恢复数据（输入该设备的同步码）</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={restoreId}
              onChange={(e) => setRestoreId(e.target.value)}
              placeholder="粘贴同步码"
              className="flex-1 bg-transparent border border-x-border rounded-lg px-3 py-2 text-sm outline-none focus:border-x-blue transition-colors"
            />
            <button
              onClick={handleRestore}
              disabled={restoring || !restoreId.trim()}
              className="shrink-0 text-sm bg-x-blue hover:bg-x-blue-hover disabled:opacity-50 text-white font-bold rounded-full px-4 py-2 transition-colors"
            >
              {restoring ? '恢复中…' : '恢复'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
