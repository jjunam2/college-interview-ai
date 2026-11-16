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
  RubricItem,
  Settings,
  Student,
  University,
  User,
  UserRole,
  WorkspaceSnapshot,
} from '../types';
import { calculateConvertedScore, isAllowedNotionUrl } from '../utils/format';

const DEFAULT_RUBRIC: RubricItem[] = [
  {
    key: 'academic',
    label: '학업역량',
    description: '교과 학습과 탐구 경험을 구체적 과정과 결과로 설명하는가',
    weight: 25,
    anchors: {
      '5': '구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨',
      '3': '사례는 있으나 과정이나 의미 설명이 부족함',
      '1': '사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함',
    },
  },
  {
    key: 'career',
    label: '진로역량',
    description: '지원 전공(계열)을 향한 탐색 경험과 동기가 일관되게 연결되는가',
    weight: 25,
    anchors: {
      '5': '구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨',
      '3': '사례는 있으나 과정이나 의미 설명이 부족함',
      '1': '사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함',
    },
  },
  {
    key: 'community',
    label: '공동체역량',
    description: '협업·나눔·책임 경험과 그 과정에서의 성찰이 드러나는가',
    weight: 20,
    anchors: {
      '5': '구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨',
      '3': '사례는 있으나 과정이나 의미 설명이 부족함',
      '1': '사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함',
    },
  },
  {
    key: 'communication',
    label: '논리적 의사소통',
    description: '질문 의도를 파악하고 근거를 들어 두괄식으로 답하며 꼬리질문에 대응하는가',
    weight: 20,
    anchors: {
      '5': '구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨',
      '3': '사례는 있으나 과정이나 의미 설명이 부족함',
      '1': '사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함',
    },
  },
  {
    key: 'attitude',
    label: '서류 일치도·태도',
    description: '자신의 활동을 정확히 설명하고 자기주도성이 보이며 면접 태도가 바른가',
    weight: 10,
    anchors: {
      '5': '구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨',
      '3': '사례는 있으나 과정이나 의미 설명이 부족함',
      '1': '사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함',
    },
  },
];

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export class MockApiClient implements ApiClient {
  readonly isMock = true;

  private currentRole: UserRole = 'admin';
  private settings: Settings = {
    eventName: '덕신고 2027 대입 모의면접',
    schoolName: '덕신고등학교',
    maskStudentNames: false,
    showInterviewerNamesToHomeroom: false,
    retentionUntil: '2026-12-31',
    resultsLocked: false,
  };

  private teachers: User[] = [
    {
      id: 'mock-admin',
      email: 'admin@demo.invalid',
      name: '운영교사(미리보기)',
      dept: '진로진학부',
      homeroomClass: '',
      requestedRoles: ['admin'],
      roles: ['admin', 'interviewer', 'homeroom'],
      status: 'active',
      mustChangePassword: false,
      pledgeAgreedAt: '2026-11-16T00:00:00.000Z',
      createdAt: '2026-11-15T00:00:00.000Z',
      approvedBy: 'bootstrap',
      approvedAt: '2026-11-15T00:00:00.000Z',
    },
    {
      id: 'mock-int-1',
      email: 'teacher1@demo.invalid',
      name: '면접위원1',
      dept: '국어과',
      homeroomClass: '3-1',
      requestedRoles: ['interviewer', 'homeroom'],
      roles: ['interviewer', 'homeroom'],
      status: 'active',
      mustChangePassword: false,
      pledgeAgreedAt: '2026-11-16T00:00:00.000Z',
      createdAt: '2026-11-15T00:00:00.000Z',
      approvedBy: 'mock-admin',
      approvedAt: '2026-11-15T00:00:00.000Z',
    },
    {
      id: 'mock-int-2',
      email: 'teacher2@demo.invalid',
      name: '면접위원2',
      dept: '수학과',
      homeroomClass: '3-2',
      requestedRoles: ['interviewer', 'homeroom'],
      roles: ['interviewer', 'homeroom'],
      status: 'active',
      mustChangePassword: false,
      pledgeAgreedAt: '2026-11-16T00:00:00.000Z',
      createdAt: '2026-11-15T00:00:00.000Z',
      approvedBy: 'mock-admin',
      approvedAt: '2026-11-15T00:00:00.000Z',
    },
    {
      id: 'mock-int-3',
      email: 'teacher3@demo.invalid',
      name: '면접위원3',
      dept: '과학과',
      homeroomClass: '',
      requestedRoles: ['interviewer'],
      roles: ['interviewer'],
      status: 'active',
      mustChangePassword: false,
      pledgeAgreedAt: '2026-11-16T00:00:00.000Z',
      createdAt: '2026-11-15T00:00:00.000Z',
      approvedBy: 'mock-admin',
      approvedAt: '2026-11-15T00:00:00.000Z',
    },
    {
      id: 'mock-int-4',
      email: 'teacher4@demo.invalid',
      name: '면접위원4',
      dept: '사회과',
      homeroomClass: '3-3',
      requestedRoles: ['interviewer', 'homeroom'],
      roles: ['interviewer', 'homeroom'],
      status: 'active',
      mustChangePassword: false,
      pledgeAgreedAt: '2026-11-16T00:00:00.000Z',
      createdAt: '2026-11-15T00:00:00.000Z',
      approvedBy: 'mock-admin',
      approvedAt: '2026-11-15T00:00:00.000Z',
    },
    {
      id: 'mock-int-5',
      email: 'teacher5@demo.invalid',
      name: '면접위원5',
      dept: '영어과',
      homeroomClass: '',
      requestedRoles: ['interviewer'],
      roles: ['interviewer'],
      status: 'active',
      mustChangePassword: false,
      pledgeAgreedAt: '2026-11-16T00:00:00.000Z',
      createdAt: '2026-11-15T00:00:00.000Z',
      approvedBy: 'mock-admin',
      approvedAt: '2026-11-15T00:00:00.000Z',
    },
    {
      id: 'mock-pending-1',
      email: 'pending@demo.invalid',
      name: '승인대기교사',
      dept: '진로상담부',
      homeroomClass: '3-4',
      requestedRoles: ['interviewer', 'homeroom'],
      roles: [],
      status: 'pending',
      mustChangePassword: false,
      pledgeAgreedAt: null,
      createdAt: '2026-11-16T08:00:00.000Z',
      approvedBy: null,
      approvedAt: null,
    },
  ];

  private universities: University[] = [
    {
      id: 'univ-inha',
      name: '인하대학교',
      admissionType: '인하미래인재전형',
      interviewFormat: '제출 서류 기반 확인 면접 (개별 패널)',
      durationMin: 10,
      color: '#1E40AF',
      sortOrder: 1,
      rubric: clone(DEFAULT_RUBRIC),
    },
    {
      id: 'univ-incheon',
      name: '인천대학교',
      admissionType: '자기추천전형',
      interviewFormat: '제출 서류 기반 종합 면접 (개별 패널)',
      durationMin: 10,
      color: '#0F766E',
      sortOrder: 2,
      rubric: clone(DEFAULT_RUBRIC),
    },
    {
      id: 'univ-dongguk',
      name: '동국대학교',
      admissionType: 'Do Dream 전형',
      interviewFormat: '전공 적합성 및 서류 기반 면접 (개별 패널)',
      durationMin: 10,
      color: '#B45309',
      sortOrder: 3,
      rubric: clone(DEFAULT_RUBRIC),
    },
  ];

  private rounds: Round[] = [
    {
      id: 'round-1',
      name: '1차 모의면접',
      date: '2026-11-17',
      startTime: '18:30',
      room: '진로진학실',
      status: '진행 중',
      currentApplicationId: 'app-3',
      createdAt: '2026-11-15T00:00:00.000Z',
      interviewerIds: ['mock-int-1', 'mock-int-2', 'mock-int-3', 'mock-int-4', 'mock-int-5'],
    },
  ];

  private students: Student[] = [
    {
      id: 'stu-1',
      studentNo: '30101',
      name: '테스트학생1',
      classLabel: '3-1',
      homeroomUserId: 'mock-int-1',
      homeroomName: '면접위원1',
      desiredMajor: '컴퓨터공학과',
      memo: '인하대·동국대 2개교 연속 면접',
      active: true,
      isDemo: true,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-16T09:00:00.000Z',
    },
    {
      id: 'stu-2',
      studentNo: '30105',
      name: '테스트학생2',
      classLabel: '3-1',
      homeroomUserId: 'mock-int-1',
      homeroomName: '면접위원1',
      desiredMajor: '생명과학과',
      memo: '',
      active: true,
      isDemo: true,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-16T09:00:00.000Z',
    },
    {
      id: 'stu-3',
      studentNo: '30203',
      name: '테스트학생3',
      classLabel: '3-2',
      homeroomUserId: 'mock-int-2',
      homeroomName: '면접위원2',
      desiredMajor: '경영학과',
      memo: '',
      active: true,
      isDemo: true,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-16T09:00:00.000Z',
    },
    {
      id: 'stu-4',
      studentNo: '30212',
      name: '테스트학생4',
      classLabel: '3-2',
      homeroomUserId: 'mock-int-2',
      homeroomName: '면접위원2',
      desiredMajor: '기계공학과',
      memo: '',
      active: true,
      isDemo: true,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-16T09:00:00.000Z',
    },
    {
      id: 'stu-5',
      studentNo: '30304',
      name: '테스트학생5',
      classLabel: '3-3',
      homeroomUserId: 'mock-int-4',
      homeroomName: '면접위원4',
      desiredMajor: '미디어커뮤니케이션학과',
      memo: '',
      active: true,
      isDemo: true,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-16T09:00:00.000Z',
    },
    {
      id: 'stu-6',
      studentNo: '30310',
      name: '테스트학생6',
      classLabel: '3-3',
      homeroomUserId: 'mock-int-4',
      homeroomName: '면접위원4',
      desiredMajor: '국어교육과',
      memo: '',
      active: true,
      isDemo: true,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-16T09:00:00.000Z',
    },
    {
      id: 'stu-7',
      studentNo: '30118',
      name: '테스트학생7',
      classLabel: '3-1',
      homeroomUserId: 'mock-int-1',
      homeroomName: '면접위원1',
      desiredMajor: '화학공학과',
      memo: '',
      active: true,
      isDemo: true,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-16T09:00:00.000Z',
    },
  ];

  private applications: Application[] = [
    {
      id: 'app-1',
      studentId: 'stu-1',
      universityId: 'univ-inha',
      roundId: 'round-1',
      major: '컴퓨터공학과',
      notionUrl: 'https://example.com/notion-demo',
      sequenceNo: 1,
      slotTime: '18:30',
      status: '완료',
      isDemo: true,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-16T09:30:00.000Z',
      interviewerIds: ['mock-int-1', 'mock-int-2', 'mock-int-3', 'mock-int-4', 'mock-int-5'],
    },
    {
      id: 'app-2',
      studentId: 'stu-1',
      universityId: 'univ-dongguk',
      roundId: 'round-1',
      major: '컴퓨터AI학부',
      notionUrl: 'https://example.com/notion-demo',
      sequenceNo: 2,
      slotTime: '18:45',
      status: '완료',
      isDemo: true,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-16T09:45:00.000Z',
      interviewerIds: ['mock-int-1', 'mock-int-2', 'mock-int-3', 'mock-int-4', 'mock-int-5'],
    },
    {
      id: 'app-3',
      studentId: 'stu-2',
      universityId: 'univ-incheon',
      roundId: 'round-1',
      major: '생명과학부',
      notionUrl: 'https://example.com/notion-demo',
      sequenceNo: 3,
      slotTime: '19:00',
      status: '면접 중',
      isDemo: true,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-16T10:00:00.000Z',
      interviewerIds: ['mock-int-1', 'mock-int-2', 'mock-int-3', 'mock-int-4', 'mock-int-5'],
    },
    {
      id: 'app-4',
      studentId: 'stu-3',
      universityId: 'univ-inha',
      roundId: 'round-1',
      major: '경영학과',
      notionUrl: 'https://example.com/notion-demo',
      sequenceNo: 4,
      slotTime: '19:15',
      status: '대기',
      isDemo: true,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-16T09:00:00.000Z',
      interviewerIds: ['mock-int-1', 'mock-int-2', 'mock-int-3', 'mock-int-4', 'mock-int-5'],
    },
    {
      id: 'app-5',
      studentId: 'stu-4',
      universityId: 'univ-incheon',
      roundId: 'round-1',
      major: '기계공학과',
      notionUrl: 'https://example.com/notion-demo',
      sequenceNo: 5,
      slotTime: '19:30',
      status: '대기',
      isDemo: true,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-16T09:00:00.000Z',
      interviewerIds: ['mock-int-1', 'mock-int-2', 'mock-int-3', 'mock-int-4', 'mock-int-5'],
    },
    {
      id: 'app-6',
      studentId: 'stu-5',
      universityId: 'univ-dongguk',
      roundId: 'round-1',
      major: '미디어커뮤니케이션학전공',
      notionUrl: 'https://example.com/notion-demo',
      sequenceNo: 6,
      slotTime: '19:45',
      status: '대기',
      isDemo: true,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-16T09:00:00.000Z',
      interviewerIds: ['mock-int-1', 'mock-int-2', 'mock-int-3', 'mock-int-4', 'mock-int-5'],
    },
    {
      id: 'app-7',
      studentId: 'stu-6',
      universityId: 'univ-incheon',
      roundId: 'round-1',
      major: '국어교육과',
      notionUrl: 'https://example.com/notion-demo',
      sequenceNo: 7,
      slotTime: '20:00',
      status: '대기',
      isDemo: true,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-16T09:00:00.000Z',
      interviewerIds: ['mock-int-1', 'mock-int-2', 'mock-int-3', 'mock-int-4', 'mock-int-5'],
    },
    {
      id: 'app-8',
      studentId: 'stu-7',
      universityId: 'univ-inha',
      roundId: 'round-1',
      major: '화학공학과',
      notionUrl: 'https://example.com/notion-demo',
      sequenceNo: 8,
      slotTime: '20:15',
      status: '대기',
      isDemo: true,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-16T09:00:00.000Z',
      interviewerIds: ['mock-int-1', 'mock-int-2', 'mock-int-3', 'mock-int-4', 'mock-int-5'],
    },
  ];

  private questions: ApplicationQuestion[] = [
    {
      id: 'q-1',
      applicationId: 'app-3',
      seq: 1,
      questionText: '생명과학 실험 탐구에서 가장 어려웠던 변수 통제 과정과 해결 방법을 설명해 보세요.',
      category: '학업역량',
    },
    {
      id: 'q-2',
      applicationId: 'app-3',
      seq: 2,
      questionText: '지원 학과 진학 후 가장 먼저 탐구해보고 싶은 주제와 그 이유는 무엇인가요?',
      category: '진로역량',
    },
    {
      id: 'q-3',
      applicationId: 'app-3',
      seq: 3,
      questionText: '모둠 활동에서 의견 충돌이 있었을 때 조율했던 경험을 말해 보세요.',
      category: '공동체역량',
    },
  ];

  private evaluations: Evaluation[] = [
    {
      id: 'eval-1',
      applicationId: 'app-1',
      interviewerUserId: 'mock-int-1',
      interviewerName: '면접위원1',
      scores: { academic: 5, career: 5, community: 4, communication: 4, attitude: 5 },
      convertedScore: 92,
      overall: '우수',
      quickTags: ['두괄식 답변 우수', '근거 구체적', '전공 이해도 높음'],
      questionChecks: {},
      strengths: '자료구조 탐구 과정과 오류 해결 사례를 매우 논리적으로 설명함.',
      improvements: '꼬리질문 시 말 속도가 약간 빨라지므로 호흡 조절 필요.',
      adviceToStudent: '본인의 문제 해결 과정을 자신감 있게 잘 전달했습니다. 핵심 결론을 먼저 말하고 근거를 2가지로 정리하면 더 좋습니다.',
      noteToAdmin: '1학년 때보다 표현력이 크게 향상됨.',
      status: 'submitted',
      submittedAt: '2026-11-16T09:42:00.000Z',
      editedAfterSubmit: false,
      isDemo: true,
      updatedAt: '2026-11-16T09:42:00.000Z',
    },
    {
      id: 'eval-2',
      applicationId: 'app-1',
      interviewerUserId: 'mock-int-2',
      interviewerName: '면접위원2',
      scores: { academic: 4, career: 5, community: 4, communication: 3, attitude: 5 },
      convertedScore: 83,
      overall: '우수',
      quickTags: ['전공 이해도 높음', '말 속도 빠름'],
      questionChecks: {},
      strengths: '지원 전공에 대한 관심과 탐구 깊이가 뚜렷함.',
      improvements: '질문 의도를 확인한 뒤 2초 정도 정리하고 답변하면 좋겠음.',
      adviceToStudent: '전공 탐구 깊이가 돋보입니다. 답변이 길어질 때는 핵심 키워드를 먼저 제시해 보세요.',
      noteToAdmin: '실전 면접 적응력 우수.',
      status: 'submitted',
      submittedAt: '2026-11-16T09:43:00.000Z',
      editedAfterSubmit: false,
      isDemo: true,
      updatedAt: '2026-11-16T09:43:00.000Z',
    },
    {
      id: 'eval-3',
      applicationId: 'app-1',
      interviewerUserId: 'mock-int-3',
      interviewerName: '면접위원3',
      scores: { academic: 5, career: 4, community: 2, communication: 4, attitude: 4 },
      convertedScore: 79,
      overall: '보통',
      quickTags: ['근거 구체적', '답변이 장황함'],
      questionChecks: {},
      strengths: '학업 탐구 경험이 구체적임.',
      improvements: '공동체 협업 경험 질문에서 본인 역할 설명이 부족했음.',
      adviceToStudent: '협업 사례 질문에서는 내가 맡은 역할과 갈등 해결 과정을 구체적으로 준비해 보세요.',
      noteToAdmin: '공동체역량 점수 편차 확인 요망.',
      status: 'submitted',
      submittedAt: '2026-11-16T09:44:00.000Z',
      editedAfterSubmit: false,
      isDemo: true,
      updatedAt: '2026-11-16T09:44:00.000Z',
    },
    {
      id: 'eval-4',
      applicationId: 'app-2',
      interviewerUserId: 'mock-int-1',
      interviewerName: '면접위원1',
      scores: { academic: 5, career: 4, community: 4, communication: 5, attitude: 5 },
      convertedScore: 91,
      overall: '우수',
      quickTags: ['두괄식 답변 우수', '자신감 있는 태도'],
      questionChecks: {},
      strengths: '두 번째 면접에서 답변 구조가 훨씬 깔끔해짐.',
      improvements: '전공 시사 질문 대비 추가 정리 권장.',
      adviceToStudent: '첫 면접보다 답변 속도와 두괄식 구성이 훨씬 안정적이었습니다.',
      noteToAdmin: '',
      status: 'submitted',
      submittedAt: '2026-11-16T09:58:00.000Z',
      editedAfterSubmit: false,
      isDemo: true,
      updatedAt: '2026-11-16T09:58:00.000Z',
    },
    {
      id: 'eval-5',
      applicationId: 'app-3',
      interviewerUserId: 'mock-int-2',
      interviewerName: '면접위원2',
      scores: { academic: 4, career: 4, community: 4, communication: 3, attitude: 4 },
      convertedScore: 76,
      overall: '보통',
      quickTags: ['근거 구체적'],
      questionChecks: { 'q-1': 'good' },
      strengths: '실험 과정을 성실히 수행한 점이 드러남.',
      improvements: '작성 중입니다.',
      adviceToStudent: '',
      noteToAdmin: '',
      status: 'draft',
      submittedAt: null,
      editedAfterSubmit: false,
      isDemo: true,
      updatedAt: '2026-11-16T10:02:00.000Z',
    },
  ];

  private reports: Report[] = [
    {
      studentId: 'stu-1',
      status: 'confirmed',
      adminComment:
        '전공 관련 탐구 역량이 매우 탄탄하며, 두괄식 답변 훈련을 통해 실전 면접에서 높은 경쟁력을 보일 것으로 기대됩니다.',
      confirmedBy: 'mock-admin',
      confirmedAt: '2026-11-16T10:05:00.000Z',
    },
  ];

  private auditLogs: AuditLog[] = [
    {
      id: 'log-1',
      actorUserId: 'mock-admin',
      actorName: '운영교사(미리보기)',
      action: 'LOGIN',
      targetStudentId: null,
      detail: '미리보기 모드 로그인',
      ip: '127.0.0.1',
      at: '2026-11-16T09:00:00.000Z',
    },
    {
      id: 'log-2',
      actorUserId: 'mock-int-1',
      actorName: '면접위원1',
      action: 'OPEN_NOTION',
      targetStudentId: 'stu-1',
      detail: '모의질문 노션 열람 (https://example.com/notion-demo)',
      ip: '127.0.0.1',
      at: '2026-11-16T09:30:00.000Z',
    },
  ];

  private getCurrentUser(): User {
    if (this.currentRole === 'admin') return clone(this.teachers[0]);
    if (this.currentRole === 'interviewer') return clone(this.teachers[1]);
    return clone(this.teachers[1]); // mock-int-1 also has homeroom for 3-1
  }

  setMockRole(role: UserRole): User {
    this.currentRole = role;
    return this.getCurrentUser();
  }

  async health(): Promise<HealthResponse> {
    return { ok: false, db: 'mock', secrets: false };
  }

  async publicSettings() {
    return {
      eventName: this.settings.eventName,
      schoolName: this.settings.schoolName,
      retentionUntil: this.settings.retentionUntil,
    };
  }

  async getMe(): Promise<AuthState> {
    return {
      user: this.getCurrentUser(),
      settings: clone(this.settings),
    };
  }

  async login(): Promise<AuthState> {
    return this.getMe();
  }

  async register() {
    return { status: 'pending', message: '미리보기 모드에서는 바로 역할을 전환해 체험할 수 있습니다.' };
  }

  async logout() {
    // no-op in preview
  }

  async completeOnboarding() {
    return { user: this.getCurrentUser() };
  }

  async changePassword() {
    // no-op
  }

  async unlock() {
    // no-op
  }

  async getChanges(_since: string, roleHint?: UserRole): Promise<ChangesResponse> {
    const role = roleHint ?? this.currentRole;
    const serverTime = new Date().toISOString();
    if (role === 'admin') {
      return {
        hasChanges: true,
        serverTime,
        settings: clone(this.settings),
        rounds: clone(this.rounds),
        applications: clone(this.applications),
        evaluations: clone(this.evaluations),
        reports: clone(this.reports),
      };
    }
    if (role === 'interviewer') {
      const uid = this.getCurrentUser().id;
      return {
        hasChanges: true,
        serverTime,
        settings: clone(this.settings),
        rounds: clone(this.rounds),
        applications: clone(this.applications.filter((a) => a.interviewerIds.includes(uid))),
        evaluations: clone(this.evaluations.filter((e) => e.interviewerUserId === uid)),
      };
    }
    const uid = this.getCurrentUser().id;
    const myStudentIds = new Set(this.students.filter((s) => s.homeroomUserId === uid).map((s) => s.id));
    const myAppIds = new Set(this.applications.filter((a) => myStudentIds.has(a.studentId)).map((a) => a.id));
    return {
      hasChanges: true,
      serverTime,
      settings: clone(this.settings),
      applications: clone(this.applications.filter((a) => myStudentIds.has(a.studentId))),
      evaluations: this.anonymizeForHomeroom(
        this.evaluations.filter((e) => myAppIds.has(e.applicationId) && e.status === 'submitted')
      ),
      reports: clone(this.reports.filter((r) => myStudentIds.has(r.studentId))),
    };
  }

  private anonymizeForHomeroom(evals: Evaluation[]): Evaluation[] {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const byApp = new Map<string, Map<string, string>>();
    return evals.map((ev) => {
      const copy = clone(ev);
      delete copy.noteToAdmin;
      if (!this.settings.showInterviewerNamesToHomeroom) {
        let appMap = byApp.get(ev.applicationId);
        if (!appMap) {
          appMap = new Map();
          byApp.set(ev.applicationId, appMap);
        }
        let label = appMap.get(ev.interviewerUserId);
        if (!label) {
          label = `면접관 ${letters[appMap.size % letters.length]}`;
          appMap.set(ev.interviewerUserId, label);
        }
        copy.interviewerName = label;
      }
      return copy;
    });
  }

  async getAdminWorkspace(): Promise<WorkspaceSnapshot> {
    return {
      settings: clone(this.settings),
      universities: clone(this.universities),
      rounds: clone(this.rounds),
      teachers: clone(this.teachers),
      students: clone(this.students),
      applications: clone(this.applications),
      questions: clone(this.questions),
      evaluations: clone(this.evaluations),
      reports: clone(this.reports),
      serverTime: new Date().toISOString(),
    };
  }

  async createTeacher(input: {
    name: string;
    email: string;
    dept: string;
    homeroomClass: string;
    roles: UserRole[];
  }) {
    const nowIso = new Date().toISOString();
    const user: User = {
      id: `mock-u-${Date.now()}`,
      email: input.email.toLowerCase(),
      name: input.name,
      dept: input.dept,
      homeroomClass: input.homeroomClass,
      requestedRoles: input.roles,
      roles: input.roles,
      status: 'active',
      mustChangePassword: true,
      pledgeAgreedAt: null,
      createdAt: nowIso,
      approvedBy: 'mock-admin',
      approvedAt: nowIso,
    };
    this.teachers.unshift(user);
    return { user: clone(user), tempPassword: 'DemoTemp2027!' };
  }

  async approveTeacher(id: string, approved: boolean, roles?: UserRole[]) {
    const t = this.teachers.find((u) => u.id === id);
    if (!t) throw new Error('교사를 찾을 수 없습니다.');
    t.status = approved ? 'active' : 'disabled';
    t.roles = approved ? (roles && roles.length ? roles : t.requestedRoles) : [];
    t.approvedAt = new Date().toISOString();
    return { user: clone(t) };
  }

  async updateTeacher(
    id: string,
    input: { roles?: UserRole[]; dept?: string; homeroomClass?: string; status?: 'active' | 'disabled' }
  ) {
    const t = this.teachers.find((u) => u.id === id);
    if (!t) throw new Error('교사를 찾을 수 없습니다.');
    if (input.roles) t.roles = input.roles;
    if (input.dept !== undefined) t.dept = input.dept;
    if (input.homeroomClass !== undefined) t.homeroomClass = input.homeroomClass;
    if (input.status) t.status = input.status;
    return { user: clone(t) };
  }

  async resetTeacherPassword() {
    return { tempPassword: 'ResetDemo2027#' };
  }

  async updateSettings(settings: Settings) {
    this.settings = clone(settings);
    return { settings: clone(this.settings) };
  }

  async createUniversity(input: Omit<University, 'id'>) {
    const sum = input.rubric.reduce((a, b) => a + b.weight, 0);
    if (sum !== 100) throw new Error('평가 항목 가중치 합계는 반드시 100이어야 합니다.');
    const univ: University = { ...clone(input), id: `univ-${Date.now()}` };
    this.universities.push(univ);
    return { university: clone(univ) };
  }

  async updateUniversity(id: string, input: Omit<University, 'id'>) {
    const sum = input.rubric.reduce((a, b) => a + b.weight, 0);
    if (sum !== 100) throw new Error('평가 항목 가중치 합계는 반드시 100이어야 합니다.');
    const idx = this.universities.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error('대학을 찾을 수 없습니다.');
    this.universities[idx] = { ...clone(input), id };
    return { university: clone(this.universities[idx]) };
  }

  async deleteUniversity(id: string) {
    if (this.applications.some((a) => a.universityId === id)) {
      throw new Error('해당 대학에 등록된 면접 건이 있어 삭제할 수 없습니다.');
    }
    this.universities = this.universities.filter((u) => u.id !== id);
  }

  async createRound(input: Omit<Round, 'id' | 'currentApplicationId' | 'createdAt' | 'interviewerIds'>) {
    const round: Round = {
      ...clone(input),
      id: `round-${Date.now()}`,
      currentApplicationId: null,
      createdAt: new Date().toISOString(),
      interviewerIds: [],
    };
    this.rounds.unshift(round);
    return { round: clone(round) };
  }

  async updateRound(
    id: string,
    input: Omit<Round, 'id' | 'currentApplicationId' | 'createdAt' | 'interviewerIds'>
  ) {
    const r = this.rounds.find((x) => x.id === id);
    if (!r) throw new Error('회차를 찾을 수 없습니다.');
    Object.assign(r, clone(input));
    return { round: clone(r) };
  }

  async setRoundInterviewers(roundId: string, interviewerIds: string[]) {
    const r = this.rounds.find((x) => x.id === roundId);
    if (!r) throw new Error('회차를 찾을 수 없습니다.');
    const unique = Array.from(new Set(interviewerIds));
    r.interviewerIds = unique;
    this.applications.forEach((a) => {
      if (a.roundId === roundId) a.interviewerIds = [...unique];
    });
  }

  async startApplication(roundId: string, applicationId: string) {
    const r = this.rounds.find((x) => x.id === roundId);
    if (!r) throw new Error('회차를 찾을 수 없습니다.');
    const nowIso = new Date().toISOString();
    this.applications.forEach((a) => {
      if (a.roundId === roundId) {
        if (a.id === applicationId) {
          a.status = '면접 중';
          a.updatedAt = nowIso;
        } else if (a.status === '면접 중') {
          a.status = '완료';
          a.updatedAt = nowIso;
        }
      }
    });
    r.status = '진행 중';
    r.currentApplicationId = applicationId;
  }

  async nextApplication(roundId: string) {
    const r = this.rounds.find((x) => x.id === roundId);
    if (!r) return;
    const roundApps = this.applications
      .filter((a) => a.roundId === roundId)
      .sort((a, b) => a.sequenceNo - b.sequenceNo);
    const curIdx = roundApps.findIndex((a) => a.status === '면접 중');
    const next =
      roundApps.find((a, idx) => idx > curIdx && a.status === '대기') ??
      roundApps.find((a) => a.status === '대기');
    const nowIso = new Date().toISOString();
    roundApps.forEach((a) => {
      if (a.status === '면접 중') {
        a.status = '완료';
        a.updatedAt = nowIso;
      }
    });
    if (next) {
      next.status = '면접 중';
      next.updatedAt = nowIso;
      r.status = '진행 중';
      r.currentApplicationId = next.id;
    } else {
      r.status = '종료';
      r.currentApplicationId = null;
    }
  }

  async reorderRound(roundId: string, orderedApplicationIds: string[]) {
    const nowIso = new Date().toISOString();
    orderedApplicationIds.forEach((id, idx) => {
      const a = this.applications.find((x) => x.id === id && x.roundId === roundId);
      if (a) {
        a.sequenceNo = idx + 1;
        a.updatedAt = nowIso;
      }
    });
  }

  async createStudent(input: {
    studentNo: string;
    name: string;
    classLabel: string;
    homeroomUserId: string | null;
    desiredMajor: string;
    memo: string;
    active: boolean;
  }) {
    if (this.students.some((s) => s.studentNo === input.studentNo)) {
      throw new Error('이미 등록된 학번입니다.');
    }
    const nowIso = new Date().toISOString();
    const homeroomName = this.teachers.find((t) => t.id === input.homeroomUserId)?.name ?? null;
    const student: Student = {
      id: `stu-${Date.now()}`,
      ...input,
      homeroomName,
      isDemo: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.students.push(student);
    return { student: clone(student) };
  }

  async updateStudent(
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
    const s = this.students.find((x) => x.id === id);
    if (!s) throw new Error('학생을 찾을 수 없습니다.');
    const homeroomName = this.teachers.find((t) => t.id === input.homeroomUserId)?.name ?? null;
    Object.assign(s, input, { homeroomName, updatedAt: new Date().toISOString() });
    return { student: clone(s) };
  }

  async createApplication(input: {
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
    if (!isAllowedNotionUrl(input.notionUrl) && input.notionUrl !== 'https://example.com/notion-demo') {
      throw new Error('노션 링크는 https://notion.so, notion.site, app.notion.com 도메인만 허용됩니다.');
    }
    const r = this.rounds.find((x) => x.id === input.roundId);
    const nowIso = new Date().toISOString();
    const app: Application = {
      id: `app-${Date.now()}`,
      ...input,
      interviewerIds: input.interviewerIds ?? (r ? [...r.interviewerIds] : []),
      isDemo: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.applications.push(app);
    return { application: clone(app) };
  }

  async updateApplication(
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
    const a = this.applications.find((x) => x.id === id);
    if (!a) throw new Error('면접 건을 찾을 수 없습니다.');
    if (
      input.notionUrl !== undefined &&
      !isAllowedNotionUrl(input.notionUrl) &&
      input.notionUrl !== 'https://example.com/notion-demo'
    ) {
      throw new Error('노션 링크는 https://notion.so, notion.site, app.notion.com 도메인만 허용됩니다.');
    }
    Object.assign(a, input, { updatedAt: new Date().toISOString() });
    return { application: clone(a) };
  }

  async deleteApplication(id: string) {
    this.applications = this.applications.filter((a) => a.id !== id);
  }

  async saveApplicationQuestions(appId: string, questions: string[]) {
    this.questions = this.questions.filter((q) => q.applicationId !== appId);
    const created: ApplicationQuestion[] = questions.map((text, idx) => ({
      id: `q-${Date.now()}-${idx}`,
      applicationId: appId,
      seq: idx + 1,
      questionText: text,
      category: '',
    }));
    this.questions.push(...created);
    return { questions: clone(created) };
  }

  async importCsv(roundId: string, rows: Omit<CsvImportRowInput, 'rowNumber' | 'error'>[]) {
    const r = this.rounds.find((x) => x.id === roundId);
    if (!r) throw new Error('회차를 찾을 수 없습니다.');
    let createdStudents = 0;
    let createdApplications = 0;
    const nowIso = new Date().toISOString();

    for (const row of rows) {
      if (!isAllowedNotionUrl(row.notionUrl) && row.notionUrl !== 'https://example.com/notion-demo') {
        throw new Error(`허용되지 않은 노션 링크 도메인입니다: ${row.notionUrl}`);
      }
      const normUniv = row.universityName.trim().replace(/대학교$|대$/u, '');
      const univ = this.universities.find(
        (u) => u.name === row.universityName || u.name.replace(/대학교$|대$/u, '') === normUniv
      );
      if (!univ) throw new Error(`등록되지 않은 대학명입니다: ${row.universityName}`);

      let stu = this.students.find((s) => s.studentNo === row.studentNo);
      const hr = row.homeroomEmail
        ? this.teachers.find((t) => t.email.toLowerCase() === row.homeroomEmail.toLowerCase())
        : undefined;
      if (!stu) {
        stu = {
          id: `stu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          studentNo: row.studentNo,
          name: row.name,
          classLabel: row.classLabel,
          homeroomUserId: hr?.id ?? null,
          homeroomName: hr?.name ?? null,
          desiredMajor: row.major,
          memo: '',
          active: true,
          isDemo: false,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        this.students.push(stu);
        createdStudents++;
      }

      this.applications.push({
        id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        studentId: stu.id,
        universityId: univ.id,
        roundId,
        major: row.major,
        notionUrl: row.notionUrl,
        sequenceNo: row.sequenceNo,
        slotTime: '',
        status: '대기',
        isDemo: false,
        createdAt: nowIso,
        updatedAt: nowIso,
        interviewerIds: [...r.interviewerIds],
      });
      createdApplications++;
    }
    return { createdStudents, createdApplications };
  }

  async saveReport(studentId: string, adminComment: string, status: 'draft' | 'confirmed') {
    const rep: Report = {
      studentId,
      adminComment,
      status,
      confirmedBy: status === 'confirmed' ? 'mock-admin' : null,
      confirmedAt: status === 'confirmed' ? new Date().toISOString() : null,
    };
    const idx = this.reports.findIndex((r) => r.studentId === studentId);
    if (idx === -1) this.reports.push(rep);
    else this.reports[idx] = rep;
    return { report: clone(rep) };
  }

  async confirmReportsBatch(studentIds: string[]) {
    const nowIso = new Date().toISOString();
    for (const sid of studentIds) {
      const existing = this.reports.find((r) => r.studentId === sid);
      if (existing) {
        existing.status = 'confirmed';
        existing.confirmedBy = 'mock-admin';
        existing.confirmedAt = nowIso;
      } else {
        this.reports.push({
          studentId: sid,
          status: 'confirmed',
          adminComment: '',
          confirmedBy: 'mock-admin',
          confirmedAt: nowIso,
        });
      }
    }
  }

  async getAuditLogs() {
    return { logs: clone(this.auditLogs) };
  }

  async recordCsvExport(detail?: string) {
    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actorUserId: this.getCurrentUser().id,
      actorName: this.getCurrentUser().name,
      action: 'EXPORT_CSV',
      targetStudentId: null,
      detail: detail || '결과 취합 CSV 내보내기',
      ip: '127.0.0.1',
      at: new Date().toISOString(),
    });
  }

  async purgeAllData(confirmText: string) {
    if (confirmText !== '파기') throw new Error('확인란에 "파기"를 정확히 입력하세요.');
    this.evaluations = [];
    this.questions = [];
    this.applications = [];
    this.reports = [];
    this.students = [];
    this.rounds.forEach((r) => {
      r.currentApplicationId = null;
      r.status = '준비';
    });
  }

  async seedDemoData() {
    // Already seeded in preview mode
  }

  async clearDemoData() {
    this.evaluations = this.evaluations.filter((e) => !e.isDemo);
    this.applications = this.applications.filter((a) => !a.isDemo);
    this.students = this.students.filter((s) => !s.isDemo);
  }

  async getInterviewerWorkspace() {
    const uid = this.getCurrentUser().id;
    const assignedApps = this.applications.filter((a) => a.interviewerIds.includes(uid));
    const stuIds = new Set(assignedApps.map((a) => a.studentId));
    const appIds = new Set(assignedApps.map((a) => a.id));
    return {
      settings: clone(this.settings),
      universities: clone(this.universities),
      rounds: clone(this.rounds),
      students: clone(this.students.filter((s) => stuIds.has(s.id))),
      applications: clone(assignedApps),
      questions: clone(this.questions.filter((q) => appIds.has(q.applicationId))),
      evaluations: clone(this.evaluations.filter((e) => e.interviewerUserId === uid)),
      serverTime: new Date().toISOString(),
    };
  }

  async saveEvaluation(
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
    if (this.settings.resultsLocked) {
      throw new Error('평가가 잠금 상태이므로 저장하거나 수정할 수 없습니다.');
    }
    const uid = this.getCurrentUser().id;
    const app = this.applications.find((a) => a.id === applicationId);
    if (!app || !app.interviewerIds.includes(uid)) {
      throw new Error('요청한 면접 건을 찾을 수 없습니다.');
    }
    const univ = this.universities.find((u) => u.id === app.universityId);
    if (!univ) throw new Error('대학 정보를 찾을 수 없습니다.');

    if (input.status === 'submitted') {
      for (const item of univ.rubric) {
        const val = input.scores[item.key];
        if (typeof val !== 'number' || val < 1 || val > 5) {
          throw new Error(`'${item.label}' 점수를 선택해 주세요.`);
        }
      }
    }

    const nowIso = new Date().toISOString();
    const convertedScore = calculateConvertedScore(input.scores, univ.rubric);
    const existing = this.evaluations.find(
      (e) => e.applicationId === applicationId && e.interviewerUserId === uid
    );

    if (existing) {
      const wasSubmitted = existing.status === 'submitted';
      Object.assign(existing, {
        ...clone(input),
        convertedScore,
        editedAfterSubmit: wasSubmitted || existing.editedAfterSubmit,
        submittedAt:
          input.status === 'submitted' ? existing.submittedAt ?? nowIso : existing.submittedAt,
        updatedAt: nowIso,
      });
      return { evaluation: clone(existing) };
    }

    const created: Evaluation = {
      id: `eval-${Date.now()}`,
      applicationId,
      interviewerUserId: uid,
      interviewerName: this.getCurrentUser().name,
      ...clone(input),
      convertedScore,
      submittedAt: input.status === 'submitted' ? nowIso : null,
      editedAfterSubmit: false,
      isDemo: true,
      updatedAt: nowIso,
    };
    this.evaluations.push(created);
    return { evaluation: clone(created) };
  }

  async openNotion(applicationId: string) {
    const app = this.applications.find((a) => a.id === applicationId);
    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actorUserId: this.getCurrentUser().id,
      actorName: this.getCurrentUser().name,
      action: 'OPEN_NOTION',
      targetStudentId: app?.studentId ?? null,
      detail: `모의질문 노션 열람 (${app?.notionUrl ?? ''})`,
      ip: '127.0.0.1',
      at: new Date().toISOString(),
    });
  }

  async getHomeroomWorkspace() {
    const uid = this.getCurrentUser().id;
    const myStudents = this.students.filter((s) => s.homeroomUserId === uid);
    const myStuIds = new Set(myStudents.map((s) => s.id));
    const myApps = this.applications.filter((a) => myStuIds.has(a.studentId));
    const myAppIds = new Set(myApps.map((a) => a.id));
    const submitted = this.evaluations.filter(
      (e) => myAppIds.has(e.applicationId) && e.status === 'submitted'
    );

    return {
      settings: clone(this.settings),
      universities: clone(this.universities),
      rounds: clone(this.rounds),
      students: clone(myStudents),
      applications: clone(myApps),
      questions: clone(this.questions.filter((q) => myAppIds.has(q.applicationId))),
      evaluations: this.anonymizeForHomeroom(submitted),
      reports: clone(this.reports.filter((r) => myStuIds.has(r.studentId))),
      serverTime: new Date().toISOString(),
    };
  }
}
