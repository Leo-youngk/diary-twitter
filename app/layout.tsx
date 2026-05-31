import type { Metadata, Viewport } from 'next';
import { Noto_Sans_SC } from 'next/font/google';
import './globals.css';

const notoSansSC = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  preload: false, // Chinese font — load on demand, not blocking
  variable: '--font-noto',
});
import { AppProvider } from '@/lib/context';
import AppShell from '@/components/layout/AppShell';
import Sidebar from '@/components/layout/Sidebar';
import RightPanel from '@/components/layout/RightPanel';
import ComposeModal from '@/components/post/ComposeModal';
import ReplyModal from '@/components/post/ReplyModal';
import ToastContainer from '@/components/common/Toast';
import MobileComposeButton from '@/components/common/MobileComposeButton';

export const metadata: Metadata = {
  title: '我的日记本',
  description: '推特风格的个人日记，随时记录想法',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '日记本',
  },
};

// Viewport must be exported separately in Next.js 14+
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',   // ← critical for iOS full-screen PWA
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={`dark ${notoSansSC.variable}`} suppressHydrationWarning>
      <body className={notoSansSC.className}>
        <AppProvider>
          <AppShell>
            <div className="flex justify-center min-h-screen">
              <Sidebar />
              <main className="flex-1 min-w-0 max-w-[600px] border-x border-x-border overflow-x-hidden min-h-screen pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
                {children}
              </main>
              <RightPanel />
            </div>
            <ComposeModal />
            <ReplyModal />
            <MobileComposeButton />
          </AppShell>
          <ToastContainer />
        </AppProvider>
      </body>
    </html>
  );
}
