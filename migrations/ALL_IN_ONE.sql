-- 덕신고 2027 대입 모의면접 평가 시스템 - 통합 마이그레이션 SQL (반복 실행 안전)
-- Cloudflare D1 Console에 전체 내용을 붙여 넣어 실행할 수 있습니다.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  dept TEXT NOT NULL DEFAULT '',
  homeroom_class TEXT NOT NULL DEFAULT '',
  requested_roles TEXT NOT NULL DEFAULT '[]',
  roles TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'disabled')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  pledge_agreed_at TEXT,
  created_at TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS universities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  admission_type TEXT NOT NULL,
  interview_format TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  rubric TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  room TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('준비', '진행 중', '종료')),
  current_application_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS round_interviewers (
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (round_id, user_id)
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  student_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  class_label TEXT NOT NULL,
  homeroom_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  desired_major TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  university_id TEXT NOT NULL REFERENCES universities(id) ON DELETE RESTRICT,
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  major TEXT NOT NULL DEFAULT '',
  notion_url TEXT NOT NULL DEFAULT '',
  sequence_no INTEGER NOT NULL,
  slot_time TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('대기', '면접 중', '완료', '결시')),
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS application_interviewers (
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  interviewer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (application_id, interviewer_user_id)
);

CREATE TABLE IF NOT EXISTS application_questions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  interviewer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scores TEXT NOT NULL DEFAULT '{}',
  converted_score REAL NOT NULL DEFAULT 0,
  overall TEXT NOT NULL DEFAULT '보통' CHECK (overall IN ('우수', '보통', '보완 필요')),
  quick_tags TEXT NOT NULL DEFAULT '[]',
  question_checks TEXT NOT NULL DEFAULT '{}',
  strengths TEXT NOT NULL DEFAULT '',
  improvements TEXT NOT NULL DEFAULT '',
  advice_to_student TEXT NOT NULL DEFAULT '',
  note_to_admin TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at TEXT,
  edited_after_submit INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE (application_id, interviewer_user_id)
);

