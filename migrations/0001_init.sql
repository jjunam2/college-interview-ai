-- 덕신고 2027 대입 모의면접 평가 시스템 - 초기 스키마
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
