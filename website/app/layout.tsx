import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Provider } from '@/components/provider';
import './global.css';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://davidecarvalho.github.io/nestjs-notifications'),
  title: {
    default: 'nestjs-notifications',
    template: '%s — nestjs-notifications',
  },
  description:
    'Laravel-style notifications for NestJS — one notification, many channels (mail, database, broadcast, Slack), delivered synchronously or queued through your own dispatcher.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
