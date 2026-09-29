'use client';

import { useCallback, useEffect, useState } from 'react';
import { actOnXSync, fetchXSyncStatus, type XSyncStatus } from '@/lib/xSync';

export default function XSyncCard({ syncId }: { syncId: string }) {
  const [status, setStatus] = useState<XSyncStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!syncId) return;
    setStatus(await fetchXSyncStatus(syncId));
    setLoaded(true);
  }, [syncId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const act = async (action: 'retry' | 'dismiss', postId?: string) => {
    setBusy(true);
    const next = await actOnXSync(syncId, action, postId);
    if (next) setStatus(next);
    setBusy(false);
  };

  let summary = '正在读取…';
  if (loaded && !status) summary = '读取失败，请检查网络后重试';
  else if (status && !status.enabled) summary = '服务端未配置 Buffer，随想不会发到 X';
  else if (status && status.failed.length > 0) summary = `${status.failed.length} 条同步失败`;
  else if (status && (status.inProgress > 0 || status.publishing > 0)) summary = '同步中…';
  else if (status?.lastSent) summary = `上次发布 ${new Date(status.lastSent.at).toLocaleString('zh-CN')}`;
  else if (status) summary = '还没有同步过';

  return (
    <div className="border border-x-border rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-x-gray mb-1">同步到 X（经 Buffer）</p>
          <p className="text-sm">{summary}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {status?.lastSent?.link && (
            <a
              href={status.lastSent.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-x-blue hover:underline"
            >
              查看
            </a>
          )}
          <button onClick={() => void refresh()} className="text-sm text-x-blue hover:underline">
            刷新
          </button>
        </div>
      </div>
      <p className="text-xs text-x-gray mt-2">
        发随想时打开「同步到 X」即可。只同步新发的文字，之后的编辑和删除不会改动 X 上的帖子。
      </p>

      {status?.failed.map((item) => (
        <div key={item.postId} className="mt-3 rounded-lg bg-x-darker p-3">
          <p className="text-sm break-words">{item.preview || '（无内容）'}</p>
          <p className="text-xs text-x-danger mt-1 break-words">{item.message}</p>
          <div className="mt-2 flex gap-4">
            <button
              onClick={() => void act('retry', item.postId)}
              disabled={busy || !status.enabled}
              className="text-sm font-bold text-x-blue disabled:opacity-50"
            >
              重试
            </button>
            <button
              onClick={() => void act('dismiss', item.postId)}
              disabled={busy}
              className="text-sm text-x-gray hover:text-x-fg disabled:opacity-50"
            >
              放弃
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
