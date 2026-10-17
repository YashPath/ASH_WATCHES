import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Assistant } from '@/components/Assistant';

export const metadata: Metadata = {
  title: { default: 'ASH_ — Considered timepieces', template: '%s · ASH_' },
  description: 'Explore watches in 3D, find the right one with natural-language search, and check out securely.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          <main id="main">{children}</main>
          <Footer />
          <Assistant />
        </Providers>
      </body>
    </html>
  );
}
