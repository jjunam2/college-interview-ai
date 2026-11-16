import { Hono } from 'hono';
import { z } from 'zod';
import { generateTempPassword, hashPassword } from '../auth';
import {
  calculateConvertedScore,
  getSettings,
  isValidNotionUrl,
  mapApplicationRow,
  mapAuditLogRow,
  mapEvaluationRow,
  mapQuestionRow,
  mapReportRow,
  mapRoundRow,
  mapStudentRow,
  mapUniversityRow,
  mapUserRow,
  writeAuditLog,
} from '../db';
import type { AppHonoEnv } from '../env';
import {
  extractClientIp,
  requireAuth,
  requireOnboarded,
  requireRole,
} from '../permissions';
import type { RubricItem } from '../../src/types';

const adminRoutes = new Hono<AppHonoEnv>();

adminRoutes.use('*', requireAuth, requireOnboarded, requireRole('admin'));

const createTeacherSchema = z.object({
  name: z.string().trim().min(1).max(50),
  email: z.string().trim().email().max(120),
  dept: z.string().trim().max(80).optional().default(''),
  homeroomClass: z.string().trim().max(30).optional().default(''),
  roles: z.array(z.enum(['admin', 'interviewer', 'homeroom'])).min(1),
});

const approveTeacherSchema = z.object({
  approved: z.boolean(),
  roles: z.array(z.enum(['admin', 'interviewer', 'homeroom'])).optional(),
});

const updateTeacherSchema = z.object({
  roles: z.array(z.enum(['admin', 'interviewer', 'homeroom'])).min(1).optional(),
  dept: z.string().trim().max(80).optional(),
  homeroomClass: z.string().trim().max(30).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});

const settingsSchema = z.object({
  eventName: z.string().trim().min(1).max(100),
  schoolName: z.string().trim().min(1).max(60),
  maskStudentNames: z.boolean(),
  showInterviewerNamesToHomeroom: z.boolean(),
  retentionUntil: z.string().trim().min(1).max(30),
  resultsLocked: z.boolean(),
});

const rubricItemSchema = z.object({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300),
  weight: z.number().int().min(1).max(100),
  anchors: z.object({
    '5': z.string().trim().max(300),
    '3': z.string().trim().max(300),
    '1': z.string().trim().max(300),
  }),
});

const universitySchema = z.object({
  name: z.string().trim().min(1).max(60),
  admissionType: z.string().trim().min(1).max(80),
  interviewFormat: z.string().trim().min(1).max(120),
  durationMin: z.number().int().min(1).max(60),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/),
  sortOrder: z.number().int().min(0).max(999),
  rubric: z.array(rubricItemSchema).min(1).max(12),
});

const roundSchema = z.object({
  name: z.string().trim().min(1).max(80),
  date: z.string().trim().min(1).max(20),
  startTime: z.string().trim().min(1).max(10),
  room: z.string().trim().min(1).max(60),
  status: z.enum(['준비', '진행 중', '종료']),
});

const studentSchema = z.object({
  studentNo: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(50),
  classLabel: z.string().trim().min(1).max(30),
  homeroomUserId: z.string().nullable().optional(),
  desiredMajor: z.string().trim().max(100).optional().default(''),
  memo: z.string().trim().max(500).optional().default(''),
  active: z.boolean().optional().default(true),
});

const applicationSchema = z.object({
  studentId: z.string().min(1),
  universityId: z.string().min(1),
  roundId: z.string().min(1),
  major: z.string().trim().max(100).optional().default(''),
  notionUrl: z.string().trim().max(500).optional().default(''),
  sequenceNo: z.number().int().min(1).max(999),
  slotTime: z.string().trim().max(20).optional().default(''),
  status: z.enum(['대기', '면접 중', '완료', '결시']).optional().default('대기'),
  interviewerIds: z.array(z.string()).optional(),
});

const csvImportSchema = z.object({
  roundId: z.string().min(1),
  rows: z
    .array(
      z.object({
        studentNo: z.string().trim().min(1).max(30),
        name: z.string().trim().min(1).max(50),
        classLabel: z.string().trim().min(1).max(30),
        homeroomEmail: z.string().trim().max(120).optional().default(''),
        universityName: z.string().trim().min(1).max(60),
        major: z.string().trim().max(100).optional().default(''),
        sequenceNo: z.number().int().min(1).max(999),
        notionUrl: z.string().trim().max(500).optional().default(''),
      })
    )
    .min(1)
    .max(500),
});

