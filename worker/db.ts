import type {
  Application,
  ApplicationQuestion,
  ApplicationStatus,
  AuditLog,
  Evaluation,
  EvaluationStatus,
  OverallJudgment,
  QuestionCheckValue,
  Report,
  Round,
  RoundStatus,
  RubricItem,
  Settings,
  Student,
  University,
  User,
  UserRole,
  UserStatus,
} from '../src/types';

export const DEFAULT_SETTINGS: Settings = {
  eventName: '덕신고 2027 대입 모의면접',
  schoolName: '덕신고등학교',
  maskStudentNames: false,
  showInterviewerNamesToHomeroom: false,
  retentionUntil: '2026-12-31',
  resultsLocked: false,
};

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function mapUserRow(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    dept: String(row.dept ?? ''),
    homeroomClass: String(row.homeroom_class ?? ''),
    requestedRoles: safeJsonParse<UserRole[]>(row.requested_roles as string, []),
    roles: safeJsonParse<UserRole[]>(row.roles as string, []),
    status: String(row.status) as UserStatus,
    mustChangePassword: Number(row.must_change_password) === 1,
    pledgeAgreedAt: (row.pledge_agreed_at as string | null) ?? null,
    createdAt: String(row.created_at),
    approvedBy: (row.approved_by as string | null) ?? null,
    approvedAt: (row.approved_at as string | null) ?? null,
  };
}

export function mapUniversityRow(row: Record<string, unknown>): University {
  return {
    id: String(row.id),
    name: String(row.name),
    admissionType: String(row.admission_type),
    interviewFormat: String(row.interview_format),
    durationMin: Number(row.duration_min),
    color: String(row.color),
    sortOrder: Number(row.sort_order),
    rubric: safeJsonParse<RubricItem[]>(row.rubric as string, []),
  };
}

export function mapRoundRow(row: Record<string, unknown>, interviewerIds: string[] = []): Round {
  return {
    id: String(row.id),
    name: String(row.name),
    date: String(row.date),
    startTime: String(row.start_time),
    room: String(row.room),
    status: String(row.status) as RoundStatus,
    currentApplicationId: (row.current_application_id as string | null) ?? null,
    createdAt: String(row.created_at),
    interviewerIds,
  };
}

