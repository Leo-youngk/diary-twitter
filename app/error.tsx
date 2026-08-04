'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="px-6 py-20 text-center">
      <h1 className="text-xl font-bold mb-2">这一页出了点问题</h1>
      <p className="text-x-gray text-sm mb-6">你的记录还在本机，没有丢失。</p>
      <button
        onClick={reset}
        className="px-5 py-2 bg-x-blue text-white text-sm font-bold rounded-full hover:bg-x-blue/90 transition-colors"
      >
        重试
      </button>
    </div>
  );
}