adminRoutes.get('/workspace', async (c) => {
  const settings = await getSettings(c.env.DB);
  const serverTime = new Date().toISOString();

  const [
    univRes,
    roundsRes,
    roundIntsRes,
    usersRes,
    studentsRes,
    appsRes,
    appIntsRes,
    questionsRes,
    evalsRes,
    reportsRes,
  ] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM universities ORDER BY sort_order ASC').all(),
    c.env.DB.prepare('SELECT * FROM rounds ORDER BY date DESC, start_time DESC').all(),
    c.env.DB.prepare('SELECT round_id, user_id FROM round_interviewers').all(),
    c.env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC').all(),
    c.env.DB.prepare(
      `SELECT s.*, u.name AS homeroom_name
       FROM students s
       LEFT JOIN users u ON u.id = s.homeroom_user_id
       ORDER BY s.student_no ASC`
    ).all(),
    c.env.DB.prepare('SELECT * FROM applications ORDER BY sequence_no ASC').all(),
    c.env.DB.prepare('SELECT application_id, interviewer_user_id FROM application_interviewers').all(),
    c.env.DB.prepare('SELECT * FROM application_questions ORDER BY seq ASC').all(),
    c.env.DB.prepare(
      `SELECT e.*, u.name AS interviewer_name
       FROM evaluations e
       JOIN users u ON u.id = e.interviewer_user_id`
    ).all(),
    c.env.DB.prepare('SELECT * FROM reports').all(),
  ]);

  const roundIntMap = new Map<string, string[]>();
  for (const r of roundIntsRes.results ?? []) {
    const rid = String(r.round_id);
    const arr = roundIntMap.get(rid) ?? [];
    arr.push(String(r.user_id));
    roundIntMap.set(rid, arr);
  }

  const appIntMap = new Map<string, string[]>();
  for (const r of appIntsRes.results ?? []) {
    const aid = String(r.application_id);
    const arr = appIntMap.get(aid) ?? [];
    arr.push(String(r.interviewer_user_id));
    appIntMap.set(aid, arr);
  }

  return c.json({
    settings,
    universities: (univRes.results ?? []).map(mapUniversityRow),
    rounds: (roundsRes.results ?? []).map((r) =>
      mapRoundRow(r, roundIntMap.get(String(r.id)) ?? [])
    ),
    teachers: (usersRes.results ?? []).map(mapUserRow),
    students: (studentsRes.results ?? []).map(mapStudentRow),
    applications: (appsRes.results ?? []).map((a) =>
      mapApplicationRow(a, appIntMap.get(String(a.id)) ?? [])
    ),
    questions: (questionsRes.results ?? []).map(mapQuestionRow),
    evaluations: (evalsRes.results ?? []).map((e) => mapEvaluationRow(e, true)),
    reports: (reportsRes.results ?? []).map(mapReportRow),
    serverTime,
  });
});

// 교사 계정 관리
adminRoutes.post('/users', async (c) => {
  const actor = c.get('user');
  const body = await c.req.json().catch(() => null);
  const parsed = createTeacherSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }, 400);
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE LOWER(email) = ?')
    .bind(email)
    .first();
  if (existing) {
    return c.json({ error: '이미 등록된 이메일입니다.' }, 409);
  }

  const tempPassword = generateTempPassword();
  const { hash, salt } = await hashPassword(tempPassword);
  const userId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO users (
      id, email, name, dept, homeroom_class, requested_roles, roles, status,
      password_hash, password_salt, must_change_password, pledge_agreed_at,
      created_at, approved_by, approved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 1, NULL, ?, ?, ?)`
  )
    .bind(
      userId,
      email,
      parsed.data.name,
      parsed.data.dept,
      parsed.data.homeroomClass,
      JSON.stringify(parsed.data.roles),
      JSON.stringify(parsed.data.roles),
      hash,
      salt,
      nowIso,
      actor.id,
      nowIso
    )
    .run();

  await writeAuditLog(c.env.DB, {
    actorUserId: actor.id,
    actorName: actor.name,
    action: 'CREATE_USER',
    detail: `교사 계정 직접 생성: ${parsed.data.name} (${email})`,
    ip: extractClientIp(c),
  });

  const created = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first<Record<string, unknown>>();
  return c.json({ user: mapUserRow(created!), tempPassword }, 201);
});

adminRoutes.patch('/users/:id/approve', async (c) => {
  const actor = c.get('user');
  const targetId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = approveTeacherSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '입력값이 올바르지 않습니다.' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(targetId)
    .first<Record<string, unknown>>();
  if (!existing) {
    return c.json({ error: '교사 계정을 찾을 수 없습니다.' }, 404);
  }

  const nowIso = new Date().toISOString();
  const newStatus = parsed.data.approved ? 'active' : 'disabled';
  const roles = parsed.data.approved
    ? parsed.data.roles && parsed.data.roles.length > 0
      ? parsed.data.roles
      : JSON.parse(String(existing.requested_roles || '["interviewer"]'))
    : [];

  await c.env.DB.prepare(
    `UPDATE users SET status = ?, roles = ?, approved_by = ?, approved_at = ? WHERE id = ?`
  )
    .bind(newStatus, JSON.stringify(roles), actor.id, nowIso, targetId)
    .run();

  await writeAuditLog(c.env.DB, {
    actorUserId: actor.id,
    actorName: actor.name,
    action: 'APPROVE_USER',
    detail: `${String(existing.name)} 계정 ${parsed.data.approved ? '승인' : '거절'} (${roles.join(', ')})`,
    ip: extractClientIp(c),
  });

  const updated = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(targetId)
    .first<Record<string, unknown>>();
  return c.json({ user: mapUserRow(updated!) });
});

adminRoutes.patch('/users/:id', async (c) => {
  const actor = c.get('user');
  const targetId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = updateTeacherSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '입력값이 올바르지 않습니다.' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(targetId)
    .first<Record<string, unknown>>();
  if (!existing) {
    return c.json({ error: '교사 계정을 찾을 수 없습니다.' }, 404);
  }

  if (targetId === actor.id && parsed.data.status === 'disabled') {
    return c.json({ error: '본인 계정은 비활성화할 수 없습니다.' }, 400);
  }

  const roles = parsed.data.roles ? JSON.stringify(parsed.data.roles) : String(existing.roles);
  const dept = parsed.data.dept ?? String(existing.dept);
  const homeroomClass = parsed.data.homeroomClass ?? String(existing.homeroom_class);
  const status = parsed.data.status ?? String(existing.status);

  await c.env.DB.prepare(
    'UPDATE users SET roles = ?, dept = ?, homeroom_class = ?, status = ? WHERE id = ?'
  )
    .bind(roles, dept, homeroomClass, status, targetId)
    .run();

  if (status === 'disabled') {
    await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId).run();
  }

  const updated = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(targetId)
    .first<Record<string, unknown>>();
  return c.json({ user: mapUserRow(updated!) });
});

adminRoutes.post('/users/:id/reset-password', async (c) => {
  const actor = c.get('user');
  const targetId = c.req.param('id');

  const existing = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(targetId)
    .first<Record<string, unknown>>();
  if (!existing) {
    return c.json({ error: '교사 계정을 찾을 수 없습니다.' }, 404);
  }

  const tempPassword = generateTempPassword();
  const { hash, salt } = await hashPassword(tempPassword);

  await c.env.DB.batch([
    c.env.DB.prepare(
      'UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 1 WHERE id = ?'
    ).bind(hash, salt, targetId),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId),
  ]);

  await writeAuditLog(c.env.DB, {
    actorUserId: actor.id,
    actorName: actor.name,
    action: 'RESET_PASSWORD',
    detail: `${String(existing.name)} 임시 비밀번호 재발급`,
    ip: extractClientIp(c),
  });

  return c.json({ tempPassword });
});

// 설정
adminRoutes.put('/settings', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '설정 값이 올바르지 않습니다.' }, 400);
  }

  const s = parsed.data;
  const entries: Array<[string, string]> = [
    ['eventName', s.eventName],
    ['schoolName', s.schoolName],
    ['maskStudentNames', String(s.maskStudentNames)],
    ['showInterviewerNamesToHomeroom', String(s.showInterviewerNamesToHomeroom)],
    ['retentionUntil', s.retentionUntil],
    ['resultsLocked', String(s.resultsLocked)],
  ];

  await c.env.DB.batch(
    entries.map(([k, v]) =>
      c.env.DB.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      ).bind(k, v)
    )
  );

  return c.json({ settings: await getSettings(c.env.DB) });
});

// 대학·평가표
function validateRubricWeights(rubric: RubricItem[]): boolean {
  const sum = rubric.reduce((acc, item) => acc + item.weight, 0);
  return sum === 100;
}

adminRoutes.post('/universities', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = universitySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }, 400);
  }

  if (!validateRubricWeights(parsed.data.rubric)) {
    return c.json({ error: '평가 항목 가중치 합계는 반드시 100이어야 합니다.' }, 400);
  }

  const id = `univ-${crypto.randomUUID().slice(0, 8)}`;
  const d = parsed.data;
  await c.env.DB.prepare(
    `INSERT INTO universities (id, name, admission_type, interview_format, duration_min, color, sort_order, rubric)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      d.name,
      d.admissionType,
      d.interviewFormat,
      d.durationMin,
      d.color,
      d.sortOrder,
      JSON.stringify(d.rubric)
    )
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM universities WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json({ university: mapUniversityRow(row!) }, 201);
});

