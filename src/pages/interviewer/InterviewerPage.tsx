import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  HelpCircle,
  Lock,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  QUICK_TAG_OPTIONS,
  type Application,
  type ApplicationQuestion,
  type Evaluation,
  type OverallJudgment,
  type QuestionCheckValue,
  type Round,
  type Settings,
  type Student,
  type University,
} from '../../types';
import { calculateConvertedScore, formatKstTime, maskStudentName } from '../../utils/format';

interface DraftForm {
  scores: Record<string, number>;
  overall: OverallJudgment;
  quickTags: string[];
  questionChecks: Record<string, QuestionCheckValue>;
  strengths: string;
  improvements: string;
  adviceToStudent: string;
  noteToAdmin: string;
}

const EMPTY_FORM: DraftForm = {
  scores: {},
  overall: '보통',
  quickTags: [],
  questionChecks: {},
  strengths: '',
  improvements: '',
  adviceToStudent: '',
  noteToAdmin: '',
};

function evalToForm(ev?: Evaluation): DraftForm {
  if (!ev) return { ...EMPTY_FORM, scores: {}, quickTags: [], questionChecks: {} };
  return {
    scores: { ...ev.scores },
    overall: ev.overall,
    quickTags: [...ev.quickTags],
    questionChecks: { ...ev.questionChecks },
    strengths: ev.strengths,
    improvements: ev.improvements,
    adviceToStudent: ev.adviceToStudent,
    noteToAdmin: ev.noteToAdmin ?? '',
  };
}

