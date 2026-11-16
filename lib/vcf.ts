export type PhoneFormatMode = 'plus62' | 'local08' | 'keep';
export type ConflictMode = 'first' | 'merge_names' | 'keep_both';

export interface RawPhone {
  raw: string;
  type: 'CELL' | 'HOME' | 'WORK' | 'OTHER';
}

export interface RawContact {
  id: string;
  name: string;
  phones: RawPhone[];
  emails: string[];
  org: string;
  note: string;
  sourceFile?: string;
}

export interface CleanPhone {
  id: string;
  key: string;
  value: string;
  type: 'CELL' | 'HOME' | 'WORK' | 'OTHER';
}

export interface CleanContact {
  id: string;
  name: string;
  phones: CleanPhone[];
  emails: string[];
  org: string;
  note: string;
  mergedCount: number;
  isConflict: boolean;
  conflictNames: string[];
}

export interface ProcessOptions {
  normalizeIndonesia: boolean;
  mergeSameName: boolean;
  removeEmpty: boolean;
  phoneFormat: PhoneFormatMode;
  conflictMode: ConflictMode;
}

export interface ProcessStats {
  rawCount: number;
  duplicateNumbersRemoved: number;
  duplicateNamesMerged: number;
  emptyRemoved: number;
  multiNumberCount: number;
  conflictCount: number;
  finalCount: number;
}

export interface ProcessResult {
  contacts: CleanContact[];
  stats: ProcessStats;
  vcfText: string;
}