adminRoutes.put('/universities/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = universitySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }, 400);
  }

  if (!validateRubricWeights(parsed.data.rubric)) {
    return c.json({ error: '평가 항목 가중치 합계는 반드시 100이어야 합니다.' }, 400);
  }

  const d = parsed.data;
  const res = await c.env.DB.prepare(
    `UPDATE universities
     SET name = ?, admission_type = ?, interview_format = ?, duration_min = ?, color = ?, sort_order = ?, rubric = ?
     WHERE id = ?`
  )
    .bind(
      d.name,
      d.admissionType,
      d.interviewFormat,
      d.durationMin,
      d.color,
      d.sortOrder,
      JSON.stringify(d.rubric),
      id
    )
    .run();

  if (res.meta.changes === 0) {
    return c.json({ error: '대학을 찾을 수 없습니다.' }, 404);
  }

  const row = await c.env.DB.prepare('SELECT * FROM universities WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json({ university: mapUniversityRow(row!) });
});

adminRoutes.delete('/universities/:id', async (c) => {
  const id = c.req.param('id');
  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) AS cnt FROM applications WHERE university_id = ?'
  )
    .bind(id)
    .first<Record<string, unknown>>();
  if (Number(countRow?.cnt ?? 0) > 0) {
    return c.json({ error: '해당 대학에 등록된 면접 건이 있어 삭제할 수 없습니다.' }, 409);
  }

  await c.env.DB.prepare('DELETE FROM universities WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// 회차 및 면접위원 배정
adminRoutes.post('/rounds', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = roundSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '회차 정보를 올바르게 입력하세요.' }, 400);
  }

  const id = `round-${crypto.randomUUID().slice(0, 8)}`;
  const nowIso = new Date().toISOString();
  const d = parsed.data;

  await c.env.DB.prepare(
    `INSERT INTO rounds (id, name, date, start_time, room, status, current_application_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`
  )
    .bind(id, d.name, d.date, d.startTime, d.room, d.status, nowIso)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM rounds WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json({ round: mapRoundRow(row!, []) }, 201);
});

adminRoutes.put('/rounds/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = roundSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '회차 정보를 올바르게 입력하세요.' }, 400);
  }

  const d = parsed.data;
  const res = await c.env.DB.prepare(
    'UPDATE rounds SET name = ?, date = ?, start_time = ?, room = ?, status = ? WHERE id = ?'
  )
    .bind(d.name, d.date, d.startTime, d.room, d.status, id)
    .run();

  if (res.meta.changes === 0) {
    return c.json({ error: '회차를 찾을 수 없습니다.' }, 404);
  }

  const [row, intsRes] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM rounds WHERE id = ?')
      .bind(id)
      .first<Record<string, unknown>>(),
    c.env.DB.prepare('SELECT user_id FROM round_interviewers WHERE round_id = ?').bind(id).all(),
  ]);
  const intIds = (intsRes.results ?? []).map((r) => String(r.user_id));
  return c.json({ round: mapRoundRow(row!, intIds) });
});

