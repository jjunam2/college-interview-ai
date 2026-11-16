import { Hono } from 'hono';
import {
  getSettings,
  mapApplicationRow,
  mapEvaluationRow,
  mapQuestionRow,
  mapReportRow,
  mapRoundRow,
  mapStudentRow,
  mapUniversityRow,
} from '../db';
import type { AppHonoEnv } from '../env';
import {
  isHomeroomAssigned,
  requireAuth,
  requireOnboarded,
  requireRole,
} from '../permissions';
import type { Evaluation } from '../../src/types';

const homeroomRoutes = new Hono<AppHonoEnv>();

homeroomRoutes.use('*', requireAuth, requireOnboarded, requireRole('homeroom', 'admin'));

function anonymizeEvaluationNames(
  evaluations: Evaluation[],
  showNames: boolean
): Evaluation[] {
  if (showNames) return evaluations;
  const labelLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const byApp = new Map<string, Map<string, string>>();
  return evaluations.map((ev) => {
    let appMap = byApp.get(ev.applicationId);
    if (!appMap) {
      appMap = new Map();
      byApp.set(ev.applicationId, appMap);
    }
    let label = appMap.get(ev.interviewerUserId);
    if (!label) {
      const idx = appMap.size;
      label = `면접관 ${labelLetters[idx % labelLetters.length]}`;
      appMap.set(ev.interviewerUserId, label);
    }
    return {
      ...ev,
      interviewerName: label,
    };
  });
}

homeroomRoutes.get('/workspace', async (c) => {
  const user = c.get('user');
  const settings = await getSettings(c.env.DB);
  const serverTime = new Date().toISOString();

  const [univRes, roundsRes, studentsRes, appsRes, questionsRes, evalsRes, reportsRes] =
    await Promise.all([
      c.env.DB.prepare('SELECT * FROM universities ORDER BY sort_order ASC').all(),
      c.env.DB.prepare('SELECT * FROM rounds ORDER BY date DESC, start_time DESC').all(),
      c.env.DB.prepare(
        `SELECT s.*, u.name AS homeroom_name
         FROM students s
         LEFT JOIN users u ON u.id = s.homeroom_user_id
         WHERE s.homeroom_user_id = ? AND s.active = 1
         ORDER BY s.student_no ASC`
      )
        .bind(user.id)
        .all(),
      c.env.DB.prepare(
        `SELECT a.*
         FROM applications a
         JOIN students s ON s.id = a.student_id
         WHERE s.homeroom_user_id = ?
         ORDER BY a.sequence_no ASC`
      )
        .bind(user.id)
        .all(),
      c.env.DB.prepare(
        `SELECT q.*
         FROM application_questions q
         JOIN applications a ON a.id = q.application_id
         JOIN students s ON s.id = a.student_id
         WHERE s.homeroom_user_id = ?
         ORDER BY q.seq ASC`
      )
        .bind(user.id)
        .all(),
      c.env.DB.prepare(
        `SELECT e.*, u.name AS interviewer_name
         FROM evaluations e
         JOIN applications a ON a.id = e.application_id
         JOIN students s ON s.id = a.student_id
         JOIN users u ON u.id = e.interviewer_user_id
         WHERE s.homeroom_user_id = ? AND e.status = 'submitted'
         ORDER BY e.submitted_at ASC`
      )
        .bind(user.id)
        .all(),
      c.env.DB.prepare(
        `SELECT rep.*
         FROM reports rep
         JOIN students s ON s.id = rep.student_id
         WHERE s.homeroom_user_id = ?`
      )
        .bind(user.id)
        .all(),
    ]);

  const rawEvals = (evalsRes.results ?? []).map((e) => mapEvaluationRow(e, false));
  const evaluations = anonymizeEvaluationNames(rawEvals, settings.showInterviewerNamesToHomeroom);

  return c.json({
    settings,
    universities: (univRes.results ?? []).map(mapUniversityRow),
    rounds: (roundsRes.results ?? []).map((r) => mapRoundRow(r, [])),
    students: (studentsRes.results ?? []).map(mapStudentRow),
    applications: (appsRes.results ?? []).map((a) => mapApplicationRow(a, [])),
    questions: (questionsRes.results ?? []).map(mapQuestionRow),
    evaluations,
    reports: (reportsRes.results ?? []).map(mapReportRow),
    serverTime,
  });
});

homeroomRoutes.get('/students/:id', async (c) => {
  const user = c.get('user');
  const studentId = c.req.param('id');

  const assigned = await isHomeroomAssigned(c.env.DB, user.id, studentId);
  if (!assigned) {
    return c.json({ error: '학생 정보를 찾을 수 없습니다.' }, 404);
  }

  const settings = await getSettings(c.env.DB);
  const [studentRow, appsRes, questionsRes, evalsRes, reportRow] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM students WHERE id = ?')
      .bind(studentId)
      .first<Record<string, unknown>>(),
    c.env.DB.prepare('SELECT * FROM applications WHERE student_id = ? ORDER BY sequence_no ASC')
      .bind(studentId)
      .all(),
    c.env.DB.prepare(
      `SELECT q.*
       FROM application_questions q
       JOIN applications a ON a.id = q.application_id
       WHERE a.student_id = ?
       ORDER BY q.seq ASC`
    )
      .bind(studentId)
      .all(),
    c.env.DB.prepare(
      `SELECT e.*, u.name AS interviewer_name
       FROM evaluations e
       JOIN applications a ON a.id = e.application_id
       JOIN users u ON u.id = e.interviewer_user_id
       WHERE a.student_id = ? AND e.status = 'submitted'
       ORDER BY e.submitted_at ASC`
    )
      .bind(studentId)
      .all(),
    c.env.DB.prepare('SELECT * FROM reports WHERE student_id = ?')
      .bind(studentId)
      .first<Record<string, unknown>>(),
  ]);

  if (!studentRow) {
    return c.json({ error: '학생 정보를 찾을 수 없습니다.' }, 404);
  }

  const rawEvals = (evalsRes.results ?? []).map((e) => mapEvaluationRow(e, false));
  const evaluations = anonymizeEvaluationNames(rawEvals, settings.showInterviewerNamesToHomeroom);

  return c.json({
    student: mapStudentRow(studentRow),
    applications: (appsRes.results ?? []).map((a) => mapApplicationRow(a, [])),
    questions: (questionsRes.results ?? []).map(mapQuestionRow),
    evaluations,
    report: reportRow ? mapReportRow(reportRow) : null,
  });
});

export { homeroomRoutes };
