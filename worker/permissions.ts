import type { Context, Next } from 'hono';
import { isSessionExpired, parseCookie } from './auth';
import { mapUserRow } from './db';
import type { AppHonoEnv } from './env';
import type { UserRole } from '../src/types';

export async function securityHeadersMiddleware(c: Context<AppHonoEnv>, next: Next) {
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
}

export async function csrfMiddleware(c: Context<AppHonoEnv>, next: Next) {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const xRequestedWith = c.req.header('X-Requested-With');
  if (xRequestedWith !== 'fetch') {
    return c.json({ error: '잘못된 요청 헤더입니다. (CSRF 보호)' }, 403);
  }

  const origin = c.req.header('Origin');
  if (origin) {
    const expectedOrigin = new URL(c.req.url).origin;
    if (origin !== expectedOrigin) {
      return c.json({ error: '허용되지 않은 Origin 요청입니다.' }, 403);
    }
  }

  return next();
}

export function extractClientIp(c: Context<AppHonoEnv>): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function requireAuth(c: Context<AppHonoEnv>, next: Next) {
  const token = parseCookie(c.req.header('Cookie'), 'sid');
  if (!token) {
    return c.json({ error: '로그인이 필요합니다.' }, 401);
  }

  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(token));
  const tokenHash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const session = await c.env.DB.prepare(
    'SELECT id, user_id, last_seen_at, expires_at FROM sessions WHERE token_hash = ?'
  )
    .bind(tokenHash)
    .first<Record<string, unknown>>();

  if (!session) {
    return c.json({ error: '세션이 만료되었거나 유효하지 않습니다.' }, 401);
  }

  if (isSessionExpired(String(session.last_seen_at), String(session.expires_at))) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(String(session.id)).run();
    return c.json({ error: '세션이 만료되었습니다. 다시 로그인해 주세요.' }, 401);
  }

  const userRow = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(String(session.user_id))
    .first<Record<string, unknown>>();

  if (!userRow) {
    return c.json({ error: '사용자 정보를 찾을 수 없습니다.' }, 401);
  }

  const user = mapUserRow(userRow);
  if (user.status !== 'active') {
    const msg =
      user.status === 'pending'
        ? '운영자 승인 대기 중입니다. 승인 후 이용할 수 있습니다.'
        : '비활성화된 계정입니다. 운영자에게 문의하세요.';
    return c.json({ error: msg, code: user.status.toUpperCase() }, 403);
  }

  // Update last_seen_at
  const nowIso = new Date().toISOString();
  await c.env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?')
    .bind(nowIso, String(session.id))
    .run();

  c.set('user', user);
  c.set('sessionId', String(session.id));
  c.set('clientIp', extractClientIp(c));
  return next();
}

export async function requireOnboarded(c: Context<AppHonoEnv>, next: Next) {
  const user = c.get('user');
  if (user.mustChangePassword || !user.pledgeAgreedAt) {
    return c.json(
      {
        error: '비밀번호 변경 및 비밀유지 서약 완료 후 이용할 수 있습니다.',
        code: 'ONBOARDING_REQUIRED',
      },
      403
    );
  }
  return next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return async (c: Context<AppHonoEnv>, next: Next) => {
    const user = c.get('user');
    const hasRole = user.roles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      return c.json({ error: '접근 권한이 없습니다.' }, 403);
    }
    return next();
  };
}

export async function isInterviewerAssigned(
  db: D1Database,
  userId: string,
  applicationId: string
): Promise<boolean> {
  const row = await db
    .prepare(
      'SELECT 1 FROM application_interviewers WHERE application_id = ? AND interviewer_user_id = ?'
    )
    .bind(applicationId, userId)
    .first();
  return Boolean(row);
}

export async function isHomeroomAssigned(
  db: D1Database,
  userId: string,
  studentId: string
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM students WHERE id = ? AND homeroom_user_id = ?')
    .bind(studentId, userId)
    .first();
  return Boolean(row);
}