adminRoutes.put('/rounds/:id/interviewers', async (c) => {
  const roundId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ interviewerIds: z.array(z.string()) }).safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '면접위원 목록이 올바르지 않습니다.' }, 400);
  }

  const round = await c.env.DB.prepare('SELECT id FROM rounds WHERE id = ?')
    .bind(roundId)
    .first();
  if (!round) {
    return c.json({ error: '회차를 찾을 수 없습니다.' }, 404);
  }

  const uniqueIds = Array.from(new Set(parsed.data.interviewerIds));
  const appsRes = await c.env.DB.prepare('SELECT id FROM applications WHERE round_id = ?')
    .bind(roundId)
    .all();
  const appIds = (appsRes.results ?? []).map((r) => String(r.id));

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare('DELETE FROM round_interviewers WHERE round_id = ?').bind(roundId),
  ];

  for (const uid of uniqueIds) {
    statements.push(
      c.env.DB.prepare('INSERT OR IGNORE INTO round_interviewers (round_id, user_id) VALUES (?, ?)')
        .bind(roundId, uid)
    );
  }

  // 회차 모든 면접 건에 일괄 배정
  for (const aid of appIds) {
    statements.push(
      c.env.DB.prepare('DELETE FROM application_interviewers WHERE application_id = ?').bind(aid)
    );
    for (const uid of uniqueIds) {
      statements.push(
        c.env.DB.prepare(
          'INSERT OR IGNORE INTO application_interviewers (application_id, interviewer_user_id) VALUES (?, ?)'
        ).bind(aid, uid)
      );
    }
  }

  await c.env.DB.batch(statements);
  return c.json({ ok: true, interviewerIds: uniqueIds, updatedApplications: appIds.length });
});

adminRoutes.post('/rounds/:id/start-application', async (c) => {
  const roundId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ applicationId: z.string().min(1) }).safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '면접 건 ID가 필요합니다.' }, 400);
  }

  const appId = parsed.data.applicationId;
  const appRow = await c.env.DB.prepare(
    'SELECT id FROM applications WHERE id = ? AND round_id = ?'
  )
    .bind(appId, roundId)
    .first();
  if (!appRow) {
    return c.json({ error: '해당 회차의 면접 건을 찾을 수 없습니다.' }, 404);
  }

  const nowIso = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE applications SET status = '완료', updated_at = ? WHERE round_id = ? AND status = '면접 중' AND id != ?"
    ).bind(nowIso, roundId, appId),
    c.env.DB.prepare(
      "UPDATE applications SET status = '면접 중', updated_at = ? WHERE id = ?"
    ).bind(nowIso, appId),
    c.env.DB.prepare(
      "UPDATE rounds SET status = '진행 중', current_application_id = ? WHERE id = ?"
    ).bind(appId, roundId),
  ]);

  return c.json({ ok: true, currentApplicationId: appId });
});

adminRoutes.post('/rounds/:id/next-application', async (c) => {
  const roundId = c.req.param('id');
  const nowIso = new Date().toISOString();

  const appsRes = await c.env.DB.prepare(
    'SELECT id, status, sequence_no FROM applications WHERE round_id = ? ORDER BY sequence_no ASC'
  )
    .bind(roundId)
    .all();
  const apps = appsRes.results ?? [];

  const currentIdx = apps.findIndex((a) => String(a.status) === '면접 중');
  const nextApp =
    apps.find((a, idx) => idx > currentIdx && String(a.status) === '대기') ??
    apps.find((a) => String(a.status) === '대기') ??
    null;

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(
      "UPDATE applications SET status = '완료', updated_at = ? WHERE round_id = ? AND status = '면접 중'"
    ).bind(nowIso, roundId),
  ];

  if (nextApp) {
    const nextId = String(nextApp.id);
    stmts.push(
      c.env.DB.prepare(
        "UPDATE applications SET status = '면접 중', updated_at = ? WHERE id = ?"
      ).bind(nowIso, nextId),
      c.env.DB.prepare(
        "UPDATE rounds SET status = '진행 중', current_application_id = ? WHERE id = ?"
      ).bind(nextId, roundId)
    );
    await c.env.DB.batch(stmts);
    return c.json({ ok: true, currentApplicationId: nextId });
  } else {
    stmts.push(
      c.env.DB.prepare("UPDATE rounds SET status = '종료', current_application_id = NULL WHERE id = ?").bind(
        roundId
      )
    );
    await c.env.DB.batch(stmts);
    return c.json({ ok: true, currentApplicationId: null });
  }
});

adminRoutes.post('/rounds/:id/reorder', async (c) => {
  const roundId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ orderedApplicationIds: z.array(z.string()).min(1) }).safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '정렬 목록이 올바르지 않습니다.' }, 400);
  }

  const nowIso = new Date().toISOString();
  const stmts = parsed.data.orderedApplicationIds.map((appId, idx) =>
    c.env.DB.prepare(
      'UPDATE applications SET sequence_no = ?, updated_at = ? WHERE id = ? AND round_id = ?'
    ).bind(idx + 1, nowIso, appId, roundId)
  );

  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// 학생 및 면접 건
adminRoutes.post('/students', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = studentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }, 400);
  }

  const d = parsed.data;
  const dup = await c.env.DB.prepare('SELECT id FROM students WHERE student_no = ?')
    .bind(d.studentNo)
    .first();
  if (dup) {
    return c.json({ error: '이미 등록된 학번입니다.' }, 409);
  }

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO students (
      id, student_no, name, class_label, homeroom_user_id, desired_major, memo, active, is_demo, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  )
    .bind(
      id,
      d.studentNo,
      d.name,
      d.classLabel,
      d.homeroomUserId || null,
      d.desiredMajor,
      d.memo,
      d.active ? 1 : 0,
      nowIso,
      nowIso
    )
    .run();

  const row = await c.env.DB.prepare(
    'SELECT s.*, u.name AS homeroom_name FROM students s LEFT JOIN users u ON u.id = s.homeroom_user_id WHERE s.id = ?'
  )
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json({ student: mapStudentRow(row!) }, 201);
});

