import type { ApiClient } from './client';
import type {
  Application,
  ApplicationQuestion,
  AuditLog,
  AuthState,
  ChangesResponse,
  CsvImportRowInput,
  Evaluation,
  HealthResponse,
  OverallJudgment,
  QuestionCheckValue,
  Report,
  Round,
  Settings,
  Student,
  University,
  User,
  UserRole,
  WorkspaceSnapshot,
} from '../types';

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('X-Requested-With', 'fetch');
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json');
    }
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'same-origin',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof (data as { error?: string }).error === 'string'
        ? (data as { error: string }).error
        : `요청 처리 중 오류가 발생했습니다. (${res.status})`;
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = (data as { code?: string }).code;
    throw err;
  }
  return data as T;
}

export class RealApiClient implements ApiClient {
  readonly isMock = false;

  async health(): Promise<HealthResponse> {
    const res = await fetch('/api/health', { credentials: 'same-origin' });
    if (!res.ok) {
      throw new Error('Health check failed');
    }
    return (await res.json()) as HealthResponse;
  }

  publicSettings() {
    return requestJson<{ eventName: string; schoolName: string; retentionUntil: string }>(
      '/api/public-settings'
    );
  }

  getMe() {
    return requestJson<AuthState>('/api/auth/me');
  }

  login(email: string, password: string) {
    return requestJson<AuthState>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  register(input: {
    name: string;
    email: string;
    dept: string;
    homeroomClass: string;
    requestedRoles: Array<'interviewer' | 'homeroom'>;
    password: string;
    entryCode: string;
  }) {
    return requestJson<{ status: string; message: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async logout() {
    await requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  }

  completeOnboarding(input: { newPassword?: string; agreePledge: true }) {
    return requestJson<{ user: User }>('/api/auth/complete-onboarding', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async changePassword(input: { currentPassword: string; newPassword: string }) {
    await requestJson<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async unlock(password: string) {
    await requestJson<{ ok: boolean }>('/api/auth/unlock', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  getChanges(since: string, roleHint?: UserRole) {
    const params = new URLSearchParams({ since });
    if (roleHint) params.set('role', roleHint);
    return requestJson<ChangesResponse>(`/api/changes?${params.toString()}`);
  }

  getAdminWorkspace() {
    return requestJson<WorkspaceSnapshot>('/api/admin/workspace');
  }

  createTeacher(input: {
    name: string;
    email: string;
    dept: string;
    homeroomClass: string;
    roles: UserRole[];
  }) {
    return requestJson<{ user: User; tempPassword: string }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  approveTeacher(id: string, approved: boolean, roles?: UserRole[]) {
    return requestJson<{ user: User }>(`/api/admin/users/${encodeURIComponent(id)}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ approved, roles }),
    });
  }

  updateTeacher(
    id: string,
    input: { roles?: UserRole[]; dept?: string; homeroomClass?: string; status?: 'active' | 'disabled' }
  ) {
    return requestJson<{ user: User }>(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  resetTeacherPassword(id: string) {
    return requestJson<{ tempPassword: string }>(
      `/api/admin/users/${encodeURIComponent(id)}/reset-password`,
      { method: 'POST' }
    );
  }

  updateSettings(settings: Settings) {
    return requestJson<{ settings: Settings }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  createUniversity(input: Omit<University, 'id'>) {
    return requestJson<{ university: University }>('/api/admin/universities', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateUniversity(id: string, input: Omit<University, 'id'>) {
    return requestJson<{ university: University }>(
      `/api/admin/universities/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      }
    );
  }

  async deleteUniversity(id: string) {
    await requestJson<{ ok: boolean }>(`/api/admin/universities/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  createRound(
    input: Omit<Round, 'id' | 'currentApplicationId' | 'createdAt' | 'interviewerIds'>
  ) {
    return requestJson<{ round: Round }>('/api/admin/rounds', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateRound(
    id: string,
    input: Omit<Round, 'id' | 'currentApplicationId' | 'createdAt' | 'interviewerIds'>
  ) {
    return requestJson<{ round: Round }>(`/api/admin/rounds/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  async setRoundInterviewers(roundId: string, interviewerIds: string[]) {
    await requestJson<{ ok: boolean }>(
      `/api/admin/rounds/${encodeURIComponent(roundId)}/interviewers`,
      {
        method: 'PUT',
        body: JSON.stringify({ interviewerIds }),
      }
    );
  }

  async startApplication(roundId: string, applicationId: string) {
    await requestJson<{ ok: boolean }>(
      `/api/admin/rounds/${encodeURIComponent(roundId)}/start-application`,
      {
        method: 'POST',
        body: JSON.stringify({ applicationId }),
      }
    );
  }

  async nextApplication(roundId: string) {
    await requestJson<{ ok: boolean }>(
      `/api/admin/rounds/${encodeURIComponent(roundId)}/next-application`,
      { method: 'POST' }
    );
  }

  async reorderRound(roundId: string, orderedApplicationIds: string[]) {
    await requestJson<{ ok: boolean }>(
      `/api/admin/rounds/${encodeURIComponent(roundId)}/reorder`,
      {
        method: 'POST',
        body: JSON.stringify({ orderedApplicationIds }),
      }
    );
  }

  createStudent(input: {
    studentNo: string;
    name: string;
    classLabel: string;
    homeroomUserId: string | null;
    desiredMajor: string;
    memo: string;
    active: boolean;
  }) {
    return requestJson<{ student: Student }>('/api/admin/students', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateStudent(
    id: string,
    input: {
      studentNo: string;
      name: string;
      classLabel: string;
      homeroomUserId: string | null;
      desiredMajor: string;
      memo: string;
      active: boolean;
    }
  ) {
    return requestJson<{ student: Student }>(`/api/admin/students/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  createApplication(input: {
    studentId: string;
    universityId: string;
    roundId: string;
    major: string;
    notionUrl: string;
    sequenceNo: number;
    slotTime: string;
    status: Application['status'];
    interviewerIds?: string[];
  }) {
    return requestJson<{ application: Application }>('/api/admin/applications', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateApplication(
    id: string,
    input: Partial<{
      universityId: string;
      roundId: string;
      major: string;
      notionUrl: string;
      sequenceNo: number;
      slotTime: string;
      status: Application['status'];
      interviewerIds: string[];
    }>
  ) {
    return requestJson<{ application: Application }>(
      `/api/admin/applications/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      }
    );
  }

  async deleteApplication(id: string) {
    await requestJson<{ ok: boolean }>(`/api/admin/applications/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  saveApplicationQuestions(appId: string, questions: string[]) {
    return requestJson<{ questions: ApplicationQuestion[] }>(
      `/api/admin/applications/${encodeURIComponent(appId)}/questions`,
      {
        method: 'PUT',
        body: JSON.stringify({ questions }),
      }
    );
  }

  importCsv(roundId: string, rows: Omit<CsvImportRowInput, 'rowNumber' | 'error'>[]) {
    return requestJson<{ createdStudents: number; createdApplications: number }>(
      '/api/admin/students/import-csv',
      {
        method: 'POST',
        body: JSON.stringify({ roundId, rows }),
      }
    );
  }

  saveReport(studentId: string, adminComment: string, status: 'draft' | 'confirmed') {
    return requestJson<{ report: Report }>(
      `/api/admin/reports/${encodeURIComponent(studentId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ adminComment, status }),
      }
    );
  }

  async confirmReportsBatch(studentIds: string[]) {
    await requestJson<{ ok: boolean }>('/api/admin/reports/confirm-batch', {
      method: 'POST',
      body: JSON.stringify({ studentIds }),
    });
  }

  getAuditLogs(filters?: { action?: string; actorUserId?: string; date?: string }) {
    const params = new URLSearchParams();
    if (filters?.action) params.set('action', filters.action);
    if (filters?.actorUserId) params.set('actorUserId', filters.actorUserId);
    if (filters?.date) params.set('date', filters.date);
    const qs = params.toString();
    return requestJson<{ logs: AuditLog[] }>(`/api/admin/audit-logs${qs ? `?${qs}` : ''}`);
  }

  async recordCsvExport(detail?: string) {
    await requestJson<{ ok: boolean }>('/api/admin/audit-export-csv', {
      method: 'POST',
      body: JSON.stringify({ detail }),
    });
  }

  async purgeAllData(confirmText: string) {
    await requestJson<{ ok: boolean }>('/api/admin/purge', {
      method: 'POST',
      body: JSON.stringify({ confirmText }),
    });
  }

  async seedDemoData() {
    await requestJson<{ ok: boolean }>('/api/admin/demo/seed', { method: 'POST' });
  }

  async clearDemoData() {
    await requestJson<{ ok: boolean }>('/api/admin/demo/clear', { method: 'POST' });
  }

  getInterviewerWorkspace() {
    return requestJson<Omit<WorkspaceSnapshot, 'teachers' | 'reports'>>(
      '/api/interviewer/workspace'
    );
  }

  saveEvaluation(
    applicationId: string,
    input: {
      scores: Record<string, number>;
      overall: OverallJudgment;
      quickTags: string[];
      questionChecks: Record<string, QuestionCheckValue>;
      strengths: string;
      improvements: string;
      adviceToStudent: string;
      noteToAdmin: string;
      status: 'draft' | 'submitted';
    }
  ) {
    return requestJson<{ evaluation: Evaluation }>(
      `/api/interviewer/applications/${encodeURIComponent(applicationId)}/evaluation`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      }
    );
  }

  async openNotion(applicationId: string) {
    await requestJson<{ ok: boolean }>(
      `/api/interviewer/applications/${encodeURIComponent(applicationId)}/open-notion`,
      { method: 'POST' }
    );
  }

  getHomeroomWorkspace() {
    return requestJson<Omit<WorkspaceSnapshot, 'teachers'>>('/api/homeroom/workspace');
  }
}
