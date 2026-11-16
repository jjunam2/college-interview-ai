import { Hono } from 'hono';
import { z } from 'zod';
import {
  calculateConvertedScore,
  getSettings,
  mapApplicationRow,
  mapEvaluationRow,
  mapQuestionRow,
  mapRoundRow,
  mapStudentRow,
  mapUniversityRow,
  writeAuditLog,
} from '../db';
import type { AppHonoEnv } from '../env';
import {
  extractClientIp,
  isInterviewerAssigned,
  requireAuth,
  requireOnboarded,
  requireRole,
} from '../permissions';

const interviewerRoutes = new Hono<AppHonoEnv>();

interviewerRoutes.use('*', requireAuth, requireOnboarded, requireRole('interviewer', 'admin'));

const evaluationSchema = z.object({
  scores: z.record(z.string(), z.number().int().min(1).max(5)),
  overall: z.enum(['우수', '보통', '보완 필요']),
  quickTags: z.array(z.string().max(40)).max(20),
  questionChecks: z.record(z.string(), z.enum(['asked', 'good', 'needs_work'])),
  strengths: z.string().max(2000).default(''),
  improvements: z.string().max(2000).default(''),
  adviceToStudent: z.string().max(500, '학생에게 전하는 조언은 500자 이내로 입력하세요.').default(''),
  noteToAdmin: z.string().max(2000).default(''),
  status: z.enum(['draft', 'submitted']),
});

interviewerRoutes.get('/workspace', async (c) => {
  const user = c.get('user');
  const settings = await getSettings(c.env.DB);
  const serverTime = new Date().toISOString();

  const [univRes, roundsRes, appsRes, studentsRes, questionsRes, evalsRes] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM universities ORDER BY sort_order ASC').all(),
    c.env.DB.prepare(
      `SELECT DISTINCT r.*
       FROM rounds r
       LEFT JOIN round_interviewers ri ON ri.round_id = r.id
       LEFT JOIN applications a ON a.round_id = r.id
       LEFT JOIN application_interviewers ai ON ai.application_id = a.id
       WHERE ri.user_id = ? OR ai.interviewer_user_id = ?
       ORDER BY r.date DESC, r.start_time DESC`
    )
      .bind(user.id, user.id)
      .all(),
    c.env.DB.prepare(
      `SELECT a.*
       FROM applications a
       JOIN application_interviewers ai ON ai.application_id = a.id
       WHERE ai.interviewer_user_id = ?
       ORDER BY a.sequence_no ASC`
    )
      .bind(user.id)
      .all(),
    c.env.DB.prepare(
      `SELECT DISTINCT s.*, u.name AS homeroom_name
       FROM students s
       JOIN applications a ON a.student_id = s.id
       JOIN application_interviewers ai ON ai.application_id = a.id
       LEFT JOIN users u ON u.id = s.homeroom_user_id
       WHERE ai.interviewer_user_id = ?`
    )
      .bind(user.id)
      .all(),
    c.env.DB.prepare(
      `SELECT q.*
       FROM application_questions q
       JOIN application_interviewers ai ON ai.application_id = q.application_id
       WHERE ai.interviewer_user_id = ?
       ORDER BY q.seq ASC`
    )
      .bind(user.id)
      .all(),
    c.env.DB.prepare(
      `SELECT e.*
       FROM evaluations e
       WHERE e.interviewer_user_id = ?`
    )
      .bind(user.id)
      .all(),
  ]);

  return c.json({
    settings,
    universities: (univRes.results ?? []).map(mapUniversityRow),
    rounds: (roundsRes.results ?? []).map((r) => mapRoundRow(r, [user.id])),
    students: (studentsRes.results ?? []).map(mapStudentRow),
    applications: (appsRes.results ?? []).map((a) => mapApplicationRow(a, [user.id])),
    questions: (questionsRes.results ?? []).map(mapQuestionRow),
    evaluations: (evalsRes.results ?? []).map((e) => mapEvaluationRow(e, true)),
    serverTime,
  });
});

interviewerRoutes.get('/applications/:id', async (c) => {
  const user = c.get('user');
  const appId = c.req.param('id');

  const assigned = await isInterviewerAssigned(c.env.DB, user.id, appId);
  if (!assigned) {
    return c.json({ error: '요청한 면접 건을 찾을 수 없습니다.' }, 404);
  }

  const appRow = await c.env.DB.prepare('SELECT * FROM applications WHERE id = ?')
    .bind(appId)
    .first<Record<string, unknown>>();
  if (!appRow) {
    return c.json({ error: '요청한 면접 건을 찾을 수 없습니다.' }, 404);
  }

  const [studentRow, univRow, questionsRes, evalRow] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM students WHERE id = ?')
      .bind(String(appRow.student_id))
      .first<Record<string, unknown>>(),
    c.env.DB.prepare('SELECT * FROM universities WHERE id = ?')
      .bind(String(appRow.university_id))
      .first<Record<string, unknown>>(),
    c.env.DB.prepare('SELECT * FROM application_questions WHERE application_id = ? ORDER BY seq ASC')
      .bind(appId)
      .all(),
    c.env.DB.prepare(
      'SELECT * FROM evaluations WHERE application_id = ? AND interviewer_user_id = ?'
    )
      .bind(appId, user.id)
      .first<Record<string, unknown>>(),
  ]);

  return c.json({
    application: mapApplicationRow(appRow, [user.id]),
    student: studentRow ? mapStudentRow(studentRow) : null,
    university: univRow ? mapUniversityRow(univRow) : null,
    questions: (questionsRes.results ?? []).map(mapQuestionRow),
    evaluation: evalRow ? mapEvaluationRow(evalRow, true) : null,
  });
});

