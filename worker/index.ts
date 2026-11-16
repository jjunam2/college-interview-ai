import { Hono } from 'hono';
import { getSettings, mapRoundRow, mapUniversityRow } from './db';
import type { AppHonoEnv } from './env';
import { csrfMiddleware, requireAuth, securityHeadersMiddleware } from './permissions';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { changesRoutes } from './routes/changes';
import { homeroomRoutes } from './routes/homeroom';
import { interviewerRoutes } from './routes/interviewer';

const app = new Hono<AppHonoEnv>();

app.use('/api/*', securityHeadersMiddleware);
app.use('/api/*', csrfMiddleware);

app.get('/api/health', async (c) => {
  const hasSecrets =
    Boolean(c.env.ENTRY_CODE && c.env.ENTRY_CODE !== 'change-me') &&
    Boolean(c.env.BOOTSTRAP_ADMIN_EMAIL && c.env.BOOTSTRAP_ADMIN_EMAIL !== 'change-me') &&
    Boolean(c.env.SESSION_SECRET && c.env.SESSION_SECRET !== 'change-me');

  let dbStatus: boolean | string = false;
  try {
    if (!c.env.DB) {
      dbStatus = 'no_binding';
    } else {
      const tableCheck = await c.env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'universities'"
      ).first();
      if (!tableCheck) {
        dbStatus = 'no_tables';
      } else {
        await c.env.DB.prepare('SELECT 1').first();
        dbStatus = true;
      }
    }
  } catch {
    dbStatus = 'error';
  }

  const ok = dbStatus === true && hasSecrets;
  return c.json({ ok, db: dbStatus, secrets: hasSecrets }, ok ? 200 : 200);
});

app.get('/api/public-settings', async (c) => {
  try {
    const settings = await getSettings(c.env.DB);
    return c.json({
      eventName: settings.eventName,
      schoolName: settings.schoolName,
      retentionUntil: settings.retentionUntil,
    });
  } catch {
    return c.json({
      eventName: '덕신고 2027 대입 모의면접',
      schoolName: '덕신고등학교',
      retentionUntil: '2026-12-31',
    });
  }
});

app.get('/api/settings', requireAuth, async (c) => {
  const settings = await getSettings(c.env.DB);
  return c.json({ settings });
});

app.get('/api/universities', requireAuth, async (c) => {
  const res = await c.env.DB.prepare('SELECT * FROM universities ORDER BY sort_order ASC').all();
  return c.json({ universities: (res.results ?? []).map(mapUniversityRow) });
});

app.get('/api/rounds', requireAuth, async (c) => {
  const [roundsRes, intsRes] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM rounds ORDER BY date DESC, start_time DESC').all(),
    c.env.DB.prepare('SELECT round_id, user_id FROM round_interviewers').all(),
  ]);
  const map = new Map<string, string[]>();
  for (const r of intsRes.results ?? []) {
    const rid = String(r.round_id);
    const list = map.get(rid) ?? [];
    list.push(String(r.user_id));
    map.set(rid, list);
  }
  return c.json({
    rounds: (roundsRes.results ?? []).map((r) => mapRoundRow(r, map.get(String(r.id)) ?? [])),
  });
});

app.route('/api/auth', authRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/interviewer', interviewerRoutes);
app.route('/api/homeroom', homeroomRoutes);
app.route('/api/changes', changesRoutes);

app.all('/api/*', (c) => {
  return c.json({ error: '요청한 API 경로를 찾을 수 없습니다.' }, 404);
});

app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.notFound();
});

export default app;