adminRoutes.put('/students/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = studentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }, 400);
  }

  const d = parsed.data;
  const nowIso = new Date().toISOString();
  const res = await c.env.DB.prepare(
    `UPDATE students
     SET student_no = ?, name = ?, class_label = ?, homeroom_user_id = ?, desired_major = ?, memo = ?, active = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(
      d.studentNo,
      d.name,
      d.classLabel,
      d.homeroomUserId || null,
      d.desiredMajor,
      d.memo,
      d.active ? 1 : 0,
      nowIso,
      id
    )
    .run();

  if (res.meta.changes === 0) {
    return c.json({ error: '학생을 찾을 수 없습니다.' }, 404);
  }

  const row = await c.env.DB.prepare(
    'SELECT s.*, u.name AS homeroom_name FROM students s LEFT JOIN users u ON u.id = s.homeroom_user_id WHERE s.id = ?'
  )
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json({ student: mapStudentRow(row!) });
});

adminRoutes.post('/applications', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = applicationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }, 400);
  }

  const d = parsed.data;
  if (!isValidNotionUrl(d.notionUrl)) {
    return c.json(
      { error: '노션 링크는 https://notion.so, notion.site, app.notion.com 도메인만 허용됩니다.' },
      400
    );
  }

  let interviewerIds = d.interviewerIds;
  if (!interviewerIds) {
    const rInts = await c.env.DB.prepare(
      'SELECT user_id FROM round_interviewers WHERE round_id = ?'
    )
      .bind(d.roundId)
      .all();
    interviewerIds = (rInts.results ?? []).map((r) => String(r.user_id));
  }

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO applications (
        id, student_id, university_id, round_id, major, notion_url, sequence_no, slot_time, status, is_demo, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).bind(
      id,
      d.studentId,
      d.universityId,
      d.roundId,
      d.major,
      d.notionUrl.trim(),
      d.sequenceNo,
      d.slotTime,
      d.status,
      nowIso,
      nowIso
    ),
  ];

  for (const uid of interviewerIds) {
    stmts.push(
      c.env.DB.prepare(
        'INSERT OR IGNORE INTO application_interviewers (application_id, interviewer_user_id) VALUES (?, ?)'
      ).bind(id, uid)
    );
  }

  await c.env.DB.batch(stmts);
  const row = await c.env.DB.prepare('SELECT * FROM applications WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  return c.json({ application: mapApplicationRow(row!, interviewerIds) }, 201);
});

adminRoutes.put('/applications/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = applicationSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT * FROM applications WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  if (!existing) {
    return c.json({ error: '면접 건을 찾을 수 없습니다.' }, 404);
  }

  const d = parsed.data;
  const notionUrl = d.notionUrl !== undefined ? d.notionUrl.trim() : String(existing.notion_url);
  if (!isValidNotionUrl(notionUrl)) {
    return c.json(
      { error: '노션 링크는 https://notion.so, notion.site, app.notion.com 도메인만 허용됩니다.' },
      400
    );
  }

  const nowIso = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `UPDATE applications
       SET university_id = ?, round_id = ?, major = ?, notion_url = ?, sequence_no = ?, slot_time = ?, status = ?, updated_at = ?
       WHERE id = ?`
    ).bind(
      d.universityId ?? String(existing.university_id),
      d.roundId ?? String(existing.round_id),
      d.major ?? String(existing.major),
      notionUrl,
      d.sequenceNo ?? Number(existing.sequence_no),
      d.slotTime ?? String(existing.slot_time),
      d.status ?? String(existing.status),
      nowIso,
      id
    ),
  ];

  if (d.interviewerIds) {
    stmts.push(
      c.env.DB.prepare('DELETE FROM application_interviewers WHERE application_id = ?').bind(id)
    );
    for (const uid of Array.from(new Set(d.interviewerIds))) {
      stmts.push(
        c.env.DB.prepare(
          'INSERT OR IGNORE INTO application_interviewers (application_id, interviewer_user_id) VALUES (?, ?)'
        ).bind(id, uid)
      );
    }
  }

  await c.env.DB.batch(stmts);
  const [row, intsRes] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM applications WHERE id = ?')
      .bind(id)
      .first<Record<string, unknown>>(),
    c.env.DB.prepare('SELECT interviewer_user_id FROM application_interviewers WHERE application_id = ?')
      .bind(id)
      .all(),
  ]);
  const intIds = (intsRes.results ?? []).map((r) => String(r.interviewer_user_id));
  return c.json({ application: mapApplicationRow(row!, intIds) });
});

adminRoutes.delete('/applications/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM applications WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

adminRoutes.put('/applications/:id/questions', async (c) => {
  const appId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = z
    .object({
      questions: z.array(z.string().trim().min(1).max(300)).max(50),
    })
    .safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '질문 목록이 올바르지 않습니다.' }, 400);
  }

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare('DELETE FROM application_questions WHERE application_id = ?').bind(appId),
  ];

  parsed.data.questions.forEach((qText, idx) => {
    stmts.push(
      c.env.DB.prepare(
        'INSERT INTO application_questions (id, application_id, seq, question_text, category) VALUES (?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), appId, idx + 1, qText, '')
    );
  });

  await c.env.DB.batch(stmts);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM application_questions WHERE application_id = ? ORDER BY seq ASC'
  )
    .bind(appId)
    .all();
  return c.json({ questions: (rows.results ?? []).map(mapQuestionRow) });
});

// CSV 일괄 등록
function normalizeUnivKey(name: string): string {
  return name.trim().replace(/대학교$/u, '').replace(/대$/u, '').toLowerCase();
}

adminRoutes.post('/students/import-csv', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = csvImportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'CSV 데이터가 올바르지 않습니다.' }, 400);
  }

  const { roundId, rows } = parsed.data;
  const round = await c.env.DB.prepare('SELECT id FROM rounds WHERE id = ?')
    .bind(roundId)
    .first();
  if (!round) {
    return c.json({ error: '선택한 회차를 찾을 수 없습니다.' }, 404);
  }

  const [univRes, usersRes, studentsRes, roundIntsRes] = await Promise.all([
    c.env.DB.prepare('SELECT id, name FROM universities').all(),
    c.env.DB.prepare('SELECT id, email FROM users').all(),
    c.env.DB.prepare('SELECT id, student_no FROM students').all(),
    c.env.DB.prepare('SELECT user_id FROM round_interviewers WHERE round_id = ?').bind(roundId).all(),
  ]);

  const univByNorm = new Map<string, string>();
  for (const u of univRes.results ?? []) {
    univByNorm.set(normalizeUnivKey(String(u.name)), String(u.id));
    univByNorm.set(String(u.name).trim().toLowerCase(), String(u.id));
  }

  const userByEmail = new Map<string, string>();
  for (const u of usersRes.results ?? []) {
    userByEmail.set(String(u.email).trim().toLowerCase(), String(u.id));
  }

  const studentIdByNo = new Map<string, string>();
  for (const s of studentsRes.results ?? []) {
    studentIdByNo.set(String(s.student_no), String(s.id));
  }

  const roundInterviewerIds = (roundIntsRes.results ?? []).map((r) => String(r.user_id));

  // Validate all rows first
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!isValidNotionUrl(r.notionUrl)) {
      return c.json(
        {
          error: `${i + 1}행(${r.name}): 노션 링크는 https://notion.so, notion.site, app.notion.com 도메인만 허용됩니다.`,
        },
        400
      );
    }
    const univId =
      univByNorm.get(r.universityName.trim().toLowerCase()) ??
      univByNorm.get(normalizeUnivKey(r.universityName));
    if (!univId) {
      return c.json(
        { error: `${i + 1}행(${r.name}): 등록되지 않은 대학명입니다 (${r.universityName}).` },
        400
      );
    }
  }

  const nowIso = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  const handledStudentNos = new Set<string>();
  let createdStudents = 0;
  let createdApplications = 0;

  for (const r of rows) {
    let studentId = studentIdByNo.get(r.studentNo);
    const homeroomUserId = r.homeroomEmail
      ? userByEmail.get(r.homeroomEmail.trim().toLowerCase()) ?? null
      : null;

    if (!studentId) {
      studentId = crypto.randomUUID();
      studentIdByNo.set(r.studentNo, studentId);
      handledStudentNos.add(r.studentNo);
      createdStudents++;
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO students (
            id, student_no, name, class_label, homeroom_user_id, desired_major, memo, active, is_demo, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, '', 1, 0, ?, ?)`
        ).bind(
          studentId,
          r.studentNo,
          r.name,
          r.classLabel,
          homeroomUserId,
          r.major,
          nowIso,
          nowIso
        )
      );
    } else if (!handledStudentNos.has(r.studentNo)) {
      handledStudentNos.add(r.studentNo);
      stmts.push(
        c.env.DB.prepare(
          `UPDATE students
           SET name = ?, class_label = ?, homeroom_user_id = COALESCE(?, homeroom_user_id), updated_at = ?
           WHERE id = ?`
        ).bind(r.name, r.classLabel, homeroomUserId, nowIso, studentId)
      );
    }

    const univId = (univByNorm.get(r.universityName.trim().toLowerCase()) ??
      univByNorm.get(normalizeUnivKey(r.universityName)))!;

    const appId = crypto.randomUUID();
    createdApplications++;
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO applications (
          id, student_id, university_id, round_id, major, notion_url, sequence_no, slot_time, status, is_demo, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, '', '대기', 0, ?, ?)`
      ).bind(
        appId,
        studentId,
        univId,
        roundId,
        r.major,
        r.notionUrl.trim(),
        r.sequenceNo,
        nowIso,
        nowIso
      )
    );

    for (const uid of roundInterviewerIds) {
      stmts.push(
        c.env.DB.prepare(
          'INSERT OR IGNORE INTO application_interviewers (application_id, interviewer_user_id) VALUES (?, ?)'
        ).bind(appId, uid)
      );
    }
  }

  // D1 batch chunking (safe up to 100 statements per batch)
  for (let i = 0; i < stmts.length; i += 80) {
    await c.env.DB.batch(stmts.slice(i, i + 80));
  }

  return c.json({ ok: true, createdStudents, createdApplications });
});

