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

export interface ApiClient {
  readonly isMock: boolean;

  health(): Promise<HealthResponse>;
  publicSettings(): Promise<{ eventName: string; schoolName: string; retentionUntil: string }>;

  // 인증
  getMe(): Promise<AuthState>;
  login(email: string, password: string): Promise<AuthState>;
  register(input: {
    name: string;
    email: string;
    dept: string;
    homeroomClass: string;
    requestedRoles: Array<'interviewer' | 'homeroom'>;
    password: string;
    entryCode: string;
  }): Promise<{ status: string; message: string }>;
  logout(): Promise<void>;
  completeOnboarding(input: { newPassword?: string; agreePledge: true }): Promise<{ user: User }>;
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<void>;
  unlock(password: string): Promise<void>;

  // 폴링
  getChanges(since: string, roleHint?: UserRole): Promise<ChangesResponse>;

  // 운영자
  getAdminWorkspace(): Promise<WorkspaceSnapshot>;
  createTeacher(input: {
    name: string;
    email: string;
    dept: string;
    homeroomClass: string;
    roles: UserRole[];
  }): Promise<{ user: User; tempPassword: string }>;
  approveTeacher(id: string, approved: boolean, roles?: UserRole[]): Promise<{ user: User }>;
  updateTeacher(
    id: string,
    input: { roles?: UserRole[]; dept?: string; homeroomClass?: string; status?: 'active' | 'disabled' }
  ): Promise<{ user: User }>;
  resetTeacherPassword(id: string): Promise<{ tempPassword: string }>;
  updateSettings(settings: Settings): Promise<{ settings: Settings }>;

  createUniversity(input: Omit<University, 'id'>): Promise<{ university: University }>;
  updateUniversity(id: string, input: Omit<University, 'id'>): Promise<{ university: University }>;
  deleteUniversity(id: string): Promise<void>;

  createRound(input: Omit<Round, 'id' | 'currentApplicationId' | 'createdAt' | 'interviewerIds'>): Promise<{ round: Round }>;
  updateRound(id: string, input: Omit<Round, 'id' | 'currentApplicationId' | 'createdAt' | 'interviewerIds'>): Promise<{ round: Round }>;
  setRoundInterviewers(roundId: string, interviewerIds: string[]): Promise<void>;
  startApplication(roundId: string, applicationId: string): Promise<void>;
  nextApplication(roundId: string): Promise<void>;
  reorderRound(roundId: string, orderedApplicationIds: string[]): Promise<void>;

  createStudent(input: {
    studentNo: string;
    name: string;
    classLabel: string;
    homeroomUserId: string | null;
    desiredMajor: string;
    memo: string;
    active: boolean;
  }): Promise<{ student: Student }>;
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
  ): Promise<{ student: Student }>;

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
  }): Promise<{ application: Application }>;
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
  ): Promise<{ application: Application }>;
  deleteApplication(id: string): Promise<void>;
  saveApplicationQuestions(appId: string, questions: string[]): Promise<{ questions: ApplicationQuestion[] }>;
  importCsv(
    roundId: string,
    rows: Omit<CsvImportRowInput, 'rowNumber' | 'error'>[]
  ): Promise<{ createdStudents: number; createdApplications: number }>;

  saveReport(studentId: string, adminComment: string, status: 'draft' | 'confirmed'): Promise<{ report: Report }>;
  confirmReportsBatch(studentIds: string[]): Promise<void>;

  getAuditLogs(filters?: { action?: string; actorUserId?: string; date?: string }): Promise<{ logs: AuditLog[] }>;
  recordCsvExport(detail?: string): Promise<void>;
  purgeAllData(confirmText: string): Promise<void>;
  seedDemoData(): Promise<void>;
  clearDemoData(): Promise<void>;

  // 면접관
  getInterviewerWorkspace(): Promise<Omit<WorkspaceSnapshot, 'teachers' | 'reports'>>;
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
  ): Promise<{ evaluation: Evaluation }>;
  openNotion(applicationId: string): Promise<void>;

  // 담임교사
  getHomeroomWorkspace(): Promise<Omit<WorkspaceSnapshot, 'teachers'>>;

  // 목업 전용 역할 전환 (실서버 모드에서는 undefined)
  setMockRole?(role: UserRole): User;
}
