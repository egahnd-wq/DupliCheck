'use client';

import React, { useState } from 'react';
import { Smartphone, X, MoreVertical, Share, WifiOff } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState<'android' | 'ios' | null>(null);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-xl bg-[#0F2342] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#1E3A8A] whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Smartphone className="h-4 w-4 text-teal-300" aria-hidden="true" />
        Instal Aplikasi (Offline)
      </button>
    );
  }

  if (isAndroid || isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuideModal(isIOS ? 'ios' : 'android')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-[#0F2342] shadow-xs transition-colors hover:border-blue-300 hover:bg-blue-50/70 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="h-4 w-4 text-teal-700" aria-hidden="true" />
          {isIOS ? 'Pasang di iPhone' : 'Pasang ke HP Android'}
        </button>

        {showGuideModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Panduan pemasangan aplikasi offline"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          >
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-bold text-[#0F2342]">
                  {showGuideModal === 'ios'
                    ? 'Pasang DupliCheck di iPhone / iPad'
                    : 'Pasang DupliCheck di HP Android'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(null)}
                  aria-label="Tutup panduan"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {showGuideModal === 'android' ? (
                <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-700">
                  <li className="flex items-start gap-2">
                    <span className="font-mono font-bold text-blue-700">1.</span>
                    <span>
                      Buka alamat aplikasi ini langsung di browser <strong>Chrome Android</strong> (bukan di dalam jendela preview).
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-mono font-bold text-blue-700">2.</span>
                    <span>
                      Ketuk ikon menu{' '}
                      <MoreVertical className="inline h-4 w-4 align-text-bottom text-slate-700" aria-hidden="true" />{' '}
                      di pojok kanan atas Chrome.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-mono font-bold text-blue-700">3.</span>
                    <span>
                      Pilih <strong>Instal aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>. Aplikasi siap dipakai offline tanpa internet.
                    </span>
                  </li>
                </ol>
              ) : (
                <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-700">
                  <li className="flex items-start gap-2">
                    <span className="font-mono font-bold text-blue-700">1.</span>
                    <span>
                      Ketuk tombol{' '}
                      <Share className="inline h-4 w-4 align-text-bottom text-blue-700" aria-hidden="true" />{' '}
                      <strong>Share</strong> di bar Safari.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-mono font-bold text-blue-700">2.</span>
                    <span>
                      Gulir ke bawah lalu pilih <strong>Add to Home Screen</strong>.
                    </span>
                  </li>
                </ol>
              )}

              <button
                type="button"
                onClick={() => setShowGuideModal(null)}
                className="mt-5 w-full rounded-xl bg-[#0F2342] py-2.5 text-sm font-semibold text-white hover:bg-[#1E3A8A] transition-colors cursor-pointer"
              >
                Mengerti
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 shadow-md"
    >
      <WifiOff className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
      Mode Offline — Aplikasi tetap berjalan lokal
    </div>
  );
};
