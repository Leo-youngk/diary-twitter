'use client';

import { useState, useMemo, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/context';
import { cn } from '@/lib/utils';
import { compressImage, AVATAR_OPTS, BANNER_OPTS } from '@/lib/image';
import Avatar from '@/components/ui/Avatar';
import FeedList from '@/components/feed/FeedList';
import Button from '@/components/ui/Button';
import { ProfileTab } from '@/lib/types';

export default function ProfilePage() {
  const router = useRouter();
  const { posts, currentUser, updateUser, exportAll, addToast } = useApp();
  const [activeTab, setActiveTab] = useState<ProfileTab>('all');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, AVATAR_OPTS);
      updateUser({ avatar: compressed });
      addToast('头像已更新');
    } catch {
      addToast('图片处理失败', 'error');
    }
    e.target.value = '';
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, BANNER_OPTS);
      updateUser({ banner: compressed });
      addToast('背景已更新');
    } catch {
      addToast('图片处理失败', 'error');
    }
    e.target.value = '';
  };

  const tabs: { key: ProfileTab; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'thought', label: '随想' },
    { key: 'diary', label: '日记' },
  ];

  const filteredPosts = useMemo(() => {
    switch (activeTab) {
      case 'thought':
        return posts.filter((p) => p.entryType === 'thought');
      case 'diary':
        return posts.filter((p) => p.entryType === 'diary');
      default:
        return posts;
    }
  }, [activeTab, posts]);

  const handleExport = (type: 'all' | 'diary' | 'thought' | 'month' | 'year') => {
    let postsToExport = posts;
    let filename: string;

    switch (type) {
      case 'diary':
        postsToExport = posts.filter((p) => p.entryType === 'diary');
        filename = `日记导出_${new Date().toISOString().slice(0, 10)}.md`;
        break;
      case 'thought':
        postsToExport = posts.filter((p) => p.entryType === 'thought');
        filename = `随想导出_${new Date().toISOString().slice(0, 10)}.md`;
        break;
      case 'month': {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        postsToExport = posts.filter((p) => new Date(p.createdAt) >= startOfMonth);
        filename = `本月记录_${new Date().toISOString().slice(0, 10)}.md`;
        break;
      }
      case 'year': {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        postsToExport = posts.filter((p) => new Date(p.createdAt) >= startOfYear);
        filename = `本年记录_${new Date().toISOString().slice(0, 10)}.md`;
        break;
      }
      default:
        filename = `全部记录_${new Date().toISOString().slice(0, 10)}.md`;
    }

    if (postsToExport.length === 0) {
      addToast('没有符合条件的记录', 'info');
      return;
    }

    exportAll(postsToExport, filename);
    addToast(`已导出 ${postsToExport.length} 条记录`);
    setShowExportMenu(false);
  };

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-x-dark border-b border-x-border">
        <div className="flex items-center gap-4 px-4 py-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-full hover:bg-x-hover transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
              <path d="M7.414 13l5.043 5.04-1.414 1.42L3.586 12l7.457-7.46 1.414 1.42L7.414 11H21v2H7.414z" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold">{currentUser.displayName}</h1>
            <p className="text-xs text-x-gray">{posts.length} 条记录</p>
          </div>
        </div>
      </div>

      {/* Banner (clickable to upload) */}
      <div
        className="relative h-[200px] bg-x-darker cursor-pointer group"
        onClick={() => bannerInputRef.current?.click()}
      >
        {currentUser.banner && (
          <Image src={currentUser.banner} alt="Banner" fill className="object-cover" unoptimized />
        )}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white">
            <path d="M9.697 3H11v2h-.697l-3 2H5c-.276 0-.5.224-.5.5v11c0 .276.224.5.5.5h14c.276 0 .5-.224.5-.5V10h2v8.5c0 1.381-1.119 2.5-2.5 2.5H5c-1.381 0-2.5-1.119-2.5-2.5v-11C2.5 6.119 3.619 5 5 5h1.697l3-2zM12 10.5c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3zm0-2c2.761 0 5 2.239 5 5s-2.239 5-5 5-5-2.239-5-5 2.239-5 5-5zM17 2c0 1.657-1.343 3-3 3v1c2.209 0 4-1.791 4-4h-1z" />
          </svg>
        </div>
        <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />
      </div>

      {/* Profile Info */}
      <div className="px-4 pb-3">
        <div className="flex justify-between items-end -mt-[68px] mb-3">
          {/* Avatar (clickable to upload) */}
          <div
            className="relative cursor-pointer group rounded-full"
            onClick={() => avatarInputRef.current?.click()}
          >
            <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="xl" className="border-4 border-x-dark" />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
                <path d="M9.697 3H11v2h-.697l-3 2H5c-.276 0-.5.224-.5.5v11c0 .276.224.5.5.5h14c.276 0 .5-.224.5-.5V10h2v8.5c0 1.381-1.119 2.5-2.5 2.5H5c-1.381 0-2.5-1.119-2.5-2.5v-11C2.5 6.119 3.619 5 5 5h1.697l3-2zM12 10.5c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3zm0-2c2.761 0 5 2.239 5 5s-2.239 5-5 5-5-2.239-5-5 2.239-5 5-5z" />
              </svg>
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          </div>
          <div className="flex gap-2 mb-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/settings')}>
              编辑资料
            </Button>
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setShowExportMenu(!showExportMenu)}>
                导出
              </Button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 bg-x-dark border border-x-border rounded-xl shadow-xl overflow-hidden z-50 min-w-[180px]">
                  <button onClick={() => handleExport('all')} className="w-full text-left px-4 py-2.5 hover:bg-x-hover text-sm text-white transition-colors">
                    导出全部
                  </button>
                  <button onClick={() => handleExport('diary')} className="w-full text-left px-4 py-2.5 hover:bg-x-hover text-sm text-white transition-colors">
                    只导出日记
                  </button>
                  <button onClick={() => handleExport('thought')} className="w-full text-left px-4 py-2.5 hover:bg-x-hover text-sm text-white transition-colors">
                    只导出随想
                  </button>
                  <div className="border-t border-x-border" />
                  <button onClick={() => handleExport('month')} className="w-full text-left px-4 py-2.5 hover:bg-x-hover text-sm text-white transition-colors">
                    导出本月
                  </button>
                  <button onClick={() => handleExport('year')} className="w-full text-left px-4 py-2.5 hover:bg-x-hover text-sm text-white transition-colors">
                    导出本年
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <h2 className="text-xl font-bold">{currentUser.displayName}</h2>
        <p className="text-x-gray">@{currentUser.username}</p>

        {currentUser.bio && <p className="mt-3 text-[15px]">{currentUser.bio}</p>}

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-x-gray">
          <span className="flex items-center gap-1">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <path d="M7 4V3h2v1h6V3h2v1h1.5C19.89 4 21 5.12 21 6.5v12c0 1.38-1.11 2.5-2.5 2.5h-13C4.12 21 3 19.88 3 18.5v-12C3 5.12 4.12 4 5.5 4H7zm0 2H5.5c-.27 0-.5.22-.5.5v12c0 .28.23.5.5.5h13c.28 0 .5-.22.5-.5v-12c0-.28-.22-.5-.5-.5H17v1h-2V6H9v1H7V6zm-1 4h12v2H6v-2z" />
            </svg>
            始于 {currentUser.joinedDate}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-x-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 py-4 text-center hover:bg-white/[0.03] transition-colors relative font-medium text-sm',
              activeTab === tab.key ? 'text-white' : 'text-x-gray'
            )}
          >
            {tab.label}
            {activeTab === tab.key && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-x-blue rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Posts */}
      <FeedList posts={filteredPosts} resetKey={activeTab} />
    </div>
  );
}