// 결과지 확정
adminRoutes.put('/reports/:studentId', async (c) => {
  const actor = c.get('user');
  const studentId = c.req.param('studentId');
  const body = await c.req.json().catch(() => null);
  const parsed = z
    .object({
      adminComment: z.string().max(2000),
      status: z.enum(['draft', 'confirmed']),
    })
    .safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '입력값이 올바르지 않습니다.' }, 400);
  }

  const nowIso = new Date().toISOString();
  const confirmedBy = parsed.data.status === 'confirmed' ? actor.id : null;
  const confirmedAt = parsed.data.status === 'confirmed' ? nowIso : null;

  await c.env.DB.prepare(
    `INSERT INTO reports (student_id, status, admin_comment, confirmed_by, confirmed_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(student_id) DO UPDATE SET
       status = excluded.status,
       admin_comment = excluded.admin_comment,
       confirmed_by = excluded.confirmed_by,
       confirmed_at = excluded.confirmed_at`
  )
    .bind(studentId, parsed.data.status, parsed.data.adminComment, confirmedBy, confirmedAt)
    .run();

  if (parsed.data.status === 'confirmed') {
    await writeAuditLog(c.env.DB, {
      actorUserId: actor.id,
      actorName: actor.name,
      action: 'CONFIRM_REPORT',
      targetStudentId: studentId,
      detail: '학생 결과지 확정',
      ip: extractClientIp(c),
    });
  }

  const row = await c.env.DB.prepare('SELECT * FROM reports WHERE student_id = ?')
    .bind(studentId)
    .first<Record<string, unknown>>();
  return c.json({ report: mapReportRow(row!) });
});

