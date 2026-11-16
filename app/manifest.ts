import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'DupliCheck — Perapi Kontak VCF',
    short_name: 'DupliCheck',
    description:
      'Deteksi nama dan nomor HP ganda dari file VCF, gabungkan satu nama dengan beda nomor, dan hasilkan satu file VCF yang rapi secara offline.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#EEF2F7',
    theme_color: '#0F2342',
    icons: [
      {
        src: '/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
