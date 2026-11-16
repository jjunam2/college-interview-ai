import { Hono } from 'hono';
import {
  getSettings,
  mapApplicationRow,
  mapEvaluationRow,
  mapReportRow,
  mapRoundRow,
} from '../db';
import type { AppHonoEnv } from '../env';
import { requireAuth, requireOnboarded } from '../permissions';
import type { ChangesResponse } from '../../src/types';

const changesRoutes = new Hono<AppHonoEnv>();

changesRoutes.use('*', requireAuth, requireOnboarded);

changesRoutes.get('/', async (c) => {
  const user = c.get('user');
  const since = c.req.query('since') || '1970-01-01T00:00:00.000Z';
  const roleHint = c.req.query('role') || '';
  const serverTime = new Date().toISOString();
  const settings = await getSettings(c.env.DB);

  const isAdmin = user.roles.includes('admin') && (roleHint === '' || roleHint === 'admin');
  const isInterviewer =
    user.roles.includes('interviewer') && (roleHint === '' || roleHint === 'interviewer');
  const isHomeroom =
    user.roles.includes('homeroom') && (roleHint === '' || roleHint === 'homeroom');

  const response: ChangesResponse = {
    hasChanges: false,
    serverTime,
    settings,
  };

  if (isAdmin) {
    const [roundsRes, roundIntsRes, appsRes, appIntsRes, evalsRes, reportsRes] = await Promise.all([
      c.env.DB.prepare('SELECT * FROM rounds ORDER BY date DESC, start_time DESC').all(),
      c.env.DB.prepare('SELECT round_id, user_id FROM round_interviewers').all(),
      c.env.DB.prepare('SELECT * FROM applications WHERE updated_at > ?').bind(since).all(),
      c.env.DB.prepare('SELECT application_id, interviewer_user_id FROM application_interviewers').all(),
      c.env.DB.prepare(
        `SELECT e.*, u.name AS interviewer_name
         FROM evaluations e
         JOIN users u ON u.id = e.interviewer_user_id
         WHERE e.updated_at > ?`
      )
        .bind(since)
        .all(),
      c.env.DB.prepare('SELECT * FROM reports').all(),
    ]);

    const roundIntMap = new Map<string, string[]>();
    for (const r of roundIntsRes.results ?? []) {
      const rid = String(r.round_id);
      const list = roundIntMap.get(rid) ?? [];
      list.push(String(r.user_id));
      roundIntMap.set(rid, list);
    }

    const appIntMap = new Map<string, string[]>();
    for (const r of appIntsRes.results ?? []) {
      const aid = String(r.application_id);
      const list = appIntMap.get(aid) ?? [];
      list.push(String(r.interviewer_user_id));
      appIntMap.set(aid, list);
    }

    response.rounds = (roundsRes.results ?? []).map((r) =>
      mapRoundRow(r, roundIntMap.get(String(r.id)) ?? [])
    );
    response.applications = (appsRes.results ?? []).map((a) =>
      mapApplicationRow(a, appIntMap.get(String(a.id)) ?? [])
    );
    response.evaluations = (evalsRes.results ?? []).map((e) => mapEvaluationRow(e, true));
    response.reports = (reportsRes.results ?? []).map(mapReportRow);
    response.hasChanges =
      (response.applications?.length ?? 0) > 0 || (response.evaluations?.length ?? 0) > 0;
    return c.json(response);
  }

  if (isInterviewer) {
    // 면접관은 현재 진행 중인 회차의 currentApplicationId와 본인 배정 건, 본인 평가만 조회
    const [roundsRes, appsRes, evalsRes] = await Promise.all([
      c.env.DB.prepare(
        `SELECT DISTINCT r.*
         FROM rounds r
         LEFT JOIN round_interviewers ri ON ri.round_id = r.id
         LEFT JOIN applications a ON a.round_id = r.id
         LEFT JOIN application_interviewers ai ON ai.application_id = a.id
         WHERE ri.user_id = ? OR ai.interviewer_user_id = ?`
      )
        .bind(user.id, user.id)
        .all(),
      c.env.DB.prepare(
        `SELECT a.*
         FROM applications a
         JOIN application_interviewers ai ON ai.application_id = a.id
         WHERE ai.interviewer_user_id = ? AND a.updated_at > ?`
      )
        .bind(user.id, since)
        .all(),
      c.env.DB.prepare(
        `SELECT e.*
         FROM evaluations e
         WHERE e.interviewer_user_id = ? AND e.updated_at > ?`
      )
        .bind(user.id, since)
        .all(),
    ]);

    response.rounds = (roundsRes.results ?? []).map((r) => mapRoundRow(r, []));
    response.applications = (appsRes.results ?? []).map((a) => mapApplicationRow(a, [user.id]));
    response.evaluations = (evalsRes.results ?? []).map((e) => mapEvaluationRow(e, true));
    response.hasChanges =
      (response.applications?.length ?? 0) > 0 ||
      (response.evaluations?.length ?? 0) > 0 ||
      (response.rounds?.length ?? 0) > 0;
    return c.json(response);
  }

  if (isHomeroom) {
    // 담임은 담당 학생의 제출 완료 평가(noteToAdmin 제외)와 확정 결과지만 조회
    const [appsRes, evalsRes, reportsRes] = await Promise.all([
      c.env.DB.prepare(
        `SELECT a.*
         FROM applications a
         JOIN students s ON s.id = a.student_id
         WHERE s.homeroom_user_id = ? AND a.updated_at > ?`
      )
        .bind(user.id, since)
        .all(),
      c.env.DB.prepare(
        `SELECT e.*, u.name AS interviewer_name
         FROM evaluations e
         JOIN applications a ON a.id = e.application_id
         JOIN students s ON s.id = a.student_id
         JOIN users u ON u.id = e.interviewer_user_id
         WHERE s.homeroom_user_id = ? AND e.status = 'submitted' AND e.updated_at > ?`
      )
        .bind(user.id, since)
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

    response.applications = (appsRes.results ?? []).map((a) => mapApplicationRow(a, []));
    response.evaluations = (evalsRes.results ?? []).map((e) => {
      const mapped = mapEvaluationRow(e, false);
      if (!settings.showInterviewerNamesToHomeroom) {
        delete mapped.interviewerName;
      }
      return mapped;
    });
    response.reports = (reportsRes.results ?? []).map(mapReportRow);
    response.hasChanges =
      (response.applications?.length ?? 0) > 0 || (response.evaluations?.length ?? 0) > 0;
    return c.json(response);
  }

  return c.json(response);
});

export { changesRoutes };
