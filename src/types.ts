export type UserRole = 'admin' | 'interviewer' | 'homeroom';
export type UserStatus = 'pending' | 'active' | 'disabled';

export interface User {
  id: string;
  email: string;
  name: string;
  dept: string;
  homeroomClass: string;
  requestedRoles: UserRole[];
  roles: UserRole[];
  status: UserStatus;
  mustChangePassword: boolean;
  pledgeAgreedAt: string | null;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface Settings {
  eventName: string;
  schoolName: string;
  maskStudentNames: boolean;
  showInterviewerNamesToHomeroom: boolean;
  retentionUntil: string;
  resultsLocked: boolean;
}

export interface RubricAnchors {
  '5': string;
  '3': string;
  '1': string;
}

export interface RubricItem {
  key: string;
  label: string;
  description: string;
  weight: number;
  anchors: RubricAnchors;
}

export interface University {
  id: string;
  name: string;
  admissionType: string;
  interviewFormat: string;
  durationMin: number;
  color: string;
  sortOrder: number;
  rubric: RubricItem[];
}

export type RoundStatus = '준비' | '진행 중' | '종료';

export interface Round {
  id: string;
  name: string;
  date: string;
  startTime: string;
  room: string;
  status: RoundStatus;
  currentApplicationId: string | null;
  createdAt: string;
  interviewerIds: string[];
}

export interface Student {
  id: string;
  studentNo: string;
  name: string;
  classLabel: string;
  homeroomUserId: string | null;
  homeroomName?: string | null;
  desiredMajor: string;
  memo: string;
  active: boolean;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ApplicationStatus = '대기' | '면접 중' | '완료' | '결시';

export interface Application {
  id: string;
  studentId: string;
  universityId: string;
  roundId: string;
  major: string;
  notionUrl: string;
  sequenceNo: number;
  slotTime: string;
  status: ApplicationStatus;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  interviewerIds: string[];
  questions?: ApplicationQuestion[];
}

export interface ApplicationQuestion {
  id: string;
  applicationId: string;
  seq: number;
  questionText: string;
  category: string;
}

export type OverallJudgment = '우수' | '보통' | '보완 필요';
export type QuestionCheckValue = 'asked' | 'good' | 'needs_work';
export type EvaluationStatus = 'draft' | 'submitted';

export interface Evaluation {
  id: string;
  applicationId: string;
  interviewerUserId: string;
  interviewerName?: string;
  scores: Record<string, number>;
  convertedScore: number;
  overall: OverallJudgment;
  quickTags: string[];
  questionChecks: Record<string, QuestionCheckValue>;
  strengths: string;
  improvements: string;
  adviceToStudent: string;
  noteToAdmin?: string;
  status: EvaluationStatus;
  submittedAt: string | null;
  editedAfterSubmit: boolean;
  isDemo: boolean;
  updatedAt: string;
}

export interface Report {
  studentId: string;
  status: 'draft' | 'confirmed';
  adminComment: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAIL'
  | 'CREATE_USER'
  | 'APPROVE_USER'
  | 'RESET_PASSWORD'
  | 'OPEN_NOTION'
  | 'EXPORT_CSV'
  | 'CONFIRM_REPORT'
  | 'PURGE';

export interface AuditLog {
  id: string;
  actorUserId: string | null;
  actorName: string;
  action: string;
  targetStudentId: string | null;
  detail: string;
  ip: string;
  at: string;
}

export interface HealthResponse {
  ok: boolean;
  db: boolean | string;
  secrets: boolean;
}

export interface AuthState {
  user: User | null;
  settings: Settings;
}

export interface WorkspaceSnapshot {
  settings: Settings;
  universities: University[];
  rounds: Round[];
  teachers: User[];
  students: Student[];
  applications: Application[];
  questions: ApplicationQuestion[];
  evaluations: Evaluation[];
  reports: Report[];
  serverTime: string;
}

export interface ChangesResponse {
  hasChanges: boolean;
  serverTime: string;
  rounds?: Round[];
  applications?: Application[];
  evaluations?: Evaluation[];
  reports?: Report[];
  settings?: Settings;
}

export interface CsvImportRowInput {
  rowNumber: number;
  studentNo: string;
  name: string;
  classLabel: string;
  homeroomEmail: string;
  universityName: string;
  major: string;
  sequenceNo: number;
  notionUrl: string;
  error?: string;
}

export const QUICK_TAG_OPTIONS = [
  '두괄식 답변 우수',
  '근거 구체적',
  '답변이 장황함',
  '근거 부족',
  '질문 의도 오해',
  '활동 내용 숙지 부족',
  '말 속도 빠름',
  '시선 처리 불안정',
  '자신감 있는 태도',
  '전공 이해도 높음',
] as const;

export const PLEDGE_TEXT =
  '본인은 모의면접 운영 목적 외에 학생 평가 정보와 면접 자료를 열람·복제·유출하지 않으며, 행사 종료 후 개인 기기에 저장된 자료를 즉시 삭제할 것을 서약합니다.';
