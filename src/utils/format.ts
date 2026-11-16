import type { RubricItem } from '../types';

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

export function formatKoreanDateTime(dateStr: string, timeStr?: string): string {
  if (!dateStr) return '-';
  // YYYY-MM-DD 형식
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const day = WEEKDAYS_KO[dt.getUTCDay()];
    return `${y}. ${String(m).padStart(2, '0')}. ${String(d).padStart(2, '0')}.(${day})${
      timeStr ? ` ${timeStr}` : ''
    }`;
  }
  // ISO 문자열 -> KST(Asia/Seoul) 변환
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return dateStr;
  const kst = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  const day = WEEKDAYS_KO[kst.getUTCDay()];
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${y}. ${String(m).padStart(2, '0')}. ${String(d).padStart(2, '0')}.(${day}) ${hh}:${mm}`;
}

export function formatKstTime(iso: string | Date): string {
  const dt = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(dt.getTime())) return '';
  const kst = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss = String(kst.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function maskStudentName(name: string, enabled: boolean): string {
  if (!enabled || !name) return name;
  const chars = Array.from(name.trim());
  if (chars.length <= 1) return name;
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${'*'.repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

export function calculateConvertedScore(
  scores: Record<string, number>,
  rubric: RubricItem[]
): number {
  let sum = 0;
  for (const item of rubric) {
    const val = scores[item.key];
    if (typeof val === 'number' && val >= 1 && val <= 5) {
      sum += (val / 5) * item.weight;
    }
  }
  return Math.round(sum * 10) / 10;
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ];

  // UTF-8 BOM (\uFEFF) 필수 (엑셀 한글 호환)
  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseCsvText(rawText: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
      } else if (ch === '\r') {
        if (text[i + 1] === '\n') i++;
        row.push(field.trim());
        if (row.some((c) => c !== '')) rows.push(row);
        row = [];
        field = '';
      } else if (ch === '\n') {
        row.push(field.trim());
        if (row.some((c) => c !== '')) rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field.trim());
    if (row.some((c) => c !== '')) rows.push(row);
  }
  return rows;
}

export function isAllowedNotionUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'notion.so' ||
      host === 'www.notion.so' ||
      host === 'notion.site' ||
      host === 'app.notion.com' ||
      host.endsWith('.notion.site')
    );
  } catch {
    return false;
  }
}