adminRoutes.post('/reports/confirm-batch', async (c) => {
  const actor = c.get('user');
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ studentIds: z.array(z.string().min(1)).min(1) }).safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '확정할 학생을 선택하세요.' }, 400);
  }

  const nowIso = new Date().toISOString();
  const stmts = parsed.data.studentIds.map((sid) =>
    c.env.DB.prepare(
      `INSERT INTO reports (student_id, status, admin_comment, confirmed_by, confirmed_at)
       VALUES (?, 'confirmed', '', ?, ?)
       ON CONFLICT(student_id) DO UPDATE SET
         status = 'confirmed',
         confirmed_by = excluded.confirmed_by,
         confirmed_at = excluded.confirmed_at`
    ).bind(sid, actor.id, nowIso)
  );
  await c.env.DB.batch(stmts);

  await writeAuditLog(c.env.DB, {
    actorUserId: actor.id,
    actorName: actor.name,
    action: 'CONFIRM_REPORT',
    detail: `결과지 일괄 확정 (${parsed.data.studentIds.length}명)`,
    ip: extractClientIp(c),
  });

  return c.json({ ok: true, count: parsed.data.studentIds.length });
});

// 감사 로그 & CSV 내보내기 로그
adminRoutes.get('/audit-logs', async (c) => {
  const action = c.req.query('action') || '';
  const actorUserId = c.req.query('actorUserId') || '';
  const date = c.req.query('date') || '';

  const clauses: string[] = [];
  const binds: string[] = [];

  if (action) {
    clauses.push('action = ?');
    binds.push(action);
  }
  if (actorUserId) {
    clauses.push('actor_user_id = ?');
    binds.push(actorUserId);
  }
  if (date) {
    clauses.push('at LIKE ?');
    binds.push(`${date}%`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `SELECT * FROM audit_logs ${where} ORDER BY at DESC LIMIT 300`;
  const stmt = c.env.DB.prepare(sql);
  const res = binds.length > 0 ? await stmt.bind(...binds).all() : await stmt.all();

  return c.json({ logs: (res.results ?? []).map(mapAuditLogRow) });
});

adminRoutes.post('/audit-export-csv', async (c) => {
  const actor = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const detail = typeof body?.detail === 'string' ? body.detail : '결과 취합 CSV 내보내기';
  await writeAuditLog(c.env.DB, {
    actorUserId: actor.id,
    actorName: actor.name,
    action: 'EXPORT_CSV',
    detail,
    ip: extractClientIp(c),
  });
  return c.json({ ok: true });
});

// 전체 데이터 파기
adminRoutes.post('/purge', async (c) => {
  const actor = c.get('user');
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ confirmText: z.literal('파기') }).safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '확인란에 "파기"를 정확히 입력해야 합니다.' }, 400);
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM evaluations'),
    c.env.DB.prepare('DELETE FROM application_questions'),
    c.env.DB.prepare('DELETE FROM application_interviewers'),
    c.env.DB.prepare('DELETE FROM applications'),
    c.env.DB.prepare('DELETE FROM reports'),
    c.env.DB.prepare('DELETE FROM students'),
    c.env.DB.prepare("UPDATE rounds SET current_application_id = NULL, status = '준비'"),
  ]);

  await writeAuditLog(c.env.DB, {
    actorUserId: actor.id,
    actorName: actor.name,
    action: 'PURGE',
    detail: '전체 학생·면접 건·배정·질문·평가·결과지 데이터 파기',
    ip: extractClientIp(c),
  });

  return c.json({ ok: true });
});