export function mapStudentRow(row: Record<string, unknown>): Student {
  return {
    id: String(row.id),
    studentNo: String(row.student_no),
    name: String(row.name),
    classLabel: String(row.class_label),
    homeroomUserId: (row.homeroom_user_id as string | null) ?? null,
    homeroomName: row.homeroom_name ? String(row.homeroom_name) : null,
    desiredMajor: String(row.desired_major ?? ''),
    memo: String(row.memo ?? ''),
    active: Number(row.active) === 1,
    isDemo: Number(row.is_demo) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapApplicationRow(
  row: Record<string, unknown>,
  interviewerIds: string[] = []
): Application {
  return {
    id: String(row.id),
    studentId: String(row.student_id),
    universityId: String(row.university_id),
    roundId: String(row.round_id),
    major: String(row.major ?? ''),
    notionUrl: String(row.notion_url ?? ''),
    sequenceNo: Number(row.sequence_no),
    slotTime: String(row.slot_time ?? ''),
    status: String(row.status) as ApplicationStatus,
    isDemo: Number(row.is_demo) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    interviewerIds,
  };
}

export function mapQuestionRow(row: Record<string, unknown>): ApplicationQuestion {
  return {
    id: String(row.id),
    applicationId: String(row.application_id),
    seq: Number(row.seq),
    questionText: String(row.question_text),
    category: String(row.category ?? ''),
  };
}

export function mapEvaluationRow(row: Record<string, unknown>, includeAdminNote = true): Evaluation {
  const base: Evaluation = {
    id: String(row.id),
    applicationId: String(row.application_id),
    interviewerUserId: String(row.interviewer_user_id),
    interviewerName: row.interviewer_name ? String(row.interviewer_name) : undefined,
    scores: safeJsonParse<Record<string, number>>(row.scores as string, {}),
    convertedScore: Number(row.converted_score ?? 0),
    overall: String(row.overall ?? '보통') as OverallJudgment,
    quickTags: safeJsonParse<string[]>(row.quick_tags as string, []),
    questionChecks: safeJsonParse<Record<string, QuestionCheckValue>>(
      row.question_checks as string,
      {}
    ),
    strengths: String(row.strengths ?? ''),
    improvements: String(row.improvements ?? ''),
    adviceToStudent: String(row.advice_to_student ?? ''),
    status: String(row.status ?? 'draft') as EvaluationStatus,
    submittedAt: (row.submitted_at as string | null) ?? null,
    editedAfterSubmit: Number(row.edited_after_submit) === 1,
    isDemo: Number(row.is_demo) === 1,
    updatedAt: String(row.updated_at),
  };
  if (includeAdminNote) {
    base.noteToAdmin = String(row.note_to_admin ?? '');
  }
  return base;
}

export function mapReportRow(row: Record<string, unknown>): Report {
  return {
    studentId: String(row.student_id),
    status: String(row.status) as 'draft' | 'confirmed',
    adminComment: String(row.admin_comment ?? ''),
    confirmedBy: (row.confirmed_by as string | null) ?? null,
    confirmedAt: (row.confirmed_at as string | null) ?? null,
  };
}

export function mapAuditLogRow(row: Record<string, unknown>): AuditLog {
  return {
    id: String(row.id),
    actorUserId: (row.actor_user_id as string | null) ?? null,
    actorName: String(row.actor_name),
    action: String(row.action),
    targetStudentId: (row.target_student_id as string | null) ?? null,
    detail: String(row.detail ?? ''),
    ip: String(row.ip ?? ''),
    at: String(row.at),
  };
}

export async function getSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  const map = new Map<string, string>();
  for (const row of results ?? []) {
    map.set(String(row.key), String(row.value));
  }
  return {
    eventName: map.get('eventName') ?? DEFAULT_SETTINGS.eventName,
    schoolName: map.get('schoolName') ?? DEFAULT_SETTINGS.schoolName,
    maskStudentNames: map.get('maskStudentNames') === 'true',
    showInterviewerNamesToHomeroom: map.get('showInterviewerNamesToHomeroom') === 'true',
    retentionUntil: map.get('retentionUntil') ?? DEFAULT_SETTINGS.retentionUntil,
    resultsLocked: map.get('resultsLocked') === 'true',
  };
}

export async function writeAuditLog(
  db: D1Database,
  entry: {
    actorUserId: string | null;
    actorName: string;
    action: string;
    targetStudentId?: string | null;
    detail?: string;
    ip?: string;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, actor_user_id, actor_name, action, target_student_id, detail, ip, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      entry.actorUserId,
      entry.actorName,
      entry.action,
      entry.targetStudentId ?? null,
      entry.detail ?? '',
      entry.ip ?? '',
      new Date().toISOString()
    )
    .run();
}

export function calculateConvertedScore(
  scores: Record<string, number>,
  rubric: RubricItem[]
): number {
  let total = 0;
  for (const item of rubric) {
    const raw = scores[item.key];
    if (typeof raw === 'number' && raw >= 1 && raw <= 5) {
      total += (raw / 5) * item.weight;
    }
  }
  return Math.round(total * 10) / 10;
}

const ALLOWED_NOTION_HOSTS = new Set(['notion.so', 'www.notion.so', 'notion.site', 'app.notion.com']);

export function isValidNotionUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true; // 빈 링크 허용
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (ALLOWED_NOTION_HOSTS.has(host)) return true;
    if (host.endsWith('.notion.site')) return true;
    return false;
  } catch {
    return false;
  }
}