function decodeQuotedPrintable(input: string): string {
  try {
    const cleaned = input.replace(/=\r?\n/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < cleaned.length; i++) {
      if (
        cleaned[i] === '=' &&
        i + 2 < cleaned.length &&
        /^[0-9A-Fa-f]{2}$/.test(cleaned.slice(i + 1, i + 3))
      ) {
        bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(cleaned.charCodeAt(i));
      }
    }
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch {
    return input;
  }
}

function unescapeVCardValue(val: string): string {
  return val
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function splitUnescapedSemicolons(val: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < val.length; i++) {
    if (val[i] === '\\' && i + 1 < val.length) {
      current += val[i] + val[i + 1];
      i++;
    } else if (val[i] === ';') {
      parts.push(current);
      current = '';
    } else {
      current += val[i];
    }
  }
  parts.push(current);
  return parts;
}

/**
 * Scores a contact display name so fuller, properly spaced and titled names
 * (e.g. "Kol.Ckm dr.Ayiq Mahmud, Sp.OT (K) Spine") beat squashed/lowercase aliases
 * (e.g. "ayiqmahmud").
 */
export function scoreContactName(name: string): number {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (!clean || clean.toLowerCase() === 'tanpa nama') return 0;
  if (/^\+?\d[\d\s\-().]*$/.test(clean)) return 1;

  const words = clean.split(' ').filter(Boolean);
  const hasLower = /[a-z]/.test(clean);
  const hasUpper = /[A-Z]/.test(clean);
  const isMixedCase = hasLower && hasUpper;
  const hasTitlePunct = /[.,()]/.test(clean);
  const isSquashedSingleWord = words.length === 1 && !hasTitlePunct && clean === clean.toLowerCase();

  let score = words.length * 25 + Math.min(clean.length, 80);
  if (isMixedCase) score += 20;
  else if (hasUpper && !hasLower) score += 5;
  if (hasTitlePunct) score += 12;
  if (isSquashedSingleWord) score -= 15;

  return Math.max(score, 2);
}

/**
 * Safely cleans obvious formatting clutter (extra spaces, underscores, CamelCase joins,
 * all-lowercase multi-word names) while preserving intentional titles like
 * "Kol.Ckm dr.Ayiq Mahmud, Sp.OT (K) Spine".
 */
export function prettifyContactName(name: string): string {
  let clean = name.replace(/_/g, ' ');
  // Split CamelCase boundaries (e.g. AyiqMahmud -> Ayiq Mahmud) without touching dots like Kol.Ckm
  clean = clean.replace(/([a-z])([A-Z])/g, '$1 $2');
  clean = clean.replace(/\s+,/g, ',').replace(/,([^\s])/g, ', $1');
  clean = clean.replace(/\s+/g, ' ').trim();

  if (!clean) return 'Tanpa Nama';

  // If the entire multi-word name is lowercase (e.g. "budi santoso"), convert to Title Case
  if (clean === clean.toLowerCase() && clean.includes(' ') && /[a-z]/.test(clean)) {
    clean = clean.replace(/\b([a-z])/g, (m) => m.toUpperCase());
  }

  return clean;
}

export function parseVCF(vcfText: string, sourceFile?: string): RawContact[] {
  const normalized = vcfText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/BEGIN:VCARD/i).slice(1);
  const results: RawContact[] = [];

  blocks.forEach((block, idx) => {
    const endIdx = block.search(/END:VCARD/i);
    const body = endIdx !== -1 ? block.slice(0, endIdx) : block;

    const rawLines = body.split('\n');
    const lines: string[] = [];

    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i];
      if (!line.trim()) continue;

      if (/ENCODING=QUOTED-PRINTABLE/i.test(line)) {
        while (line.endsWith('=') && i + 1 < rawLines.length) {
          line = line.slice(0, -1) + rawLines[++i];
        }
      } else {
        // RFC 2425 / 6350 line folding: next line starting with space or tab continues current line
        while (i + 1 < rawLines.length && /^[ \t]/.test(rawLines[i + 1])) {
          line += rawLines[++i].slice(1);
        }
      }

      if (line.trim()) {
        lines.push(line.trim());
      }
    }

    const fnCandidates: string[] = [];
    let nFormatted = '';
    const phones: RawPhone[] = [];
    const emails: string[] = [];
    let org = '';
    let note = '';

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const propPart = line.slice(0, colonIdx);
      let valPart = line.slice(colonIdx + 1).trim();

      if (/ENCODING=QUOTED-PRINTABLE/i.test(propPart)) {
        valPart = decodeQuotedPrintable(valPart);
      }

      const propClean = propPart.replace(/^item\d+\./i, '').toUpperCase();
      const propName = propClean.split(';')[0];

      if (propName === 'FN') {
        const cleanedFn = unescapeVCardValue(valPart).replace(/\s+/g, ' ').trim();
        if (cleanedFn) fnCandidates.push(cleanedFn);
      } else if (propName === 'N' && !nFormatted) {
        const nParts = splitUnescapedSemicolons(valPart).map((s) => unescapeVCardValue(s));
        const [last = '', first = '', mid = '', prefix = '', suffix = ''] = nParts;
        nFormatted = [prefix, first, mid, last, suffix]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      } else if (propName === 'TEL') {
        const cleanedVal = unescapeVCardValue(valPart);
        if (cleanedVal) {
          let type: RawPhone['type'] = 'CELL';
          if (/HOME/i.test(propClean)) type = 'HOME';
          else if (/WORK/i.test(propClean)) type = 'WORK';
          else if (/OTHER|FAX|PAGER/i.test(propClean)) type = 'OTHER';
          phones.push({ raw: cleanedVal, type });
        }
      } else if (propName === 'EMAIL') {
        const cleanedEmail = unescapeVCardValue(valPart);
        if (cleanedEmail && !emails.includes(cleanedEmail)) {
          emails.push(cleanedEmail);
        }
      } else if (propName === 'ORG' && !org) {
        org = splitUnescapedSemicolons(valPart)
          .map((s) => unescapeVCardValue(s))
          .filter(Boolean)
          .join(' ')
          .trim();
      } else if (propName === 'NOTE' && !note) {
        note = unescapeVCardValue(valPart);
      }
    }

    // Choose the richest/cleanest name among all FN lines and structured N field
    const nameCandidates = [...fnCandidates];
    if (nFormatted) nameCandidates.push(nFormatted);

    let bestName = '';
    let bestScore = -1;
    for (const cand of nameCandidates) {
      const s = scoreContactName(cand);
      if (s > bestScore) {
        bestScore = s;
        bestName = cand;
      }
    }

    if (!bestName && org) {
      bestName = org;
    }

    bestName = prettifyContactName(bestName);
    if (bestName === 'Tanpa Nama' && phones.length === 0 && emails.length === 0) return;

    results.push({
      id: `${sourceFile ?? 'vcf'}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      name: bestName,
      phones,
      emails,
      org,
      note,
      sourceFile,
    });
  });

  return results;
}

export function normalizePhoneKey(phone: string, normalizeIndonesia: boolean): string {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (!digitsOnly) return '';

  let normalized = hasPlus ? `+${digitsOnly}` : digitsOnly;

  if (normalizeIndonesia) {
    if (normalized.startsWith('+62')) {
      normalized = '0' + normalized.slice(3);
    } else if (normalized.startsWith('62') && digitsOnly.length >= 10) {
      normalized = '0' + normalized.slice(2);
    } else if (normalized.startsWith('8') && digitsOnly.length >= 9 && digitsOnly.length <= 14) {
      normalized = '0' + normalized;
    }
  }

  return normalized;
}

export function formatPhoneDisplay(
  raw: string,
  mode: PhoneFormatMode,
  normalizeIndonesia: boolean
): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (mode === 'keep') {
    return trimmed;
  }

  const hasPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (!digitsOnly) return trimmed;

  const cleanNumeric = hasPlus ? `+${digitsOnly}` : digitsOnly;
  const idKey = normalizePhoneKey(trimmed, true);

  if (mode === 'plus62') {
    if (idKey.startsWith('0') && idKey.length >= 9) {
      return `+62${idKey.slice(1)}`;
    }
    if (digitsOnly.startsWith('62') && digitsOnly.length >= 10) {
      return `+${digitsOnly}`;
    }
    if (normalizeIndonesia && digitsOnly.startsWith('8') && digitsOnly.length >= 9) {
      return `+62${digitsOnly}`;
    }
    return cleanNumeric;
  }

  if (mode === 'local08') {
    if (idKey.startsWith('0') && idKey.length >= 9) {
      return idKey;
    }
    return cleanNumeric;
  }

  return cleanNumeric;
}

export function normalizeNameKey(name: string): string {
  const basic = name.toLowerCase().replace(/\s+/g, ' ').trim();
  // Also collapse spacing/punctuation differences so "ayiqmahmud" matches "Ayiq Mahmud"
  const alnum = basic.replace(/[^a-z0-9]/g, '');
  return alnum.length >= 4 ? alnum : basic;
}

export function processContacts(
  rawContacts: RawContact[],
  options: ProcessOptions
): ProcessResult {
  let duplicateNumbersRemoved = 0;
  let duplicateNamesMerged = 0;

  // Step 1: Deduplicate identical phone numbers within each individual raw contact
  const sanitized = rawContacts.map((c) => {
    const seenKeys = new Set<string>();
    const uniquePhones: CleanPhone[] = [];

    for (const p of c.phones) {
      const key = normalizePhoneKey(p.raw, options.normalizeIndonesia);
      if (!key) continue;
      if (seenKeys.has(key)) {
        duplicateNumbersRemoved++;
        continue;
      }
      seenKeys.add(key);
      uniquePhones.push({
        id: `${c.id}-${key}-${uniquePhones.length}`,
        key,
        value: formatPhoneDisplay(p.raw, options.phoneFormat, options.normalizeIndonesia),
        type: p.type,
      });
    }

    return {
      id: c.id,
      name: c.name,
      phones: uniquePhones,
      emails: [...c.emails],
      org: c.org,
      note: c.note,
      mergedCount: 1,
      isConflict: false,
      conflictNames: [] as string[],
    };
  });

  // Step 2: Merge contacts sharing the same name (1 nama, beda nomor), promoting the cleanest name format
  let byNameList: CleanContact[] = [];
  if (options.mergeSameName) {
    const nameMap = new Map<string, CleanContact>();

    for (const c of sanitized) {
      const nKey = normalizeNameKey(c.name);
      const existing = nameMap.get(nKey);

      if (!existing) {
        nameMap.set(nKey, {
          ...c,
          phones: [...c.phones],
          emails: [...c.emails],
          conflictNames: [],
        });
      } else {
        duplicateNamesMerged++;
        existing.mergedCount += 1;

        if (scoreContactName(c.name) > scoreContactName(existing.name)) {
          existing.name = c.name;
        }

        for (const p of c.phones) {
          if (!existing.phones.some((ep) => ep.key === p.key)) {
            existing.phones.push(p);
          } else {
            duplicateNumbersRemoved++;
          }
        }
        for (const em of c.emails) {
          if (!existing.emails.includes(em)) {
            existing.emails.push(em);
          }
        }
        if (!existing.org && c.org) existing.org = c.org;
        if (!existing.note && c.note) existing.note = c.note;
      }
    }

    byNameList = Array.from(nameMap.values());
  } else {
    byNameList = sanitized;
  }

  // Step 3: Prevent the same phone number from duplicating across different contact names,
  // automatically preferring the fullest, cleanest name when merging duplicate phone owners.
  const phoneOwnerMap = new Map<string, number>();
  const finalContacts: CleanContact[] = [];

  for (const c of byNameList) {
    if (options.conflictMode === 'keep_both' || c.phones.length === 0) {
      finalContacts.push(c);
      continue;
    }

    let matchedOwnerIdx: number | undefined;
    for (const p of c.phones) {
      const found = phoneOwnerMap.get(p.key);
      if (found !== undefined) {
        matchedOwnerIdx = found;
        break;
      }
    }

    if (matchedOwnerIdx === undefined) {
      const newIdx = finalContacts.length;
      finalContacts.push({ ...c, phones: [...c.phones], emails: [...c.emails] });
      for (const p of c.phones) {
        phoneOwnerMap.set(p.key, newIdx);
      }
      continue;
    }

    const owner = finalContacts[matchedOwnerIdx];
    owner.mergedCount += c.mergedCount;

    const ownerKey = normalizeNameKey(owner.name);
    const incomingKey = normalizeNameKey(c.name);

    if (ownerKey !== incomingKey) {
      owner.isConflict = true;
      if (!owner.conflictNames.includes(owner.name)) {
        owner.conflictNames.push(owner.name);
      }
      if (!owner.conflictNames.includes(c.name)) {
        owner.conflictNames.push(c.name);
      }

      if (options.conflictMode === 'merge_names') {
        const existingNames = owner.name.split(' / ').map((s) => s.trim());
        if (!existingNames.some((n) => normalizeNameKey(n) === incomingKey)) {
          owner.name =
            scoreContactName(c.name) > scoreContactName(owner.name)
              ? `${c.name} / ${owner.name}`
              : `${owner.name} / ${c.name}`;
        }
      } else if (scoreContactName(c.name) > scoreContactName(owner.name)) {
        // Automatically promote fuller/formatted name (e.g. "Kol.Ckm dr.Ayiq Mahmud, Sp.OT (K) Spine" over "ayiqmahmud")
        owner.name = c.name;
      }
    } else if (scoreContactName(c.name) > scoreContactName(owner.name)) {
      owner.name = c.name;
    }

    for (const p of c.phones) {
      if (owner.phones.some((ep) => ep.key === p.key) || phoneOwnerMap.has(p.key)) {
        duplicateNumbersRemoved++;
      } else {
        owner.phones.push(p);
        phoneOwnerMap.set(p.key, matchedOwnerIdx);
      }
    }

    for (const em of c.emails) {
      if (!owner.emails.includes(em)) {
        owner.emails.push(em);
      }
    }
    if (!owner.org && c.org) owner.org = c.org;
    if (!owner.note && c.note) owner.note = c.note;
  }

  // Step 4: Remove contacts without any phone number if enabled
  let emptyRemoved = 0;
  let cleaned = finalContacts;
  if (options.removeEmpty) {
    const beforeLen = cleaned.length;
    cleaned = cleaned.filter((c) => c.phones.length > 0);
    emptyRemoved = beforeLen - cleaned.length;
  }

  // Sort alphabetically A-Z
  cleaned.sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));

  const stats: ProcessStats = {
    rawCount: rawContacts.length,
    duplicateNumbersRemoved,
    duplicateNamesMerged,
    emptyRemoved,
    multiNumberCount: cleaned.filter((c) => c.phones.length > 1).length,
    conflictCount: cleaned.filter((c) => c.isConflict).length,
    finalCount: cleaned.length,
  };

  return {
    contacts: cleaned,
    stats,
    vcfText: buildVCF(cleaned),
  };
}

function escapeVCFValue(val: string): string {
  return String(val)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function buildVCF(contacts: CleanContact[]): string {
  if (contacts.length === 0) return '';

  const chunks = contacts.map((c) => {
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escapeVCFValue(c.name)}`,
      `N:;${escapeVCFValue(c.name)};;;`,
    ];

    for (const p of c.phones) {
      lines.push(`TEL;TYPE=${p.type}:${p.value}`);
    }
    for (const em of c.emails) {
      lines.push(`EMAIL;TYPE=INTERNET:${em}`);
    }
    if (c.org) {
      lines.push(`ORG:${escapeVCFValue(c.org)}`);
    }
    if (c.note) {
      lines.push(`NOTE:${escapeVCFValue(c.note)}`);
    }

    lines.push('END:VCARD');
    return lines.join('\r\n');
  });

  return chunks.join('\r\n') + '\r\n';
}