export function InterviewerPage() {
  const { api, activeRole, settings: ctxSettings, setSettings: setCtxSettings, showToast } = useApp();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>(ctxSettings);
  const [universities, setUniversities] = useState<University[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [questions, setQuestions] = useState<ApplicationQuestion[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string>(new Date().toISOString());
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [nextBanner, setNextBanner] = useState<string | null>(null);

  const serverTimeRef = useRef<string>(new Date().toISOString());
  const prevCurrentAppIdRef = useRef<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    try {
      const ws = await api.getInterviewerWorkspace();
      setSettings(ws.settings);
      setCtxSettings(ws.settings);
      setUniversities(ws.universities);
      setRounds(ws.rounds);
      setStudents(ws.students);
      setApplications(ws.applications);
      setQuestions(ws.questions);
      setEvaluations(ws.evaluations);
      serverTimeRef.current = ws.serverTime;
      setLastSyncAt(new Date().toISOString());

      const activeRound = ws.rounds.find((r) => r.status === '진행 중' && r.currentApplicationId);
      prevCurrentAppIdRef.current = activeRound?.currentApplicationId ?? null;
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '면접 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [api, setCtxSettings, showToast]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  // 5초 폴링: 현재 면접 학생 변경 감지 (visibilityState 준수)
  useEffect(() => {
    let timerId: number | null = null;

    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await api.getChanges(serverTimeRef.current, activeRole);
        serverTimeRef.current = res.serverTime;
        setLastSyncAt(new Date().toISOString());
        if (res.settings) {
          setSettings(res.settings);
          setCtxSettings(res.settings);
        }
        if (res.rounds) {
          setRounds(res.rounds);
          const activeRound = res.rounds.find((r) => r.status === '진행 중' && r.currentApplicationId);
          const nextCurrentId = activeRound?.currentApplicationId ?? null;

          if (nextCurrentId && nextCurrentId !== prevCurrentAppIdRef.current) {
            prevCurrentAppIdRef.current = nextCurrentId;
            // 새로 지정된 현재 면접 학생이 내 배정에 있는지 확인
            const ws = await api.getInterviewerWorkspace();
            setUniversities(ws.universities);
            setStudents(ws.students);
            setApplications(ws.applications);
            setQuestions(ws.questions);
            setEvaluations(ws.evaluations);

            const targetApp = ws.applications.find((a) => a.id === nextCurrentId);
            if (targetApp) {
              const stu = ws.students.find((s) => s.id === targetApp.studentId);
              const univ = ws.universities.find((u) => u.id === targetApp.universityId);
              window.dispatchEvent(new CustomEvent('app:flush-eval-draft'));
              setSelectedAppId(targetApp.id);
              const label = `${stu?.name ?? '학생'} (${univ?.name ?? '대학'})`;
              setNextBanner(`다음 학생: ${label}`);
              showToast('info', `다음 학생: ${label}`);
            }
          }
        }
        if (res.applications && res.applications.length > 0) {
          setApplications((prev) => {
            const map = new Map(prev.map((a) => [a.id, a]));
            res.applications!.forEach((a) => map.set(a.id, a));
            return Array.from(map.values()).sort((a, b) => a.sequenceNo - b.sequenceNo);
          });
        }
      } catch {
        // 조용히 재시도
      }
    };

    const startPolling = () => {
      if (timerId !== null) window.clearInterval(timerId);
      timerId = window.setInterval(() => void poll(), 5000);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void poll();
        startPolling();
      } else if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (timerId !== null) window.clearInterval(timerId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [api, activeRole, setCtxSettings, showToast]);

  const univMap = useMemo(() => new Map(universities.map((u) => [u.id, u])), [universities]);
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const evalMap = useMemo(
    () => new Map(evaluations.map((e) => [e.applicationId, e])),
    [evaluations]
  );

  const activeRound = rounds.find((r) => r.status === '진행 중' && r.currentApplicationId);
  const currentLiveApp = activeRound?.currentApplicationId
    ? applications.find((a) => a.id === activeRound.currentApplicationId)
    : undefined;

  const selectedApp = selectedAppId ? applications.find((a) => a.id === selectedAppId) : undefined;

  const handleSavedEvaluation = (saved: Evaluation) => {
    setEvaluations((prev) => {
      const exists = prev.some((e) => e.id === saved.id || e.applicationId === saved.applicationId);
      if (!exists) return [...prev, saved];
      return prev.map((e) => (e.applicationId === saved.applicationId ? saved : e));
    });
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="h-32 bg-white rounded-xl border border-slate-200 animate-pulse" />
        <div className="h-64 bg-white rounded-xl border border-slate-200 animate-pulse" />
      </div>
    );
  }

  if (selectedApp) {
    const stu = studentMap.get(selectedApp.studentId);
    const univ = univMap.get(selectedApp.universityId);
    const appQuestions = questions
      .filter((q) => q.applicationId === selectedApp.id)
      .sort((a, b) => a.seq - b.seq);
    const existingEval = evalMap.get(selectedApp.id);

    if (stu && univ) {
      return (
        <InterviewerEvaluateView
          application={selectedApp}
          student={stu}
          university={univ}
          questions={appQuestions}
          existingEvaluation={existingEval}
          settings={settings}
          nextBanner={nextBanner}
          onDismissBanner={() => setNextBanner(null)}
          onBack={() => setSelectedAppId(null)}
          onSaved={handleSavedEvaluation}
        />
      );
    }
  }

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">면접관 평가 홈</h1>
          <p className="text-sm text-slate-600">
            배정된 학생의 모의질문을 확인하고 독립적으로 평가를 입력합니다.
          </p>
        </div>
        <span className="text-xs text-slate-500 font-mono tabular-nums">
          방금 전 갱신 · {formatKstTime(lastSyncAt)}
        </span>
      </div>

      {settings.resultsLocked && (
        <div className="flex items-center gap-3 rounded-xl bg-orange-50 border border-orange-200 p-4 text-sm text-orange-900">
          <Lock className="w-5 h-5 shrink-0 text-orange-700" />
          <span className="font-medium">
            운영자가 평가를 잠금 처리하여 현재 조회만 가능합니다.
          </span>
        </div>
      )}

      {/* 현재 면접 진행 중인 학생 카드 */}
      {currentLiveApp && (() => {
        const stu = studentMap.get(currentLiveApp.studentId);
        const univ = univMap.get(currentLiveApp.universityId);
        const ev = evalMap.get(currentLiveApp.id);
        if (!stu || !univ) return null;
        return (
          <section className="bg-[#1E3A5F] text-white rounded-xl p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-teal-200">
                <span>현재 면접 진행 중</span>
                <span aria-hidden="true">·</span>
                <span>순서 {currentLiveApp.sequenceNo}번</span>
                <span aria-hidden="true">·</span>
                <span>{activeRound?.room}</span>
              </div>
              <h2 className="text-2xl font-bold">
                {stu.name}{' '}
                <span className="text-base font-normal text-slate-200 font-mono tabular-nums">
                  ({stu.studentNo} · {stu.classLabel})
                </span>
              </h2>
              <p className="text-sm text-slate-200">
                {univ.name} ({univ.admissionType}) · {currentLiveApp.major || stu.desiredMajor || '-'}
                {ev?.status === 'submitted' ? ' · 제출 완료' : ev ? ' · 임시저장 중' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedAppId(currentLiveApp.id)}
              className="px-6 py-3.5 rounded-xl bg-[#0F766E] hover:bg-[#0d625b] text-white font-bold text-base transition-colors whitespace-nowrap shrink-0 min-h-[48px]"
            >
              평가 화면 바로 열기
            </button>
          </section>
        );
      })()}

      {/* 내 배정 면접 목록 */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            배정된 면접 목록 ({applications.length}건)
          </h2>
        </div>

        {applications.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">
            아직 배정된 면접 건이 없습니다. 운영교사에게 회차 면접위원 배정을 요청하세요.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {applications.map((app) => {
              const stu = studentMap.get(app.studentId);
              const univ = univMap.get(app.universityId);
              const ev = evalMap.get(app.id);
              const isCurrent = activeRound?.currentApplicationId === app.id;

              const evalBadge =
                ev?.status === 'submitted'
                  ? { label: '제출 완료', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
                  : ev
                    ? { label: '임시저장', cls: 'bg-amber-50 text-amber-800 border-amber-200' }
                    : { label: '미작성', cls: 'bg-slate-100 text-slate-700 border-slate-200' };

              return (
                <div
                  key={app.id}
                  className={`p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors ${
                    isCurrent ? 'bg-teal-50/40' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        #{app.sequenceNo}
                      </span>
                      <span className="font-bold text-base text-slate-900">
                        {maskStudentName(stu?.name ?? '-', settings.maskStudentNames)}
                      </span>
                      <span className="text-sm text-slate-500 font-mono tabular-nums">
                        {stu?.studentNo} · {stu?.classLabel}
                      </span>
                      {isCurrent && (
                        <span className="text-xs font-bold text-[#0F766E]">· 현재 진행 중</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: univ?.color ?? '#1E3A5F' }}
                      />
                      <span className="font-medium text-slate-800">{univ?.name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{app.major || stu?.desiredMajor || '-'}</span>
                      <span aria-hidden="true">·</span>
                      <span>진행 상태: {app.status}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    {ev && (
                      <span className="text-sm font-mono font-bold text-[#1E3A5F] tabular-nums">
                        {ev.convertedScore.toFixed(1)}점
                      </span>
                    )}
                    <span
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md border ${evalBadge.cls}`}
                    >
                      {evalBadge.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedAppId(app.id)}
                      className="px-4 py-2.5 text-sm font-semibold text-white bg-[#1E3A5F] hover:bg-[#162d4a] rounded-lg min-h-[44px] whitespace-nowrap"
                    >
                      {ev?.status === 'submitted' ? '평가 보기/수정' : '평가 입력'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

interface EvaluateViewProps {
  application: Application;
  student: Student;
  university: University;
  questions: ApplicationQuestion[];
  existingEvaluation?: Evaluation;
  settings: Settings;
  nextBanner: string | null;
  onDismissBanner: () => void;
  onBack: () => void;
  onSaved: (ev: Evaluation) => void;
}

function InterviewerEvaluateView({
  application,
  student,
  university,
  questions,
  existingEvaluation,
  settings,
  nextBanner,
  onDismissBanner,
  onBack,
  onSaved,
}: EvaluateViewProps) {
  const { api, showToast } = useApp();
  const [form, setForm] = useState<DraftForm>(() => evalToForm(existingEvaluation));
  const [dirty, setDirty] = useState(false);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<string>(existingEvaluation?.updatedAt ?? '');
  const [openAnchorKey, setOpenAnchorKey] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // 타이머 상태 (대학별 면접 시간 기준 카운트다운)
  const totalSec = university.durationMin * 60;
  const [secondsLeft, setSecondsLeft] = useState(totalSec);
  const [timerRunning, setTimerRunning] = useState(false);

  const formRef = useRef(form);
  formRef.current = form;
  const existingRef = useRef(existingEvaluation);
  existingRef.current = existingEvaluation;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // 학생/면접건 전환 시 폼·타이머 초기화
  useEffect(() => {
    setForm(evalToForm(existingEvaluation));
    setDirty(false);
    setSavingState(existingEvaluation ? 'saved' : 'idle');
    setSavedAt(existingEvaluation?.updatedAt ?? '');
    setSecondsLeft(university.durationMin * 60);
    setTimerRunning(false);
  }, [application.id, university.durationMin]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  const persistDraft = useCallback(
    async (silent = true) => {
      if (settings.resultsLocked) return;
      setSavingState('saving');
      try {
        const targetStatus =
          existingRef.current?.status === 'submitted' ? 'submitted' : 'draft';
        const res = await api.saveEvaluation(application.id, {
          ...formRef.current,
          status: targetStatus,
        });
        onSaved(res.evaluation);
        setDirty(false);
        setSavingState('saved');
        setSavedAt(res.evaluation.updatedAt);
        if (!silent) {
          showToast('success', '임시저장되었습니다.');
        }
      } catch (err) {
        setSavingState('error');
        showToast(
          'error',
          err instanceof Error
            ? `저장 실패: ${err.message} (잠시 후 다시 시도합니다)`
            : '네트워크 오류로 저장하지 못했습니다.'
        );
      }
    },
    [api, application.id, onSaved, settings.resultsLocked, showToast]
  );

  // 2초 디바운스 자동 임시저장
  useEffect(() => {
    if (!dirty || settings.resultsLocked) return;
    const timer = window.setTimeout(() => {
      void persistDraft(true);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [dirty, form, persistDraft, settings.resultsLocked]);

  // 15분 무활동 잠금 전 / 다음 학생 전환 전 즉시 임시저장
  useEffect(() => {
    const handleFlush = () => {
      if (dirtyRef.current && !settings.resultsLocked) {
        void persistDraft(true);
      }
      if (existingRef.current?.status !== 'submitted') {
        showToast('info', '작성 중이던 평가가 임시저장되었습니다. 나중에 제출할 수 있습니다.');
      }
    };
    window.addEventListener('app:before-idle-lock', handleFlush);
    window.addEventListener('app:flush-eval-draft', handleFlush);
    return () => {
      window.removeEventListener('app:before-idle-lock', handleFlush);
      window.removeEventListener('app:flush-eval-draft', handleFlush);
    };
  }, [persistDraft, settings.resultsLocked, showToast]);

  const convertedScore = useMemo(
    () => calculateConvertedScore(form.scores, university.rubric),
    [form.scores, university.rubric]
  );

  const missingItems = useMemo(
    () =>
      university.rubric.filter(
        (item) => typeof form.scores[item.key] !== 'number' || form.scores[item.key] < 1
      ),
    [form.scores, university.rubric]
  );

  const updateForm = (updater: (prev: DraftForm) => DraftForm) => {
    if (settings.resultsLocked) return;
    setForm((prev) => updater(prev));
    setDirty(true);
  };

  const toggleQuickTag = (tag: string) => {
    updateForm((prev) => ({
      ...prev,
      quickTags: prev.quickTags.includes(tag)
        ? prev.quickTags.filter((t) => t !== tag)
        : [...prev.quickTags, tag],
    }));
  };

  const handleOpenNotion = () => {
    void api.openNotion(application.id);
  };

  const handleRequestSubmit = () => {
    if (missingItems.length > 0) {
      showToast(
        'warning',
        `미입력 평가 항목이 있습니다: ${missingItems.map((m) => m.label).join(', ')}`
      );
      return;
    }
    setShowSubmitConfirm(true);
  };

  const handleConfirmSubmit = async () => {
    setShowSubmitConfirm(false);
    setSavingState('saving');
    try {
      const res = await api.saveEvaluation(application.id, {
        ...form,
        status: 'submitted',
      });
      onSaved(res.evaluation);
      setDirty(false);
      setSavingState('saved');
      setSavedAt(res.evaluation.updatedAt);
      showToast('success', '평가가 최종 제출되었습니다.');
    } catch (err) {
      setSavingState('error');
      showToast('error', err instanceof Error ? err.message : '평가 제출에 실패했습니다.');
    }
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const isTimerWarning = secondsLeft <= 60;

  return (
    <main className="max-w-[1440px] mx-auto p-4 sm:p-6 space-y-4">
      {/* 상단 내비게이션 & 저장 상태 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            if (dirty && !settings.resultsLocked) void persistDraft(true);
            onBack();
          }}
          className="inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>목록으로</span>
        </button>

        <div className="flex items-center gap-3 text-sm">
          {savingState === 'saving' && (
            <span className="text-slate-600 font-medium">임시저장 중...</span>
          )}
          {savingState === 'saved' && savedAt && (
            <span className="text-emerald-700 font-medium font-mono tabular-nums">
              저장됨 · {formatKstTime(savedAt)}
            </span>
          )}
          {savingState === 'error' && (
            <button
              type="button"
              onClick={() => void persistDraft(false)}
              className="text-red-700 font-semibold underline"
            >
              저장 실패 · 다시 시도
            </button>
          )}
          {existingEvaluation?.status === 'submitted' && (
            <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md">
              제출 완료{existingEvaluation.editedAfterSubmit ? ' (수정됨)' : ''}
            </span>
          )}
        </div>
      </div>

      {nextBanner && (
        <div className="rounded-xl bg-[#0F766E] text-white px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
          <p className="font-semibold text-base">{nextBanner}</p>
          <button
            type="button"
            onClick={onDismissBanner}
            className="text-xs underline text-teal-100 hover:text-white"
          >
            확인
          </button>
        </div>
      )}

      {settings.resultsLocked && (
        <div className="rounded-xl bg-orange-50 border border-orange-200 p-4 flex items-center gap-2.5 text-sm text-orange-900 font-medium">
          <Lock className="w-4 h-4 shrink-0" />
          <span>전체 평가가 잠금 상태입니다. 내용을 수정할 수 없습니다.</span>
        </div>
      )}

      {/* 2단 레이아웃 (태블릿 가로 1024px 이상 2단 / 휴대폰 1단) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 왼쪽: 학생 정보 + 노션 모의질문 + 질문 체크리스트 + 타이머 */}
        <div className="lg:col-span-5 space-y-4">
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 font-mono tabular-nums">
                  진행 순서 {application.sequenceNo}번 · {student.studentNo} · {student.classLabel}
                </p>
                <h1 className="text-2xl font-bold text-slate-900 mt-1">{student.name}</h1>
              </div>
              <span
                className="px-3 py-1 rounded-lg text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: university.color }}
              >
                {university.name}
              </span>
            </div>

            <div className="text-sm text-slate-700 space-y-1 border-t border-slate-100 pt-3">
              <p>
                <span className="font-semibold text-slate-900">전형 / 모집단위:</span>{' '}
                {university.admissionType} · {application.major || student.desiredMajor || '-'}
              </p>
              <p>
                <span className="font-semibold text-slate-900">면접 방식:</span>{' '}
                {university.interviewFormat} ({university.durationMin}분)
              </p>
            </div>

            {/* 노션 모의질문 링크 */}
            <div className="pt-1 space-y-2">
              {application.notionUrl ? (
                <a
                  href={application.notionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleOpenNotion}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#0F766E] hover:bg-[#0d625b] text-white font-semibold text-base transition-colors min-h-[48px]"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>노션 모의질문 열기</span>
                </a>
              ) : (
                <div className="w-full text-center px-4 py-3 rounded-xl bg-slate-100 text-slate-500 text-sm">
                  등록된 노션 모의질문 링크가 없습니다.
                </div>
              )}
              <p className="text-xs text-slate-500 leading-relaxed">
                노션 페이지는 면접위원 계정에만 공유되어 있으며, 이 앱은 내용을 복사하거나 저장하지 않습니다.
              </p>
            </div>
          </section>

          {/* 면접 타이머 */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#1E3A5F]" />
                면접 타이머 ({university.durationMin}분 기준)
              </span>
              <span
                className={`text-3xl font-bold font-mono tabular-nums ${
                  isTimerWarning ? 'text-red-600' : 'text-[#1E3A5F]'
                }`}
              >
                {mm}:{ss}
              </span>
            </div>
            {isTimerWarning && secondsLeft > 0 && (
              <p className="text-xs font-semibold text-red-600">
                면접 종료 1분 전입니다. 마무리 질문을 진행해 주세요.
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTimerRunning((r) => !r)}
                className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[#1E3A5F] text-white text-sm font-semibold min-h-[44px]"
              >
                {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{timerRunning ? '일시정지' : '시작'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTimerRunning(false);
                  setSecondsLeft(totalSec);
                }}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold min-h-[44px]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>초기화 ({university.durationMin}:00)</span>
              </button>
            </div>
          </section>

          {/* 질문 체크리스트 (등록된 경우) */}
          {questions.length > 0 && (
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
              <h2 className="text-base font-bold text-slate-900">질문 체크리스트</h2>
              <div className="space-y-3">
                {questions.map((q) => {
                  const val = form.questionChecks[q.id];
                  const toggleCheck = (next: QuestionCheckValue) => {
                    updateForm((prev) => {
                      const nextChecks = { ...prev.questionChecks };
                      if (nextChecks[q.id] === next) delete nextChecks[q.id];
                      else nextChecks[q.id] = next;
                      return { ...prev, questionChecks: nextChecks };
                    });
                  };
                  return (
                    <div key={q.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                      <p className="text-sm font-medium text-slate-900">
                        <span className="font-mono text-[#1E3A5F] mr-1.5">Q{q.seq}.</span>
                        {q.questionText}
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            ['asked', '질문함', 'bg-slate-800 text-white'],
                            ['good', '잘 답함', 'bg-emerald-700 text-white'],
                            ['needs_work', '보완 필요', 'bg-amber-600 text-white'],
                          ] as const
                        ).map(([code, label, activeCls]) => (
                          <button
                            key={code}
                            type="button"
                            disabled={settings.resultsLocked}
                            onClick={() => toggleCheck(code)}
                            className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-colors min-h-[40px] ${
                              val === code
                                ? `${activeCls} border-transparent`
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* 오른쪽: 평가표 입력 */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">면접 평가표</h2>
              <p className="text-xs text-slate-500">
                모든 점수와 의견은 본인만 확인할 수 있으며 다른 면접관에게 공개되지 않습니다.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 block">실시간 환산점수</span>
              <span className="text-2xl font-bold text-[#1E3A5F] font-mono tabular-nums">
                {convertedScore.toFixed(1)}
                <span className="text-sm font-normal text-slate-500"> / 100</span>
              </span>
            </div>
          </div>

          {/* 항목별 1~5점 */}
          <div className="space-y-5">
            {university.rubric.map((item) => {
              const selectedScore = form.scores[item.key];
              const isOpen = openAnchorKey === item.key;
              return (
                <div key={item.key} className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">{item.label}</h3>
                        <span className="text-xs font-semibold text-[#0F766E] font-mono tabular-nums">
                          배점 {item.weight}점
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 mt-0.5">{item.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenAnchorKey(isOpen ? null : item.key)}
                      aria-label={`${item.label} 채점 기준 보기`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-[#1E3A5F] px-2 py-1 rounded-md bg-slate-100 shrink-0"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>기준</span>
                    </button>
                  </div>

                  {isOpen && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 space-y-1">
                      <p>
                        <span className="font-bold text-emerald-800">5점:</span> {item.anchors['5']}
                      </p>
                      <p>
                        <span className="font-bold text-slate-800">3점:</span> {item.anchors['3']}
                      </p>
                      <p>
                        <span className="font-bold text-amber-800">1점:</span> {item.anchors['1']}
                      </p>
                      <p className="text-slate-500 pt-0.5">※ 4점·2점은 각 기준의 중간 수준입니다.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={item.label}>
                    {[1, 2, 3, 4, 5].map((score) => {
                      const active = selectedScore === score;
                      return (
                        <button
                          key={score}
                          type="button"
                          disabled={settings.resultsLocked}
                          onClick={() =>
                            updateForm((prev) => ({
                              ...prev,
                              scores: { ...prev.scores, [item.key]: score },
                            }))
                          }
                          className={`min-h-[48px] rounded-xl font-mono text-lg font-bold border transition-colors ${
                            active
                              ? 'bg-[#1E3A5F] text-white border-[#1E3A5F] shadow-sm'
                              : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {score}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 종합 판단 */}
          <div className="space-y-2">
            <span className="block text-sm font-bold text-slate-900">종합 판단</span>
            <div className="grid grid-cols-3 gap-2">
              {(['우수', '보통', '보완 필요'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  disabled={settings.resultsLocked}
                  onClick={() => updateForm((prev) => ({ ...prev, overall: level }))}
                  className={`min-h-[46px] rounded-xl text-sm font-bold border transition-colors ${
                    form.overall === level
                      ? 'bg-[#0F766E] text-white border-[#0F766E]'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* 퀵 태그 */}
          <div className="space-y-2">
            <span className="block text-sm font-bold text-slate-900">관찰 퀵 태그 (다중 선택)</span>
            <div className="flex flex-wrap gap-2">
              {QUICK_TAG_OPTIONS.map((tag) => {
                const selected = form.quickTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    disabled={settings.resultsLocked}
                    onClick={() => toggleQuickTag(tag)}
                    className={`min-h-[40px] px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      selected
                        ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 서술형 4종 */}
          <div className="space-y-4">
            <div>
              <label htmlFor="ev-strengths" className="block text-sm font-bold text-slate-900 mb-1">
                강점
              </label>
              <textarea
                id="ev-strengths"
                rows={2}
                disabled={settings.resultsLocked}
                value={form.strengths}
                onChange={(e) => updateForm((p) => ({ ...p, strengths: e.target.value }))}
                placeholder="답변에서 드러난 강점과 우수 사례를 입력하세요."
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-base"
              />
            </div>

            <div>
              <label htmlFor="ev-improvements" className="block text-sm font-bold text-slate-900 mb-1">
                보완점
              </label>
              <textarea
                id="ev-improvements"
                rows={2}
                disabled={settings.resultsLocked}
                value={form.improvements}
                onChange={(e) => updateForm((p) => ({ ...p, improvements: e.target.value }))}
                placeholder="답변 구성, 근거 제시, 태도 등에서 보완할 점을 입력하세요."
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-base"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="ev-advice" className="text-sm font-bold text-slate-900">
                  학생에게 전하는 조언 <span className="text-[#0F766E] font-medium">(결과지에 실림)</span>
                </label>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  {form.adviceToStudent.length} / 500자
                </span>
              </div>
              <textarea
                id="ev-advice"
                rows={3}
                maxLength={500}
                disabled={settings.resultsLocked}
                value={form.adviceToStudent}
                onChange={(e) =>
                  updateForm((p) => ({ ...p, adviceToStudent: e.target.value.slice(0, 500) }))
                }
                placeholder="학생이 실전 면접을 준비할 때 참고할 조언을 따뜻하고 구체적으로 작성해 주세요."
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-base"
              />
            </div>

            <div>
              <label htmlFor="ev-admin-note" className="block text-sm font-bold text-slate-900 mb-1">
                운영자에게만 전달할 메모 <span className="text-slate-500 font-normal">(결과지·담임 비공개)</span>
              </label>
              <textarea
                id="ev-admin-note"
                rows={2}
                disabled={settings.resultsLocked}
                value={form.noteToAdmin}
                onChange={(e) => updateForm((p) => ({ ...p, noteToAdmin: e.target.value }))}
                placeholder="운영 교사에게 전달할 특이사항이 있는 경우 입력하세요."
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-base bg-slate-50"
              />
            </div>
          </div>

          {/* 하단 저장 / 제출 버튼 */}
          <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              disabled={settings.resultsLocked || savingState === 'saving'}
              onClick={() => void persistDraft(false)}
              className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-base min-h-[48px] disabled:opacity-50"
            >
              임시저장
            </button>
            <button
              type="button"
              disabled={settings.resultsLocked || savingState === 'saving'}
              onClick={handleRequestSubmit}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#1E3A5F] hover:bg-[#162d4a] text-white font-bold text-base min-h-[48px] disabled:opacity-50"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>{existingEvaluation?.status === 'submitted' ? '수정 제출' : '평가 제출'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 제출 확인 모달 */}
      {showSubmitConfirm && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-[#0F766E] shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-slate-900">평가를 제출하시겠습니까?</h3>
                <p className="text-sm text-slate-600 mt-1">
                  {student.name} ({university.name}) · 환산점수{' '}
                  <span className="font-bold text-[#1E3A5F] font-mono tabular-nums">
                    {convertedScore.toFixed(1)}점
                  </span>
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  제출 후에도 운영자가 전체 평가를 잠그기 전까지 수정할 수 있습니다.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="px-4 py-2.5 rounded-lg bg-slate-100 text-slate-700 font-medium text-sm"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmSubmit()}
                className="px-5 py-2.5 rounded-lg bg-[#1E3A5F] text-white font-semibold text-sm"
              >
                확인하고 제출
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
