import { useRef, useState } from 'react';
import type { ActivityComponentType } from '@stackflow/react';
import { useNav } from '@/app/nav';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import { setPreference, usePreferences, type FontFamily, type FontSize, type ScrollChrome, type Theme } from '@/app/preferences';
import { toast } from '@/app/toast';
import Avatar from '@/components/Avatar';
import { SubstackLogo, XLogo } from '@/components/Icon';
import ScreenHeader from '@/components/ScreenHeader';
import { sendSubstackCommand, sendXCommand, updateProfile } from '@/data/actions';
import { downloadBackup, parseBackup, restoreBackup } from '@/data/backup';
import { imageSrc, storeImage } from '@/data/blobs';
import { getDeviceId } from '@/data/auth';
import { useConnection } from '@/data/connection';
import { useDevices, useProfile, useSubstackPosts, useXPosts } from '@/data/hooks';
import { saveLocal, store } from '@/data/store';
import { AVATAR_OPTS, BANNER_OPTS, compressImage } from '@/lib/image';
import type { ProfileValues, XCommand, XPostRow } from '@/lib/schema';
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

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors', checked ? 'bg-x-green' : 'bg-x-border')}
    >
      <span className={cn('absolute left-0.5 top-0.5 h-[27px] w-[27px] rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
    </button>
  );
}

/** A delivery's status line, then what is on its way and what failed (with retry / give up). */
function DeliveryRows({ network, logo, rows, command }: {
  network: 'X' | 'Substack';
  logo: React.ReactNode;
  rows: Record<string, XPostRow>;
  command: (id: string, command: Exclude<XCommand, ''>) => void;
}) {
  const entries = Object.entries(rows);
  const failed = entries.filter(([, row]) => row.state === 'failed');
  const pending = entries.filter(([, row]) => row.state === 'queued' || row.state === 'sending' || row.state === 'publishing');
  const sent = entries.filter(([, row]) => row.state === 'sent').length;
  const textOf = (id: string, kind: string) => String(
    (kind === 'reply' ? store.getCell('replies', id, 'content') : store.getCell('posts', id, 'content')) ?? '',
  );
  return (
    <>
      <Row label="状态">
        {logo}
        <span>{pending.length > 0 ? `${pending.length} 条正在发` : `已发出 ${sent} 条`}{failed.length > 0 && ` · ${failed.length} 条失败`}</span>
      </Row>
      {pending.map(([id, row]) => (
        <div key={id} className="border-t border-x-border px-4 py-3 text-[13px]">
          <p className="line-clamp-2">{textOf(id, row.kind) || '（已删除）'}</p>
          <p className="mt-1 text-x-gray">{row.error || (row.state === 'publishing'
            ? `Buffer 已接收，正在核对 ${network} 发布状态；不会重复发布`
            : row.state === 'sending' ? '正在确认发送结果；暂时不要重复发布' : `等待发送到 ${network}`)}</p>
        </div>
      ))}
      {failed.map(([id, row]) => (
        <div key={id} className="border-b border-x-border px-4 py-3 last:border-b-0">
          <p className="line-clamp-2 text-[15px]">{row.kind === 'reply' ? '追加：' : ''}{textOf(id, row.kind) || '（已删除）'}</p>
          <p className="mt-1 text-[13px] text-x-danger">{row.error}</p>
          <div className="mt-2 flex gap-4 text-[15px]">
            <button type="button" onClick={() => command(id, 'retry')} className="font-semibold text-x-blue">重试</button>
            <button type="button" onClick={() => command(id, 'dismiss')} className="text-x-gray">放弃</button>
          </div>
        </div>
      ))}
    </>
  );
}

function XSection() {
  const profile = useProfile();
  const xposts = useXPosts();
  return (
    <Section title="同步到 X" footer="新帖默认经 Buffer 发到 X，也可选择暂不同步，保存后再点击「同步到 X」。已支持 X Premium 长文；追加会以引用原帖的形式发出。之后在这里编辑或删除，不会改动 X 上的内容。">
      <Row label="发帖时默认同步到 X">
        <Switch checked={profile.xSyncEnabled} onChange={(xSyncEnabled) => updateProfile({ xSyncEnabled })} />
      </Row>
      <DeliveryRows network="X" logo={<XLogo size={12} />} rows={xposts} command={sendXCommand} />
    </Section>
  );
}

