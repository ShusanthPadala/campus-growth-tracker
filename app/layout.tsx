import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Shell } from '@/components/Shell';

export const metadata: Metadata = { title: 'Campus Growth Tracker', description: 'Free workshop: Build Your First AI Project in 60 Minutes. Simulated campaign — not an official NxtWave page.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const showDemo = process.env.ENABLE_PUBLIC_DEMO !== 'false';
  return (
    <html lang="en">
      <body><Shell showDemo={showDemo}>{children}</Shell></body>
    </html>
  );
}
