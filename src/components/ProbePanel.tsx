import { useState } from 'react';
import { probeReport } from '@/app/perfProbe';

/** TEMPORARY — 设置 → 性能诊断. Remove together with app/perfProbe.ts. */
export default function ProbePanel() {
  const [report, setReport] = useState(probeReport);
  const worst = (kind: string) => {
    const list = report.entries.filter((e) => e.kind === kind);
    return list.length === 0 ? '无' : `${list.length} 次，最长 ${Math.round(Math.max(...list.map((e) => e.ms ?? 0)))}ms`;
  };
  const fastest = Math.max(0, ...report.entries.filter((e) => e.kind === '滚动').map((e) => parseInt(e.note ?? '0', 10)));

  return (
    <section className="mt-6 px-4">
      <h2 className="px-1 pb-1.5 text-[13px] text-x-gray">性能诊断（排查完会删掉）</h2>
      <div className="rounded-2xl bg-x-darker p-4 text-[13px] leading-relaxed">
        <p>版本 {__BUILD_ID__}</p>
        <p>记录的是：{report.session}后 30 秒</p>
        <p>主线程阻塞：{worst('主线程阻塞')}</p>
        <p>掉帧（JS 空闲时）：{worst('掉帧')}</p>
        <p>触摸处理 &gt;4ms：{worst('触摸处理')}</p>
        <p>最快滚动：{fastest}px/s</p>
        <div className="mt-2 max-h-72 overflow-y-auto border-t border-x-border pt-2 font-mono text-[11px] leading-5 text-x-gray">
          {report.entries.map((e, i) => (
            <div key={i}>
              {(e.at / 1000).toFixed(2)}s {e.kind}{e.ms !== undefined ? ` ${Math.round(e.ms)}ms` : ''}{e.note ? ` ${e.note}` : ''}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setReport(probeReport())} className="mt-2 font-semibold text-x-blue">刷新</button>
      </div>
    </section>
  );
}