function SubstackSection() {
  const profile = useProfile();
  const notes = useSubstackPosts();
  return (
    <Section title="同步到 Substack" footer="经 Buffer 发成 Substack Note（Buffer 免费版即可）：先在 Buffer 里连接 Substack，再打开这里。之后发到 X 的新帖也会发一条 Note，用 + 写的几条合成一条，追加单独发一条并附上原 Note 的链接。只发文字，不发长文；在这里编辑或删除，不会改动 Substack 上的内容。">
      <Row label="发到 X 的帖子也发到 Substack">
        <Switch checked={profile.substackSyncEnabled} onChange={(substackSyncEnabled) => updateProfile({ substackSyncEnabled })} />
      </Row>
      {(profile.substackSyncEnabled || Object.keys(notes).length > 0) && (
        <DeliveryRows network="Substack" logo={<SubstackLogo size={12} />} rows={notes} command={sendSubstackCommand} />
      )}
    </Section>
  );
}

function seenText(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 2) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return new Date(at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

/** Every device that has connected, with the version it last ran. */
function DevicesSection() {
  const devices = useDevices();
  const self = getDeviceId();
  if (devices.length === 0) return null;
  return (
    <Section title="设备" footer="新设备第一次打开时输入一次口令，之后自动同步。版本和本机不同的设备，重新打开一次 App 就会更新。">
      {devices.map((device) => {
        const mine = device.id === self;
        const outdated = !mine && device.build !== __BUILD_ID__;
        return (
          <div key={device.id} className="flex min-h-[48px] items-center gap-3 border-b border-x-border px-4 py-2 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px]">{device.name || '未知设备'}{mine && <span className="ml-2 text-[13px] text-x-blue">本机</span>}</p>
              <p className={cn('truncate text-[12px]', outdated ? 'text-x-danger' : 'text-x-gray')}>{device.build || '未知版本'}{outdated && ' · 与本机版本不同'}</p>
            </div>
            <span className="shrink-0 text-[13px] text-x-gray">{mine ? '在线' : seenText(device.seenAt)}</span>
          </div>
        );
      })}
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
  const [busy, setBusy] = useState(false);

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

  const changeTheme = async (theme: Theme) => {
    if (theme === prefs.theme) return;
    setPreference('theme', theme);
    // iOS colours a home-screen app's status bar once, at load; only a reload repaints it.
    if ((navigator as Navigator & { standalone?: boolean }).standalone !== true) return;
    // A tap on iOS does not blur the profile field being edited, and it saves on blur.
    (document.activeElement as HTMLElement | null)?.blur();
    await saveLocal().catch(() => undefined);
    location.reload();
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
              <Segmented<Theme> value={prefs.theme} onChange={(v) => { void changeTheme(v); }} options={[['zen', '禅'], ['light', '浅色'], ['dark', '深色']]} />
            </Row>
            <Row label="字体">
              <Segmented<FontFamily> value={prefs.font} onChange={(v) => setPreference('font', v)} options={[['system', '苹方'], ['noto', '思源'], ['song', '宋体']]} />
            </Row>
            <Row label="字号">
              <Segmented<FontSize> value={prefs.fontSize} onChange={(v) => setPreference('fontSize', v)} options={[['small', '小'], ['medium', '中'], ['large', '大'], ['xlarge', '特大']]} />
            </Row>
            <Row label="滑动时收起">
              <Segmented<ScrollChrome> value={prefs.chrome} onChange={(v) => setPreference('chrome', v)} options={[['both', '上下'], ['header', '只顶栏'], ['none', '不收']]} />
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
          <SubstackSection />

          <Section title="数据">
            <Row label="同步"><span className={cn(connection.state === 'offline' && 'text-x-danger')}>{syncText}</span></Row>
            <Row label="导出完整备份" onClick={() => { void downloadBackup().then(() => toast('备份已导出'), () => toast('导出失败', 'error')); }} />
            <Row label={busy ? '正在恢复…' : '从备份恢复'} onClick={() => backupRef.current?.click()} />
            <Row label="我的记录" onClick={() => push('Profile', {})} />
          </Section>

          <DevicesSection />


          <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pickImage(e.target.files?.[0], 'avatar'); e.target.value = ''; }} />
          <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pickImage(e.target.files?.[0], 'banner'); e.target.value = ''; }} />
          <input ref={backupRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { void importBackup(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>
    </AppScreen>
  );
};

export default SettingsActivity;