// 데모 데이터 생성 / 삭제 (is_demo = 1)
adminRoutes.post('/demo/seed', async (c) => {
  const actor = c.get('user');
  const existing = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM students WHERE is_demo = 1')
    .first<Record<string, unknown>>();
  if (Number(existing?.cnt ?? 0) > 0) {
    return c.json({ error: '이미 데모 데이터가 존재합니다. 먼저 삭제해 주세요.' }, 409);
  }

  const [univRes, roundsRes, usersRes] = await Promise.all([
    c.env.DB.prepare('SELECT id, name, rubric FROM universities ORDER BY sort_order ASC').all(),
    c.env.DB.prepare('SELECT id FROM rounds ORDER BY created_at ASC LIMIT 1').all(),
    c.env.DB.prepare("SELECT id, name, roles FROM users WHERE status = 'active'").all(),
  ]);

  const univs = (univRes.results ?? []).map(mapUniversityRow);
  const roundRow = roundsRes.results?.[0];
  if (!roundRow || univs.length === 0) {
    return c.json({ error: '기본 회차와 대학 정보가 필요합니다.' }, 400);
  }
  const roundId = String(roundRow.id);

  const activeUsers = (usersRes.results ?? []).map(mapUserRow);
  const interviewers = activeUsers.filter(
    (u) => u.roles.includes('interviewer') || u.roles.includes('admin')
  );
  const assignedIds = interviewers.length > 0 ? interviewers.slice(0, 5).map((u) => u.id) : [actor.id];

  const nowIso = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];

  const demoStudents = [
    { no: 'DEMO-30101', name: '테스트학생1', cls: '3-1', major: '컴퓨터공학' },
    { no: 'DEMO-30102', name: '테스트학생2', cls: '3-1', major: '생명공학' },
    { no: 'DEMO-30201', name: '테스트학생3', cls: '3-2', major: '경영학' },
    { no: 'DEMO-30202', name: '테스트학생4', cls: '3-2', major: '기계공학' },
    { no: 'DEMO-30301', name: '테스트학생5', cls: '3-3', major: '미디어커뮤니케이션' },
    { no: 'DEMO-30302', name: '테스트학생6', cls: '3-3', major: '교육학' },
    { no: 'DEMO-30401', name: '테스트학생7', cls: '3-4', major: '화학공학' },
  ];

  const studentIds: string[] = [];
  for (const s of demoStudents) {
    const sid = crypto.randomUUID();
    studentIds.push(sid);
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO students (
          id, student_no, name, class_label, homeroom_user_id, desired_major, memo, active, is_demo, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, '데모 데이터', 1, 1, ?, ?)`
      ).bind(sid, s.no, s.name, s.cls, actor.id, s.major, nowIso, nowIso)
    );
  }

  // 8건 면접 (테스트학생1이 두 대학 면접)
  const appPlans = [
    { sIdx: 0, uIdx: 0, seq: 1, status: '완료' },
    { sIdx: 0, uIdx: 2 % univs.length, seq: 2, status: '완료' },
    { sIdx: 1, uIdx: 1 % univs.length, seq: 3, status: '면접 중' },
    { sIdx: 2, uIdx: 0, seq: 4, status: '대기' },
    { sIdx: 3, uIdx: 1 % univs.length, seq: 5, status: '대기' },
    { sIdx: 4, uIdx: 2 % univs.length, seq: 6, status: '대기' },
    { sIdx: 5, uIdx: 0, seq: 7, status: '대기' },
    { sIdx: 6, uIdx: 2 % univs.length, seq: 8, status: '대기' },
  ];

  let activeDemoAppId: string | null = null;
  for (let i = 0; i < appPlans.length; i++) {
    const p = appPlans[i];
    const appId = crypto.randomUUID();
    const univ = univs[p.uIdx];
    if (p.status === '면접 중') activeDemoAppId = appId;

    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO applications (
          id, student_id, university_id, round_id, major, notion_url, sequence_no, slot_time, status, is_demo, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'https://www.notion.so/demo-mock-questions', ?, '', ?, 1, ?, ?)`
      ).bind(
        appId,
        studentIds[p.sIdx],
        univ.id,
        roundId,
        demoStudents[p.sIdx].major,
        p.seq,
        p.status,
        nowIso,
        nowIso
      )
    );

    for (const uid of assignedIds) {
      stmts.push(
        c.env.DB.prepare(
          'INSERT OR IGNORE INTO application_interviewers (application_id, interviewer_user_id) VALUES (?, ?)'
        ).bind(appId, uid)
      );
    }

    if (p.status === '완료') {
      const sampleScores: Record<string, number> = {};
      univ.rubric.forEach((r, rIdx) => {
        sampleScores[r.key] = rIdx % 2 === 0 ? 4 : 5;
      });
      const conv = calculateConvertedScore(sampleScores, univ.rubric);
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO evaluations (
            id, application_id, interviewer_user_id, scores, converted_score, overall,
            quick_tags, question_checks, strengths, improvements, advice_to_student, note_to_admin,
            status, submitted_at, edited_after_submit, is_demo, updated_at
          ) VALUES (?, ?, ?, ?, ?, '우수', ?, '{}', ?, ?, ?, '', 'submitted', ?, 0, 1, ?)`
        ).bind(
          crypto.randomUUID(),
          appId,
          assignedIds[0],
          JSON.stringify(sampleScores),
          conv,
          JSON.stringify(['두괄식 답변 우수', '근거 구체적']),
          '전공 탐구 과정의 맥락을 구체적인 사례와 함께 명확히 제시하였습니다.',
          '꼬리질문 대응 시 핵심 결론을 먼저 제시하면 더욱 설득력이 높아집니다.',
          '자신의 탐구 과정과 배운 점을 자신감 있게 잘 설명했습니다. 실전에서도 두괄식 구성을 유지해 보세요.',
          nowIso,
          nowIso
        )
      );
    }
  }

  if (activeDemoAppId) {
    stmts.push(
      c.env.DB.prepare(
        "UPDATE rounds SET status = '진행 중', current_application_id = ? WHERE id = ?"
      ).bind(activeDemoAppId, roundId)
    );
  }

  for (let i = 0; i < stmts.length; i += 80) {
    await c.env.DB.batch(stmts.slice(i, i + 80));
  }

  return c.json({ ok: true, students: demoStudents.length, applications: appPlans.length });
});

adminRoutes.post('/demo/clear', async (c) => {
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM evaluations WHERE is_demo = 1'),
    c.env.DB.prepare(
      'DELETE FROM application_questions WHERE application_id IN (SELECT id FROM applications WHERE is_demo = 1)'
    ),
    c.env.DB.prepare(
      'DELETE FROM application_interviewers WHERE application_id IN (SELECT id FROM applications WHERE is_demo = 1)'
    ),
    c.env.DB.prepare('DELETE FROM applications WHERE is_demo = 1'),
    c.env.DB.prepare('DELETE FROM reports WHERE student_id IN (SELECT id FROM students WHERE is_demo = 1)'),
    c.env.DB.prepare('DELETE FROM students WHERE is_demo = 1'),
    c.env.DB.prepare(
      'UPDATE rounds SET current_application_id = NULL WHERE current_application_id IS NOT NULL AND current_application_id NOT IN (SELECT id FROM applications)'
    ),
  ]);

  return c.json({ ok: true });
});

export { adminRoutes };