interviewerRoutes.put('/applications/:id/evaluation', async (c) => {
  const user = c.get('user');
  const appId = c.req.param('id');

  const settings = await getSettings(c.env.DB);
  if (settings.resultsLocked) {
    return c.json({ error: '평가가 잠금 상태이므로 저장하거나 수정할 수 없습니다.' }, 403);
  }

  const assigned = await isInterviewerAssigned(c.env.DB, user.id, appId);
  if (!assigned) {
    return c.json({ error: '요청한 면접 건을 찾을 수 없습니다.' }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = evaluationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }, 400);
  }

  const appRow = await c.env.DB.prepare('SELECT * FROM applications WHERE id = ?')
    .bind(appId)
    .first<Record<string, unknown>>();
  if (!appRow) {
    return c.json({ error: '요청한 면접 건을 찾을 수 없습니다.' }, 404);
  }

  const univRow = await c.env.DB.prepare('SELECT * FROM universities WHERE id = ?')
    .bind(String(appRow.university_id))
    .first<Record<string, unknown>>();
  if (!univRow) {
    return c.json({ error: '대학 평가 기준을 찾을 수 없습니다.' }, 404);
  }

  const university = mapUniversityRow(univRow);
  const data = parsed.data;

  if (data.status === 'submitted') {
    for (const item of university.rubric) {
      const score = data.scores[item.key];
      if (typeof score !== 'number' || score < 1 || score > 5) {
        return c.json({ error: `'${item.label}' 점수를 선택해 주세요.` }, 400);
      }
    }
  }

  const convertedScore = calculateConvertedScore(data.scores, university.rubric);
  const nowIso = new Date().toISOString();

  const existing = await c.env.DB.prepare(
    'SELECT id, status, submitted_at, edited_after_submit FROM evaluations WHERE application_id = ? AND interviewer_user_id = ?'
  )
    .bind(appId, user.id)
    .first<Record<string, unknown>>();

  const wasSubmitted = existing && String(existing.status) === 'submitted';
  const editedAfterSubmit =
    wasSubmitted || (existing && Number(existing.edited_after_submit) === 1) ? 1 : 0;
  const submittedAt =
    data.status === 'submitted'
      ? (existing?.submitted_at as string | null) ?? nowIso
      : (existing?.submitted_at as string | null) ?? null;

  const evalId = existing ? String(existing.id) : crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO evaluations (
      id, application_id, interviewer_user_id, scores, converted_score, overall,
      quick_tags, question_checks, strengths, improvements, advice_to_student, note_to_admin,
      status, submitted_at, edited_after_submit, is_demo, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(application_id, interviewer_user_id) DO UPDATE SET
      scores = excluded.scores,
      converted_score = excluded.converted_score,
      overall = excluded.overall,
      quick_tags = excluded.quick_tags,
      question_checks = excluded.question_checks,
      strengths = excluded.strengths,
      improvements = excluded.improvements,
      advice_to_student = excluded.advice_to_student,
      note_to_admin = excluded.note_to_admin,
      status = excluded.status,
      submitted_at = excluded.submitted_at,
      edited_after_submit = excluded.edited_after_submit,
      updated_at = excluded.updated_at`
  )
    .bind(
      evalId,
      appId,
      user.id,
      JSON.stringify(data.scores),
      convertedScore,
      data.overall,
      JSON.stringify(data.quickTags),
      JSON.stringify(data.questionChecks),
      data.strengths,
      data.improvements,
      data.adviceToStudent,
      data.noteToAdmin,
      data.status,
      submittedAt,
      editedAfterSubmit,
      Number(appRow.is_demo ?? 0),
      nowIso
    )
    .run();

  const saved = await c.env.DB.prepare('SELECT * FROM evaluations WHERE id = ?')
    .bind(evalId)
    .first<Record<string, unknown>>();

  return c.json({ evaluation: mapEvaluationRow(saved!, true) });
});

interviewerRoutes.post('/applications/:id/open-notion', async (c) => {
  const user = c.get('user');
  const appId = c.req.param('id');

  const assigned = await isInterviewerAssigned(c.env.DB, user.id, appId);
  if (!assigned && !user.roles.includes('admin')) {
    return c.json({ error: '요청한 면접 건을 찾을 수 없습니다.' }, 404);
  }

  const appRow = await c.env.DB.prepare('SELECT student_id, notion_url FROM applications WHERE id = ?')
    .bind(appId)
    .first<Record<string, unknown>>();
  if (!appRow) {
    return c.json({ error: '요청한 면접 건을 찾을 수 없습니다.' }, 404);
  }

  await writeAuditLog(c.env.DB, {
    actorUserId: user.id,
    actorName: user.name,
    action: 'OPEN_NOTION',
    targetStudentId: String(appRow.student_id),
    detail: `모의질문 노션 열람 (${String(appRow.notion_url || '링크 없음')})`,
    ip: extractClientIp(c),
  });

  return c.json({ ok: true });
});

export { interviewerRoutes };
