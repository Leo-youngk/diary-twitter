import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/lib/context';
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
  themeColor: '#1d9bf0',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '日记本',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <body>
        <AppProvider>
          <div className="flex justify-center min-h-screen">
            <Sidebar />
            <main className="flex-1 max-w-[600px] border-x border-x-border min-h-screen pb-14 md:pb-0">
              {children}
            </main>
            <RightPanel />
          </div>
          <ComposeModal />
          <ReplyModal />
          <MobileComposeButton />
          <ToastContainer />
        </AppProvider>
      </body>
    </html>
  );
}
