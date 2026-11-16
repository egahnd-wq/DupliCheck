'use client';

import React, { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload,
  Download,
  Copy,
  Check,
  Search,
  Trash2,
  RotateCcw,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  buildVCF,
  parseVCF,
  processContacts,
  type CleanContact,
  type ConflictMode,
  type PhoneFormatMode,
  type ProcessOptions,
  type RawContact,
} from '@/lib/vcf';
import { OfflineIndicator, PWAInstallButton } from '@/components/PWAInstallButton';

type ActiveTab = 'all' | 'multi' | 'conflict' | 'raw';

export default function VcfWorkspace() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rawContacts, setRawContacts] = useState<RawContact[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedNotice, setCopiedNotice] = useState(false);

  // User-configurable options
  const [normalizeIndonesia, setNormalizeIndonesia] = useState(true);
  const [mergeSameName, setMergeSameName] = useState(true);
  const [removeEmpty, setRemoveEmpty] = useState(true);
  const [autoDownload, setAutoDownload] = useState(false);
  const [phoneFormat, setPhoneFormat] = useState<PhoneFormatMode>('plus62');
  const [conflictMode, setConflictMode] = useState<ConflictMode>('first');

  // Local edited contacts state (derived on pipeline run, editable inline)
  const [editedContacts, setEditedContacts] = useState<CleanContact[] | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const options: ProcessOptions = useMemo(
    () => ({
      normalizeIndonesia,
      mergeSameName,
      removeEmpty,
      phoneFormat,
      conflictMode,
    }),
    [normalizeIndonesia, mergeSameName, removeEmpty, phoneFormat, conflictMode]
  );

  const computedResult = useMemo(() => {
    if (rawContacts.length === 0) return null;
    return processContacts(rawContacts, options);
  }, [rawContacts, options]);

  const contacts = useMemo(
    () => editedContacts ?? computedResult?.contacts ?? [],
    [editedContacts, computedResult]
  );

  const liveVcfText = useMemo(() => {
    if (editedContacts) {
      return buildVCF(editedContacts);
    }
    return computedResult?.vcfText ?? '';
  }, [editedContacts, computedResult]);

  const stats = useMemo(() => {
    if (!computedResult) return null;
    if (!editedContacts) return computedResult.stats;

    return {
      ...computedResult.stats,
      multiNumberCount: editedContacts.filter((c) => c.phones.length > 1).length,
      conflictCount: editedContacts.filter((c) => c.isConflict).length,
      finalCount: editedContacts.length,
    };
  }, [computedResult, editedContacts]);

  const triggerDownload = (vcfContent: string) => {
    if (!vcfContent) return;
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `kontak-rapi-${dateStamp}.vcf`;

    const nativeSaver = (
      window as unknown as {
        AndroidVCFSaver?: { saveVcf: (name: string, data: string) => boolean };
      }
    ).AndroidVCFSaver;

    if (nativeSaver?.saveVcf) {
      nativeSaver.saveVcf(filename, vcfContent);
      return;
    }

    const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setErrorMsg(null);
    const parsedAll: RawContact[] = [];
    const fileNames: string[] = [];

    try {
      for (const file of Array.from(fileList)) {
        const text = await file.text();
        const parsed = parseVCF(text, file.name);
        if (parsed.length > 0) {
          parsedAll.push(...parsed);
        }
        fileNames.push(file.name);
      }

      if (parsedAll.length === 0) {
        setErrorMsg(
          'Tidak ditemukan data kontak yang valid di dalam file VCF yang dipilih. Pastikan file berformat vCard (.vcf).'
        );
        return;
      }

      setRawContacts(parsedAll);
      setUploadedFiles(fileNames);
      setEditedContacts(null);
      setActiveTab('all');
      setSearchQuery('');

      if (autoDownload) {
        const immediate = processContacts(parsedAll, options);
        triggerDownload(immediate.vcfText);
      }
    } catch {
      setErrorMsg('Gagal membaca file VCF. Pastikan file tidak rusak dan berformat teks .vcf.');
    }
  };

  const handleOptionChange = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    setEditedContacts(null);
    setter(value);
  };

  const handleRenameContact = (contactId: string, newName: string) => {
    const base = editedContacts ?? computedResult?.contacts ?? [];
    const updated = base.map((c) =>
      c.id === contactId
        ? { ...c, name: newName.trim() || 'Tanpa Nama' }
        : c
    );
    setEditedContacts(updated);
  };

  const handleRemovePhone = (contactId: string, phoneId: string) => {
    const base = editedContacts ?? computedResult?.contacts ?? [];
    const updated = base
      .map((c) =>
        c.id === contactId
          ? { ...c, phones: c.phones.filter((p) => p.id !== phoneId) }
          : c
      )
      .filter((c) => (removeEmpty ? c.phones.length > 0 : true));
    setEditedContacts(updated);
  };

  const handleDeleteContact = (contactId: string) => {
    const base = editedContacts ?? computedResult?.contacts ?? [];
    setEditedContacts(base.filter((c) => c.id !== contactId));
  };

  const handleCopyVcf = async () => {
    if (!liveVcfText) return;
    try {
      await navigator.clipboard.writeText(liveVcfText);
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2000);
    } catch {
      setErrorMsg('Gagal menyalin teks ke clipboard. Gunakan tombol Download VCF Rapi.');
    }
  };

  const handleReset = () => {
    setRawContacts([]);
    setUploadedFiles([]);
    setEditedContacts(null);
    setErrorMsg(null);
    setSearchQuery('');
    setActiveTab('all');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const filteredContacts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return contacts.filter((c) => {
      if (activeTab === 'multi' && c.phones.length <= 1) return false;
      if (activeTab === 'conflict' && !c.isConflict) return false;

      if (!q) return true;
      const nameMatch = c.name.toLowerCase().includes(q);
      const phoneMatch = c.phones.some(
        (p) => p.value.toLowerCase().includes(q) || p.key.includes(q)
      );
      return nameMatch || phoneMatch;
    });
  }, [contacts, activeTab, searchQuery]);

  const totalRemovedOrMerged = stats
    ? stats.duplicateNumbersRemoved + stats.duplicateNamesMerged + stats.emptyRemoved
    : 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#EEF2F7] bg-[radial-gradient(ellipse_at_top_left,_rgba(37,99,235,0.09),_transparent_50%),radial-gradient(ellipse_at_top_right,_rgba(13,148,136,0.08),_transparent_45%)] text-slate-900">
      <main className="mx-auto w-full max-w-[440px] flex-1 px-3.5 py-5">
        {/* Hero Header */}
        <section className="mb-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold tracking-[-0.025em] text-[#0F2342]">
              DupliCheck
            </h1>
            <p className="mt-0.5 text-xs font-medium tracking-wide text-teal-700">
              (Perapi Kontak VCF)
            </p>
          </div>
          <PWAInstallButton />
        </section>

        {/* Upload & Configuration Card */}
        <section
          id="unggah"
          className="mb-5 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs"
        >
          <div
            role="button"
            tabIndex={0}
            aria-label="Pilih atau seret file VCF ke sini"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
              isDragging
                ? 'border-blue-600 bg-blue-100/60'
                : 'border-blue-300/90 bg-gradient-to-b from-blue-50/75 to-sky-50/35 hover:border-blue-500 hover:from-blue-50 hover:to-indigo-50/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".vcf,text/vcard,text/x-vcard"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <Upload className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-sm font-bold leading-snug text-slate-900">
              Klik untuk pilih file .VCF atau seret &amp; lepas ke sini
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Mendukung banyak file sekaligus (vCard 2.1, 3.0, 4.0) · Proses 100% lokal di perangkat
            </p>
            {uploadedFiles.length > 0 && (
              <p className="mt-2.5 text-xs font-semibold leading-relaxed text-blue-700 break-words">
                File aktif: {uploadedFiles.join(', ')} · {rawContacts.length} kontak awal terbaca
              </p>
            )}
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                aria-label="Tutup pesan galat"
                className="rounded p-1 text-red-700 hover:bg-red-100 cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Options List: Android Single-Column Touch Cards */}
          <div id="pengaturan" className="mt-5 border-t border-slate-200 pt-4 space-y-2.5">
            <div className="grid grid-cols-1 gap-2.5">
              <label className="flex items-start gap-3 rounded-xl border border-blue-200/60 bg-blue-50/70 p-3.5 transition-colors active:bg-blue-100/70 hover:bg-blue-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={normalizeIndonesia}
                  onChange={(e) => handleOptionChange(setNormalizeIndonesia, e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-blue-300 bg-white accent-blue-700 focus:ring-blue-700"
                />
                <div className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug text-blue-950">
                    Samakan format 08xx = +628xx
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">
                    Mendeteksi 0812, 62812, dan +62 812 sebagai nomor yang sama
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-teal-200/60 bg-teal-50/70 p-3.5 transition-colors active:bg-teal-100/70 hover:bg-teal-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mergeSameName}
                  onChange={(e) => handleOptionChange(setMergeSameName, e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-teal-300 bg-white accent-teal-700 focus:ring-teal-700"
                />
                <div className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug text-teal-950">
                    Gabung 1 nama dengan beda nomor
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">
                    Nama sama dengan nomor berbeda dijadikan satu kartu kontak
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-rose-200/60 bg-rose-50/65 p-3.5 transition-colors active:bg-rose-100/70 hover:bg-rose-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeEmpty}
                  onChange={(e) => handleOptionChange(setRemoveEmpty, e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-rose-300 bg-white accent-rose-700 focus:ring-rose-700"
                />
                <div className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug text-rose-950">
                    Hapus kontak tanpa nomor
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">
                    Menyingkirkan entri kosong yang tidak memiliki nomor HP
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-emerald-200/60 bg-emerald-50/70 p-3.5 transition-colors active:bg-emerald-100/70 hover:bg-emerald-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDownload}
                  onChange={(e) => setAutoDownload(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-emerald-300 bg-white accent-emerald-700 focus:ring-emerald-700"
                />
                <div className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug text-emerald-950">
                    Otomatis download setelah upload
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">
                    Langsung unduh file VCF rapi begitu file dimasukkan
                  </span>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              <div className="flex flex-col rounded-xl border border-indigo-200/60 bg-indigo-50/65 p-3.5">
                <label
                  htmlFor="phone-format"
                  className="mb-1.5 block text-sm font-semibold leading-snug text-indigo-950"
                >
                  Format Nomor Output
                </label>
                <select
                  id="phone-format"
                  value={phoneFormat}
                  onChange={(e) =>
                    handleOptionChange(setPhoneFormat, e.target.value as PhoneFormatMode)
                  }
                  className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 focus:border-indigo-600 focus:outline-none"
                >
                  <option value="plus62">Standar +628xxx (Siap WhatsApp)</option>
                  <option value="local08">Standar Lokal 08xxx</option>
                  <option value="keep">Pertahankan format asli</option>
                </select>
              </div>

              <div className="flex flex-col rounded-xl border border-amber-200/60 bg-amber-50/70 p-3.5">
                <label
                  htmlFor="conflict-mode"
                  className="mb-1.5 block text-sm font-semibold leading-snug text-amber-950"
                >
                  Jika Nomor Sama Tapi Nama Beda
                </label>
                <select
                  id="conflict-mode"
                  value={conflictMode}
                  onChange={(e) =>
                    handleOptionChange(setConflictMode, e.target.value as ConflictMode)
                  }
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 focus:border-amber-600 focus:outline-none"
                >
                  <option value="first">Pakai nama paling lengkap (cegah nomor ganda)</option>
                  <option value="merge_names">Gabung nama (Nama A / Nama B)</option>
                  <option value="keep_both">Biarkan terpisah</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Workspace Output */}
        <div id="hasil">
          <AnimatePresence mode="wait">
            {stats ? (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-4"
              >
              {/* Ready Banner */}
              <div className="flex flex-col gap-3.5 rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 via-teal-50/80 to-emerald-50 p-4">
                <div>
                  <h2 className="text-base font-bold leading-snug text-emerald-950">
                    File VCF sudah rapi dan siap disimpan
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-teal-800">
                    Dari <span className="font-mono font-semibold text-emerald-950 tabular-nums">{stats.rawCount}</span>{' '}
                    kontak awal menjadi{' '}
                    <span className="font-mono font-semibold text-emerald-950 tabular-nums">{stats.finalCount}</span>{' '}
                    kontak bersih ·{' '}
                    <span className="font-mono font-semibold text-emerald-950 tabular-nums">
                      {totalRemovedOrMerged}
                    </span>{' '}
                    duplikat atau kontak kosong dibersihkan.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => triggerDownload(liveVcfText)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-xs transition-colors active:bg-emerald-800 hover:bg-emerald-700 cursor-pointer"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download VCF Rapi
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleCopyVcf}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-xs font-semibold text-blue-800 transition-colors active:bg-blue-100 hover:bg-blue-50 cursor-pointer"
                    >
                      {copiedNotice ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                          Tersalin
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 text-blue-600" aria-hidden="true" />
                          Salin Teks VCF
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleReset}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 transition-colors active:bg-slate-100 hover:bg-slate-50 cursor-pointer"
                    >
                      <RotateCcw className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      Reset
                    </button>
                  </div>
                </div>
              </div>

              {/* 2x2 KPI Summary Cards for Android Screen */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5">
                  <div className="text-xs font-semibold leading-snug text-slate-500">Kontak Awal</div>
                  <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                    {stats.rawCount}
                  </div>
                </div>
                <div className="flex flex-col justify-between rounded-xl border border-rose-200/80 bg-rose-50/80 p-3.5">
                  <div className="text-xs font-semibold leading-snug text-rose-700">Duplikat Dihapus</div>
                  <div className="mt-1.5 font-mono text-2xl font-bold text-rose-600 tabular-nums">
                    {totalRemovedOrMerged}
                  </div>
                </div>
                <div className="flex flex-col justify-between rounded-xl border border-blue-200/80 bg-blue-50/80 p-3.5">
                  <div className="text-xs font-semibold leading-snug text-blue-800">1 Nama Beda Nomor</div>
                  <div className="mt-1.5 font-mono text-2xl font-bold text-blue-700 tabular-nums">
                    {stats.multiNumberCount}
                  </div>
                </div>
                <div className="flex flex-col justify-between rounded-xl border border-emerald-200/80 bg-emerald-50/80 p-3.5">
                  <div className="text-xs font-semibold leading-snug text-emerald-800">Total Kontak Rapi</div>
                  <div className="mt-1.5 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                    {stats.finalCount}
                  </div>
                </div>
              </div>

              {/* Contact List & Preview Panel */}
              <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
                {/* Toolbar: 2x2 Touch Tabs + Full-Width Search */}
                <div className="flex flex-col gap-3 border-b border-slate-200 p-3.5">
                  <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab('all')}
                      className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors text-center cursor-pointer ${
                        activeTab === 'all'
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Semua ({contacts.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('multi')}
                      className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors text-center cursor-pointer ${
                        activeTab === 'multi'
                          ? 'bg-blue-700 text-white'
                          : 'text-slate-600 hover:text-blue-800'
                      }`}
                    >
                      Beda Nomor ({stats.multiNumberCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('conflict')}
                      className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors text-center cursor-pointer ${
                        activeTab === 'conflict'
                          ? 'bg-amber-600 text-white'
                          : 'text-slate-600 hover:text-amber-800'
                      }`}
                    >
                      Konflik ({stats.conflictCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('raw')}
                      className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors text-center cursor-pointer ${
                        activeTab === 'raw'
                          ? 'bg-teal-700 text-white'
                          : 'text-slate-600 hover:text-teal-800'
                      }`}
                    >
                      Preview .VCF
                    </button>
                  </div>

                  {activeTab !== 'raw' && (
                    <div className="relative w-full">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari nama atau nomor HP..."
                        className="w-full rounded-xl border border-slate-300 bg-slate-50/60 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Body Content */}
                {activeTab === 'raw' ? (
                  <div className="p-4">
                    <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
                      <span>Standar vCard 3.0 UTF-8 · Siap impor ke Android, iOS, dan Google Contacts</span>
                      <span className="font-mono font-medium text-teal-700 tabular-nums">
                        {liveVcfText.length} karakter
                      </span>
                    </div>
                    <textarea
                      readOnly
                      value={liveVcfText}
                      aria-label="Preview isi file VCF rapi"
                      className="h-96 w-full rounded-lg border border-slate-800 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-emerald-300 focus:outline-none"
                    />
                  </div>
                ) : filteredContacts.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <p className="text-sm font-medium text-slate-700">
                      Tidak ada kontak yang cocok dengan filter atau pencarian saat ini.
                    </p>
                    {(searchQuery || activeTab !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setActiveTab('all');
                        }}
                        className="mt-3 inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Tampilkan Semua Kontak
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="max-h-[480px] overflow-y-auto divide-y divide-slate-200">
                    {filteredContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className={`flex flex-col gap-2.5 p-3.5 transition-colors hover:bg-blue-50/35 ${
                          contact.isConflict ? 'bg-amber-50/70' : ''
                        }`}
                      >
                        {/* Top Row: Editable Name + Delete Button */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <input
                              type="text"
                              value={contact.name}
                              onChange={(e) => handleRenameContact(contact.id, e.target.value)}
                              aria-label={`Edit nama kontak ${contact.name}`}
                              className="w-full border-b border-transparent bg-transparent py-0.5 text-sm font-semibold leading-snug text-slate-900 hover:border-slate-300 focus:rounded-md focus:border focus:border-blue-600 focus:bg-white focus:px-2 focus:-mx-2 focus:outline-none"
                            />

                            {(contact.phones.length > 1 || contact.mergedCount > 1 || contact.isConflict) && (
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-relaxed text-slate-500">
                                {contact.phones.length > 1 && (
                                  <span className="font-semibold text-blue-700">
                                    {contact.phones.length} nomor unik
                                  </span>
                                )}
                                {contact.mergedCount > 1 && (
                                  <>
                                    {contact.phones.length > 1 && <span aria-hidden="true">·</span>}
                                    <span className="text-teal-700">
                                      digabung dari {contact.mergedCount} entri
                                    </span>
                                  </>
                                )}
                                {contact.isConflict && (
                                  <>
                                    {(contact.phones.length > 1 || contact.mergedCount > 1) && (
                                      <span aria-hidden="true">·</span>
                                    )}
                                    <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                      Nama lain: {contact.conflictNames.join(', ')}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteContact(contact.id)}
                            aria-label={`Hapus kontak ${contact.name}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors active:bg-rose-100 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Hapus
                          </button>
                        </div>

                        {/* Phones Card List */}
                        <div className="divide-y divide-slate-200/70 rounded-xl bg-slate-50/90 px-3 py-1.5">
                          {contact.phones.length > 0 ? (
                            contact.phones.map((phone) => (
                              <div
                                key={phone.id}
                                className="flex items-center justify-between gap-2 py-1.5"
                              >
                                <div className="flex items-baseline gap-2 min-w-0">
                                  <span className="font-mono text-sm font-medium text-slate-900 tabular-nums truncate">
                                    {phone.value}
                                  </span>
                                  <span className="text-[11px] font-semibold text-indigo-600 shrink-0">
                                    {phone.type}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemovePhone(contact.id, phone.id)}
                                  title="Hapus nomor ini"
                                  aria-label={`Hapus nomor ${phone.value}`}
                                  className="rounded-lg p-1.5 text-slate-400 active:bg-rose-100 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer shrink-0"
                                >
                                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="py-1 text-xs text-slate-400">Tidak ada nomor</div>
                          )}

                          {contact.emails.length > 0 && (
                            <div className="py-1.5 text-xs leading-relaxed text-teal-700 break-all">
                              Email: {contact.emails.join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ) : null}
          </AnimatePresence>
        </div>
      </main>

      <footer className="mt-12 border-t border-slate-200/80 bg-[#EEF2F7] py-6">
        <div className="mx-auto max-w-5xl px-4 text-center text-xs text-slate-500 sm:px-6 lg:px-8">
          @2026 by: <span className="font-semibold text-slate-700">Hendra.ND.</span>
        </div>
      </footer>

      <OfflineIndicator />
    </div>
  );
}
