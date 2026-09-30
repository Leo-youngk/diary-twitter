import { useRef, useState } from 'react';
import type { ActivityComponentType } from '@stackflow/react';
import { useNav } from '@/app/nav';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import { setPreference, usePreferences, type FontFamily, type FontSize, type Theme } from '@/app/preferences';
import { toast } from '@/app/toast';
import Avatar from '@/components/Avatar';
import { XLogo } from '@/components/Icon';
import ProbePanel from '@/components/ProbePanel';
import ScreenHeader from '@/components/ScreenHeader';
import { sendXCommand, updateProfile } from '@/data/actions';
import { downloadBackup, parseBackup, restoreBackup } from '@/data/backup';
import { imageSrc, storeImage } from '@/data/blobs';
import { useConnection } from '@/data/connection';
import { useProfile, useXPosts } from '@/data/hooks';
import { store } from '@/data/store';
import { getSyncCode, isValidSyncCode, setSyncCode } from '@/data/syncCode';
import { AVATAR_OPTS, BANNER_OPTS, compressImage } from '@/lib/image';
import type { ProfileValues } from '@/lib/schema';
import { cn } from '@/lib/utils';

function Section({ title, footer, children }: { title: string; footer?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="px-5 pb-1.5 text-[13px] text-x-gray">{title}</h2>
      <div className="mx-4 overflow-hidden rounded-2xl bg-x-darker">{children}</div>
      {footer && <p className="px-5 pt-1.5 text-[12px] leading-relaxed text-x-gray">{footer}</p>}
    </section>
  );
}

