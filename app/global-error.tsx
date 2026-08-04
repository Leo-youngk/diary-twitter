'use client';

// Replaces the root layout entirely when the layout itself throws, so it has to
// ship its own <html>/<body> and can't rely on any app styles.
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ background: '#000', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ padding: '80px 24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>应用崩溃了</h1>
          <p style={{ fontSize: 14, color: '#71767b', marginBottom: 24 }}>
            你的记录保存在本机，刷新后应该还在。
          </p>
          <button
            onClick={reset}
            style={{
              padding: '8px 20px', background: '#1d9bf0', color: '#fff',
              fontSize: 14, fontWeight: 700, border: 'none',
              borderRadius: 9999, cursor: 'pointer',
            }}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
