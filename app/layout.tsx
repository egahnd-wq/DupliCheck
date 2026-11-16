import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono, Sora } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
});

const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const viewport: Viewport = {
  themeColor: '#0F2342',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'DupliCheck — Aplikasi Deteksi Nama & Nomor HP Ganda',
  description:
    'Deteksi nama dan nomor HP ganda dari file VCF, gabungkan satu nama dengan beda nomor, dan hasilkan satu file VCF yang rapi.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'DupliCheck',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'DupliCheck — Aplikasi Deteksi Nama & Nomor HP Ganda',
    description:
      'Deteksi nama dan nomor HP ganda dari file VCF, gabungkan satu nama dengan beda nomor, dan hasilkan satu file VCF yang rapi.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DupliCheck — Aplikasi Deteksi Nama & Nomor HP Ganda',
    description:
      'Deteksi nama dan nomor HP ganda dari file VCF, gabungkan satu nama dengan beda nomor, dan hasilkan satu file VCF yang rapi.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`${plusJakarta.variable} ${sora.variable} ${jetbrainsMono.variable}`}>
      <body
        className="min-h-screen bg-[#EEF2F7] font-sans text-slate-900 antialiased selection:bg-blue-100 selection:text-blue-900"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
