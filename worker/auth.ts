const PBKDF2_ITERATIONS = 100000;
const SESSION_MAX_AGE_SEC = 12 * 60 * 60; // 12시간
const SESSION_IDLE_MS = 2 * 60 * 60 * 1000; // 2시간

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.trim();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  const maxLen = Math.max(bufA.length, bufB.length);
  let diff = bufA.length ^ bufB.length;
  for (let i = 0; i < maxLen; i++) {
    const ca = i < bufA.length ? bufA[i] : 0;
    const cb = i < bufB.length ? bufB[i] : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

export async function hashPassword(
  password: string,
  existingSaltHex?: string
): Promise<{ hash: string; salt: string }> {
  const saltBytes = existingSaltHex
    ? fromHex(existingSaltHex)
    : crypto.getRandomValues(new Uint8Array(16));
  const saltHex = existingSaltHex ?? toHex(saltBytes);

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return {
    hash: toHex(new Uint8Array(derivedBits)),
    salt: saltHex,
  };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  const { hash } = await hashPassword(password, storedSalt);
  return timingSafeEqual(hash, storedHash);
}

export function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}

export async function hashSessionToken(token: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return toHex(new Uint8Array(digest));
}

export function generateTempPassword(): string {
  // 혼동하기 쉬운 문자(0, O, o, 1, l, I) 제외, 12자
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === name) {
      return decodeURIComponent(v);
    }
  }
  return null;
}

export function buildSessionCookie(token: string, requestUrl: string, clear = false): string {
  const url = new URL(requestUrl);
  const isLocalHttp =
    url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  const secureFlag = isLocalHttp ? '' : '; Secure';
  const maxAge = clear ? 0 : SESSION_MAX_AGE_SEC;
  const value = clear ? '' : encodeURIComponent(token);
  return `sid=${value}; HttpOnly${secureFlag}; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export function computeSessionExpiryIso(now = new Date()): string {
  return new Date(now.getTime() + SESSION_MAX_AGE_SEC * 1000).toISOString();
}

export function isSessionExpired(lastSeenAt: string, expiresAt: string, now = Date.now()): boolean {
  const expMs = Date.parse(expiresAt);
  const lastMs = Date.parse(lastSeenAt);
  if (Number.isNaN(expMs) || Number.isNaN(lastMs)) return true;
  if (now > expMs) return true;
  if (now - lastMs > SESSION_IDLE_MS) return true;
  return false;
}