function Row({ label, children, onClick }: { label: string; children?: React.ReactNode; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn('flex min-h-[48px] w-full items-center gap-3 border-b border-x-border px-4 py-2 text-left last:border-b-0', onClick && 'active:bg-x-hover')}
    >
      <span className="shrink-0 text-[16px]">{label}</span>
      <div className="ml-auto flex min-w-0 items-center justify-end gap-2 text-[15px] text-x-gray">{children}</div>
    </Tag>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-x-dark p-0.5">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn('rounded-md px-3 py-1 text-[14px]', value === key ? 'bg-x-darker font-semibold text-x-fg shadow-sm' : 'text-x-gray')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** A text field that saves when it loses focus. Remounted (keyed by value) when the value changes elsewhere. */
function Field({ label, field, value, multiline, type }: { label: string; field: keyof ProfileValues; value: string; multiline?: boolean; type?: string }) {
  const [draft, setDraft] = useState(value);
  const save = () => { if (draft !== value) updateProfile({ [field]: draft.trim() } as Partial<ProfileValues>); };
  const common = 'min-w-0 flex-1 bg-transparent text-right text-[15px] text-x-fg outline-none';
  return (
    <Row label={label}>
      {multiline
        ? <textarea value={draft} rows={2} onChange={(e) => setDraft(e.target.value)} onBlur={save} className={cn(common, 'resize-none text-left')} />
        : <input value={draft} type={type ?? 'text'} onChange={(e) => setDraft(e.target.value)} onBlur={save} className={common} />}
    </Row>
  );
}

function XSection() {
  const profile = useProfile();
  const xposts = useXPosts();
  const entries = Object.entries(xposts);
  const failed = entries.filter(([, row]) => row.state === 'failed');
  const pending = entries.filter(([, row]) => row.state === 'queued' || row.state === 'sending' || row.state === 'publishing');
  const sent = entries.filter(([, row]) => row.state === 'sent').length;
  const textOf = (id: string, kind: string) => String(
    (kind === 'reply' ? store.getCell('replies', id, 'content') : store.getCell('posts', id, 'content')) ?? '',
  );

  return (
    <Section title="同步到 X" footer="新帖默认经 Buffer 发到 X，发帖页可以单独关掉某一条；已同步帖子下的追加会以引用原帖的形式发出。之后在这里编辑或删除，不会改动 X 上的内容。超过 140 个汉字的只保存在本地。">
      <Row label="发帖时默认同步到 X">
        <button
          type="button"
          role="switch"
          aria-checked={profile.xSyncEnabled}
          onClick={() => updateProfile({ xSyncEnabled: !profile.xSyncEnabled })}
          className={cn('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors', profile.xSyncEnabled ? 'bg-x-green' : 'bg-x-border')}
        >
          <span className={cn('absolute left-0.5 top-0.5 h-[27px] w-[27px] rounded-full bg-white shadow transition-transform', profile.xSyncEnabled && 'translate-x-5')} />
        </button>
      </Row>
      <Row label="状态">
        <XLogo size={12} />
        <span>{pending.length > 0 ? `${pending.length} 条正在发` : `已发出 ${sent} 条`}{failed.length > 0 && ` · ${failed.length} 条失败`}</span>
      </Row>
      {pending.map(([id, row]) => (
        <div key={id} className="border-t border-x-border px-4 py-3 text-[13px]">
          <p className="line-clamp-2">{textOf(id, row.kind) || '（已删除）'}</p>
          <p className="mt-1 text-x-gray">{row.error || (row.state === 'publishing'
            ? 'Buffer 已接收，正在核对 X 发布状态；不会重复发布'
            : row.state === 'sending' ? '正在确认发送结果；暂时不要重复发布' : '等待发送到 X')}</p>
        </div>
      ))}
      {failed.map(([id, row]) => (
        <div key={id} className="border-b border-x-border px-4 py-3 last:border-b-0">
          <p className="line-clamp-2 text-[15px]">{row.kind === 'reply' ? '追加：' : ''}{textOf(id, row.kind) || '（已删除）'}</p>
          <p className="mt-1 text-[13px] text-x-danger">{row.error}</p>
          <div className="mt-2 flex gap-4 text-[15px]">
            <button type="button" onClick={() => sendXCommand(id, 'retry')} className="font-semibold text-x-blue">重试</button>
            <button type="button" onClick={() => sendXCommand(id, 'dismiss')} className="text-x-gray">放弃</button>
          </div>
        </div>
      ))}
    </Section>
  );
}

const SettingsActivity: ActivityComponentType<'Settings'> = () => {
  const prefs = usePreferences();
  const profile = useProfile();
  const connection = useConnection();
  const { push } = useNav();
  const avatarRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const [restoreCode, setRestoreCode] = useState('');
  const [busy, setBusy] = useState(false);
  const code = getSyncCode();

  const pickImage = async (file: File | undefined, field: 'avatar' | 'banner') => {
    if (!file) return;
    try {
      const ref = await storeImage(await compressImage(file, field === 'avatar' ? AVATAR_OPTS : BANNER_OPTS));
      updateProfile({ [field]: ref });
      toast(field === 'avatar' ? '头像已更新' : '背景已更新');
    } catch {
      toast('图片处理失败', 'error');
    }
  };

  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const parsed = parseBackup(JSON.parse(await file.text()));
      if (!parsed) { toast('备份文件格式不对', 'error'); return; }
      const goals = parsed.goals ? `、${parsed.counts.goals} 个目标` : '';
      if (!window.confirm(`用这份备份（${parsed.counts.posts} 条记录、${parsed.counts.replies} 条追加${goals}）替换现在的全部内容？`)) return;
      await restoreBackup(parsed);
      toast('备份已恢复');
    } catch {
      toast('读不了这个文件', 'error');
    } finally {
      setBusy(false);
    }
  };

  const switchCode = () => {
    const next = restoreCode.trim();
    if (!isValidSyncCode(next)) { toast('同步码格式不对', 'error'); return; }
    if (next === code) { toast('这就是本设备的同步码', 'info'); return; }
    if (!window.confirm('切换到这个同步码后，本设备会显示那边的数据。现在的同步码请先记下来。继续？')) return;
    setSyncCode(next);
    window.location.replace('/');
  };

  const syncText = connection.state === 'online'
    ? `已连接${connection.syncedAt ? ` · ${new Date(connection.syncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 同步` : ''}`
    : connection.state === 'connecting' ? '正在连接…' : '离线，改动保存在本机，联网后自动同步';

  return (
    <AppScreen>
      <div className="flex h-full flex-col">
        <ScreenHeader title="设置" />
        <div data-scroll-root className="relative flex-1 overflow-y-auto pb-16">
          <Section title="外观">
            <Row label="主题">
              <Segmented<Theme> value={prefs.theme} onChange={(v) => setPreference('theme', v)} options={[['zen', '禅'], ['light', '浅色'], ['dark', '深色']]} />
            </Row>
            <Row label="字体">
              <Segmented<FontFamily> value={prefs.font} onChange={(v) => setPreference('font', v)} options={[['system', '苹方'], ['noto', '思源'], ['song', '宋体']]} />
            </Row>
            <Row label="字号">
              <Segmented<FontSize> value={prefs.fontSize} onChange={(v) => setPreference('fontSize', v)} options={[['small', '小'], ['medium', '中'], ['large', '大'], ['xlarge', '特大']]} />
            </Row>
          </Section>

          <Section title="个人资料">
            <Row label="头像" onClick={() => avatarRef.current?.click()}>
              <Avatar src={profile.avatar} name={profile.displayName} size={36} />
            </Row>
            <Row label="背景图" onClick={() => bannerRef.current?.click()}>
              {profile.banner ? <img src={imageSrc(profile.banner)} alt="" className="h-9 w-20 rounded-md object-cover" /> : <span>未设置</span>}
            </Row>
            <Field key={`n${profile.displayName}`} label="昵称" field="displayName" value={profile.displayName} />
            <Field key={`u${profile.username}`} label="用户名" field="username" value={profile.username} />
            <Field key={`b${profile.bio}`} label="简介" field="bio" value={profile.bio} multiline />
            <Field key={`d${profile.birthDate}`} label="出生日期" field="birthDate" value={profile.birthDate} type="date" />
          </Section>
          <p className="px-5 pt-1.5 text-[12px] text-x-gray">出生日期只用于日历里的「人生周历」。</p>

          <XSection />

          <Section title="数据" footer="任何拿到同步码的人都能看到你的数据，不要分享给别人。">
            <Row label="同步"><span className={cn(connection.state === 'offline' && 'text-x-danger')}>{syncText}</span></Row>
            <Row label="本设备同步码" onClick={() => { void navigator.clipboard.writeText(code).then(() => toast('已复制'), () => toast('复制失败', 'error')); }}>
              <span className="truncate font-mono text-[13px]">{code.slice(0, 8)}…</span>
              <span className="text-x-blue">复制</span>
            </Row>
            <div className="flex items-center gap-2 border-b border-x-border px-4 py-2.5">
              <input
                value={restoreCode}
                onChange={(e) => setRestoreCode(e.target.value)}
                placeholder="粘贴其他设备的同步码"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-x-gray"
              />
              <button type="button" onClick={switchCode} disabled={!restoreCode.trim()} className="font-semibold text-x-blue disabled:opacity-40">恢复</button>
            </div>
            <Row label="导出完整备份" onClick={() => { void downloadBackup().then(() => toast('备份已导出'), () => toast('导出失败', 'error')); }} />
            <Row label={busy ? '正在恢复…' : '从备份恢复'} onClick={() => backupRef.current?.click()} />
            <Row label="我的记录" onClick={() => push('Profile', {})} />
          </Section>

          <ProbePanel />

          <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pickImage(e.target.files?.[0], 'avatar'); e.target.value = ''; }} />
          <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pickImage(e.target.files?.[0], 'banner'); e.target.value = ''; }} />
          <input ref={backupRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { void importBackup(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>
    </AppScreen>
  );
};

export default SettingsActivity;
