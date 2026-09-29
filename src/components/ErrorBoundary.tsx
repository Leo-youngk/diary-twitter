import { Component, type ReactNode } from 'react';

/**
 * A render error must never leave a blank screen. The data is safe in the
 * local database either way, so the way out is simply to reload.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[app] render failed', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-10 text-center">
        <p className="text-[17px] font-semibold">页面出了点问题</p>
        <p className="text-[14px] leading-relaxed text-x-gray">你的记录都保存在本机，重新加载即可继续。</p>
        <button
          type="button"
          onClick={() => window.location.replace('/')}
          className="rounded-full bg-x-fg px-6 py-2 text-[15px] font-semibold text-x-dark"
        >
          重新加载
        </button>
      </div>
    );
  }
}