CREATE TABLE IF NOT EXISTS reports (
  student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  admin_comment TEXT NOT NULL DEFAULT '',
  confirmed_by TEXT,
  confirmed_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_student_id TEXT,
  detail TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_applications_round_seq ON applications(round_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_applications_student ON applications(student_id);
CREATE INDEX IF NOT EXISTS idx_app_interviewers_user ON application_interviewers(interviewer_user_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_app ON evaluations(application_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_updated ON evaluations(updated_at);
CREATE INDEX IF NOT EXISTS idx_students_homeroom ON students(homeroom_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('eventName', '덕신고 2027 대입 모의면접'),
  ('schoolName', '덕신고등학교'),
  ('maskStudentNames', 'false'),
  ('showInterviewerNamesToHomeroom', 'false'),
  ('retentionUntil', '2026-12-31'),
  ('resultsLocked', 'false');

INSERT OR IGNORE INTO universities (id, name, admission_type, interview_format, duration_min, color, sort_order, rubric) VALUES
  (
    'univ-inha',
    '인하대학교',
    '인하미래인재전형',
    '제출 서류 기반 확인 면접 (개별 패널)',
    10,
    '#1E40AF',
    1,
    '[{"key":"academic","label":"학업역량","description":"교과 학습과 탐구 경험을 구체적 과정과 결과로 설명하는가","weight":25,"anchors":{"5":"구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨","3":"사례는 있으나 과정이나 의미 설명이 부족함","1":"사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함"}},{"key":"career","label":"진로역량","description":"지원 전공(계열)을 향한 탐색 경험과 동기가 일관되게 연결되는가","weight":25,"anchors":{"5":"구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨","3":"사례는 있으나 과정이나 의미 설명이 부족함","1":"사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함"}},{"key":"community","label":"공동체역량","description":"협업·나눔·책임 경험과 그 과정에서의 성찰이 드러나는가","weight":20,"anchors":{"5":"구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨","3":"사례는 있으나 과정이나 의미 설명이 부족함","1":"사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함"}},{"key":"communication","label":"논리적 의사소통","description":"질문 의도를 파악하고 근거를 들어 두괄식으로 답하며 꼬리질문에 대응하는가","weight":20,"anchors":{"5":"구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨","3":"사례는 있으나 과정이나 의미 설명이 부족함","1":"사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함"}},{"key":"attitude","label":"서류 일치도·태도","description":"자신의 활동을 정확히 설명하고 자기주도성이 보이며 면접 태도가 바른가","weight":10,"anchors":{"5":"구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨","3":"사례는 있으나 과정이나 의미 설명이 부족함","1":"사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함"}}]'
  ),
  (
    'univ-incheon',
    '인천대학교',
    '자기추천전형',
    '제출 서류 기반 종합 면접 (개별 패널)',
    10,
    '#0F766E',
    2,
    '[{"key":"academic","label":"학업역량","description":"교과 학습과 탐구 경험을 구체적 과정과 결과로 설명하는가","weight":25,"anchors":{"5":"구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨","3":"사례는 있으나 과정이나 의미 설명이 부족함","1":"사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함"}},{"key":"career","label":"진로역량","description":"지원 전공(계열)을 향한 탐색 경험과 동기가 일관되게 연결되는가","weight":25,"anchors":{"5":"구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨","3":"사례는 있으나 과정이나 의미 설명이 부족함","1":"사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함"}},{"key":"community","label":"공동체역량","description":"협업·나눔·책임 경험과 그 과정에서의 성찰이 드러나는가","weight":20,"anchors":{"5":"구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨","3":"사례는 있으나 과정이나 의미 설명이 부족함","1":"사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함"}},{"key":"communication","label":"논리적 의사소통","description":"질문 의도를 파악하고 근거를 들어 두괄식으로 답하며 꼬리질문에 대응하는가","weight":20,"anchors":{"5":"구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨","3":"사례는 있으나 과정이나 의미 설명이 부족함","1":"사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함"}},{"key":"attitude","label":"서류 일치도·태도","description":"자신의 활동을 정확히 설명하고 자기주도성이 보이며 면접 태도가 바른가","weight":10,"anchors":{"5":"구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨","3":"사례는 있으나 과정이나 의미 설명이 부족함","1":"사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함"}}]'
  ),
  (
    'univ-dongguk',
    '동국대학교',
    'Do Dream 전형',
    '전공 적합성 및 서류 기반 면접 (개별 패널)',
    10,
    '#B45309',
    3,
    '[{"key":"academic","label":"학업역량","description":"교과 학습과 탐구 경험을 구체적 과정과 결과로 설명하는가","weight":25,"anchors":{"5":"구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨","3":"사례는 있으나 과정이나 의미 설명이 부족함","1":"사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함"}},{"key":"career","label":"진로역량","description":"지원 전공(계열)을 향한 탐색 경험과 동기가 일관되게 연결되는가","weight":25,"anchors":{"5":"구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨","3":"사례는 있으나 과정이나 의미 설명이 부족함","1":"사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함"}},{"key":"community","label":"공동체역량","description":"협업·나눔·책임 경험과 그 과정에서의 성찰이 드러나는가","weight":20,"anchors":{"5":"구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨","3":"사례는 있으나 과정이나 의미 설명이 부족함","1":"사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함"}},{"key":"communication","label":"논리적 의사소통","description":"질문 의도를 파악하고 근거를 들어 두괄식으로 답하며 꼬리질문에 대응하는가","weight":20,"anchors":{"5":"구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨","3":"사례는 있으나 과정이나 의미 설명이 부족함","1":"사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함"}},{"key":"attitude","label":"서류 일치도·태도","description":"자신의 활동을 정확히 설명하고 자기주도성이 보이며 면접 태도가 바른가","weight":10,"anchors":{"5":"구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨","3":"사례는 있으나 과정이나 의미 설명이 부족함","1":"사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함"}}]'
  );

INSERT OR IGNORE INTO rounds (id, name, date, start_time, room, status, current_application_id, created_at) VALUES
  ('round-1', '1차 모의면접', '2026-11-17', '18:30', '진로진학실', '준비', NULL, '2026-11-16T00:00:00.000Z');
