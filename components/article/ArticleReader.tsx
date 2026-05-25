'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context';
import type { ArticleData } from '@/app/api/daily-article/route';

interface ArticleReaderProps {
  article: ArticleData;
  allLevels: ArticleData[];
  currentLevel: number;
  onChangeLevel: (level: number) => void;
  onClose: () => void;
}

export default function ArticleReader({
  article, allLevels, currentLevel, onChangeLevel, onClose,
}: ArticleReaderProps) {
  const { addPost, posts, addToast } = useApp();
  const [showSource, setShowSource] = useState(false);

  const handleSaveToDiary = () => {
    // Check duplicate
    const exists = posts.some(
      (p) => p.entryType === 'article' && p.title === article.title
    );
    if (exists) {
      addToast('这篇文章已经保存过了', 'info');
      return;
    }

    const content = `📖 ${article.title}\n\n${article.content}\n\n---\n🔗 Source: ${article.link}`;
    addPost(content, [], 'article', article.title);
    addToast('文章已保存到日记！');
    onClose();
  };

  // Split content into paragraphs
  const paragraphs = article.content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const availableLevels = allLevels.map((a) => a.level).sort();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-x-dark w-full max-w-[600px] min-h-screen md:min-h-0 md:my-6 md:rounded-2xl shadow-2xl border-0 md:border border-x-border">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-x-dark/90 backdrop-blur-md border-b border-x-border">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={onClose} className="p-2 rounded-full hover:bg-x-hover transition-colors">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z" />
              </svg>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xs text-x-gray bg-x-darker px-2 py-0.5 rounded-full">
                {article.category}
              </span>
            </div>
          </div>
        </div>

        {/* Level Switcher */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex gap-2">
            {availableLevels.map((lv) => (
              <button
                key={lv}
                onClick={() => onChangeLevel(lv)}
                className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${
                  currentLevel === lv
                    ? 'bg-amber-500 text-white'
                    : 'bg-x-darker text-x-gray hover:text-white'
                }`}
              >
                Level {lv}
              </button>
            ))}
          </div>
          <p className="text-xs text-x-gray mt-2">
            {currentLevel === 1 && '入门 · 简单词汇和短句'}
            {currentLevel === 2 && '中级 · 稍复杂的表达'}
            {currentLevel === 3 && '进阶 · 接近原文难度'}
          </p>
        </div>

        {/* Title */}
        <div className="px-4 pt-2 pb-4">
          <h1 className="text-xl font-bold leading-tight">{article.title}</h1>
          <p className="text-xs text-x-gray mt-2">
            {new Date(article.pubDate).toLocaleDateString('zh-CN', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
        </div>

        {/* Content */}
        <div className="px-4 pb-6">
          {paragraphs.map((para, i) => (
            <p
              key={i}
              className="text-[16px] leading-8 mb-4 text-inherit"
              style={{ wordSpacing: '2px' }}
            >
              {para}
            </p>
          ))}
        </div>

        {/* Source link */}
        <div className="px-4 pb-4">
          <button
            onClick={() => setShowSource(!showSource)}
            className="text-xs text-x-gray hover:text-x-blue transition-colors"
          >
            {showSource ? '隐藏来源' : '查看来源'}
          </button>
          {showSource && (
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-x-blue mt-1 hover:underline break-all"
            >
              {article.link}
            </a>
          )}
        </div>

        {/* Bottom Action Bar */}
        <div className="sticky bottom-0 bg-x-dark/90 backdrop-blur-md border-t border-x-border px-4 py-3">
          <div className="flex items-center justify-between">
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-x-gray hover:text-x-blue transition-colors text-sm flex items-center gap-1"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M15.36 4.96c1.48-1.48 3.89-1.48 5.37 0s1.48 3.89 0 5.37l-4.24 4.24a3.8 3.8 0 01-5.37 0 .75.75 0 011.06-1.06 2.3 2.3 0 003.24 0l4.24-4.24a2.3 2.3 0 000-3.24 2.3 2.3 0 00-3.24 0l-1.77 1.77a.75.75 0 01-1.06-1.06l1.77-1.78zm-6.72 6.72a3.8 3.8 0 015.37 0 .75.75 0 01-1.06 1.06 2.3 2.3 0 00-3.24 0l-4.24 4.24a2.3 2.3 0 000 3.24 2.3 2.3 0 003.24 0l1.77-1.77a.75.75 0 011.06 1.06l-1.77 1.78c-1.48 1.48-3.89 1.48-5.37 0s-1.48-3.89 0-5.37l4.24-4.24z" />
              </svg>
              原文
            </a>

            <button
              onClick={handleSaveToDiary}
              className="bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-full px-5 py-2 text-sm transition-colors flex items-center gap-1.5"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z" />
              </svg>
              收藏到日记
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
