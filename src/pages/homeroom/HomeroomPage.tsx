import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { ReportPrintView } from '../../components/ReportPrintView';
import { useApp } from '../../context/AppContext';
import type {
  Application,
  ApplicationQuestion,
  Evaluation,
  Report,
  Round,
  Settings,
  Student,
  University,
} from '../../types';
import { formatKstTime, maskStudentName } from '../../utils/format';

export function HomeroomPage() {
  const { api, activeRole, settings: ctxSettings, showToast } = useApp();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>(ctxSettings);
  const [universities, setUniversities] = useState<University[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [questions, setQuestions] = useState<ApplicationQuestion[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string>(new Date().toISOString());
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [printingStudentId, setPrintingStudentId] = useState<string | null>(null);

  const serverTimeRef = useRef<string>(new Date().toISOString());

  const loadWorkspace = useCallback(async () => {
    try {
      const ws = await api.getHomeroomWorkspace();
      setSettings(ws.settings);
      setUniversities(ws.universities);
      setRounds(ws.rounds);
      setStudents(ws.students);
      setApplications(ws.applications);
      setQuestions(ws.questions);
      setEvaluations(ws.evaluations);
      setReports(ws.reports);
      serverTimeRef.current = ws.serverTime;
      setLastSyncAt(new Date().toISOString());
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '담당 학생 결과를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [api, showToast]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  // 5초 실시간 폴링 (visibilityState 준수)
  useEffect(() => {
    let timerId: number | null = null;

    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await api.getChanges(serverTimeRef.current, activeRole);
        serverTimeRef.current = res.serverTime;
        setLastSyncAt(new Date().toISOString());
        if (res.settings) setSettings(res.settings);
        if (res.reports) setReports(res.reports);
        if (res.applications && res.applications.length > 0) {
          setApplications((prev) => {
            const map = new Map(prev.map((a) => [a.id, a]));
            res.applications!.forEach((a) => map.set(a.id, a));
            return Array.from(map.values());
          });
        }
        if (res.evaluations && res.evaluations.length > 0) {
          setEvaluations((prev) => {
            const map = new Map(prev.map((e) => [e.id, e]));
            res.evaluations!.forEach((e) => map.set(e.id, e));
            return Array.from(map.values());
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

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void poll();
        startPolling();
      } else if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timerId !== null) window.clearInterval(timerId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [api, activeRole]);

  const univMap = useMemo(() => new Map(universities.map((u) => [u.id, u])), [universities]);
  const reportMap = useMemo(() => new Map(reports.map((r) => [r.studentId, r])), [reports]);

  const selectedStudent = selectedStudentId
    ? students.find((s) => s.id === selectedStudentId)
    : undefined;

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />
        <div className="h-64 bg-white rounded-xl border border-slate-200 animate-pulse" />
      </div>
    );
  }

  if (printingStudentId) {
    const stu = students.find((s) => s.id === printingStudentId);
    if (stu) {
      return (
        <ReportPrintView
          students={[stu]}
          applications={applications}
          universities={universities}
          rounds={rounds}
          questions={questions}
          evaluations={evaluations}
          reports={reports}
          settings={settings}
          onClose={() => setPrintingStudentId(null)}
        />
      );
    }
  }

  if (selectedStudent) {
    const stuApps = applications
      .filter((a) => a.studentId === selectedStudent.id)
      .sort((a, b) => a.sequenceNo - b.sequenceNo);
    const rep = reportMap.get(selectedStudent.id);
    const isConfirmed = rep?.status === 'confirmed';

    return (
      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedStudentId(null)}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>우리 반 목록</span>
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              방금 전 갱신 · {formatKstTime(lastSyncAt)}
            </span>
            <button
              type="button"
              disabled={!isConfirmed}
              onClick={() => setPrintingStudentId(selectedStudent.id)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#1E3A5F] hover:bg-[#162d4a] disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed min-h-[44px]"
            >
              <Printer className="w-4 h-4" />
              <span>{isConfirmed ? '결과지 인쇄 / PDF' : '결과지 확정 대기'}</span>
            </button>
          </div>
        </div>

        {/* 학생 헤더 */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 font-mono tabular-nums">
              {selectedStudent.studentNo} · {selectedStudent.classLabel}
            </p>
            <h1 className="text-2xl font-bold text-slate-900 mt-0.5">{selectedStudent.name}</h1>
            <p className="text-sm text-slate-600 mt-1">
              희망 전공: {selectedStudent.desiredMajor || '-'}
            </p>
          </div>
          <span
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              isConfirmed
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            {isConfirmed ? '결과지 확정 완료' : '결과지 확정 전 (실시간 조회)'}
          </span>
        </section>

        {/* 대학별 제출 평가 카드 (읽기 전용) */}
        {stuApps.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
            배정된 모의면접 건이 없습니다.
          </div>
        ) : (
          <div className="space-y-5">
            {stuApps.map((app) => {
              const univ = univMap.get(app.universityId);
              const submittedEvals = evaluations.filter((e) => e.applicationId === app.id);
              const avg =
                submittedEvals.length > 0
                  ? (
                      submittedEvals.reduce((s, e) => s + e.convertedScore, 0) /
                      submittedEvals.length
                    ).toFixed(1)
                  : '-';

              return (
                <section
                  key={app.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: univ?.color ?? '#1E3A5F' }}
                        />
                        <h2 className="text-lg font-bold text-slate-900">
                          {univ?.name} · {univ?.admissionType}
                        </h2>
                      </div>
                      <p className="text-sm text-slate-600">
                        모집단위: {app.major || '-'} · 면접 상태: {app.status}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500 block">제출 평균 점수</span>
                      <span className="text-2xl font-bold text-[#1E3A5F] font-mono tabular-nums">
                        {avg}
                      </span>
                    </div>
                  </div>

                  {submittedEvals.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">
                      아직 최종 제출된 면접관 평가가 없습니다. (임시저장 중인 평가는 표시되지 않습니다)
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {submittedEvals.map((ev) => (
                        <div
                          key={ev.id}
                          className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              {ev.interviewerName || '면접관'}
                            </span>
                            <div className="flex items-center gap-3 text-sm">
                              <span className="font-semibold text-[#0F766E]">{ev.overall}</span>
                              <span className="font-mono font-bold text-[#1E3A5F] tabular-nums">
                                {ev.convertedScore.toFixed(1)}점
                              </span>
                            </div>
                          </div>

                          {univ && (
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                              {univ.rubric.map((item) => (
                                <div
                                  key={item.key}
                                  className="bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-between"
                                >
                                  <span className="text-slate-600 truncate mr-1">{item.label}</span>
                                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                                    {ev.scores[item.key] ?? '-'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {ev.quickTags.length > 0 && (
                            <p className="text-xs text-slate-700">
                              <span className="font-semibold text-slate-800 mr-1.5">특징:</span>
                              {ev.quickTags.join(' · ')}
                            </p>
                          )}

                          <div className="space-y-1.5 text-sm text-slate-800">
                            {ev.strengths && (
                              <p>
                                <span className="font-semibold text-slate-900">강점:</span>{' '}
                                {ev.strengths}
                              </p>
                            )}
                            {ev.improvements && (
                              <p>
                                <span className="font-semibold text-slate-900">보완점:</span>{' '}
                                {ev.improvements}
                              </p>
                            )}
                            {ev.adviceToStudent && (
                              <p>
                                <span className="font-semibold text-[#0F766E]">학생 조언:</span>{' '}
                                {ev.adviceToStudent}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">담임교사 조회 화면 (읽기 전용)</h1>
          <p className="text-sm text-slate-600">
            담당 학급 학생의 제출 완료된 면접 결과를 실시간으로 조회합니다.
          </p>
        </div>
        <span className="text-xs text-slate-500 font-mono tabular-nums">
          방금 전 갱신 · {formatKstTime(lastSyncAt)}
        </span>
      </div>

      {students.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">
          담당 학생으로 배정된 학생이 없습니다. 운영교사에게 담임 배정을 요청하세요.
        </div>
      ) : (
        <div className="space-y-3">
          {students.map((stu) => {
            const stuApps = applications.filter((a) => a.studentId === stu.id);
            const rep = reportMap.get(stu.id);
            const isConfirmed = rep?.status === 'confirmed';

            return (
              <div
                key={stu.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-slate-500 tabular-nums">
                      {stu.studentNo}
                    </span>
                    <span className="text-lg font-bold text-slate-900">
                      {maskStudentName(stu.name, settings.maskStudentNames)}
                    </span>
                    <span className="text-sm text-slate-600">{stu.classLabel}</span>
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded border ${
                        isConfirmed
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {isConfirmed ? '결과지 확정' : '미확정'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
                    <span>면접 {stuApps.length}건</span>
                    {stuApps.map((app) => {
                      const univ = univMap.get(app.universityId);
                      const appEvals = evaluations.filter((e) => e.applicationId === app.id);
                      const avg =
                        appEvals.length > 0
                          ? (
                              appEvals.reduce((s, e) => s + e.convertedScore, 0) / appEvals.length
                            ).toFixed(1)
                          : '-';
                      return (
                        <span key={app.id} className="inline-flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full inline-block"
                            style={{ backgroundColor: univ?.color ?? '#1E3A5F' }}
                          />
                          <span>
                            {univ?.name}: <strong className="font-mono tabular-nums">{avg}점</strong> (
                            {appEvals.length}명 제출)
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    disabled={!isConfirmed}
                    onClick={() => setPrintingStudentId(stu.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 disabled:opacity-45 disabled:cursor-not-allowed min-h-[44px]"
                  >
                    <Printer className="w-4 h-4" />
                    <span>인쇄</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStudentId(stu.id)}
                    className="px-4 py-2.5 rounded-lg bg-[#1E3A5F] hover:bg-[#162d4a] text-white text-sm font-semibold min-h-[44px]"
                  >
                    상세 보기
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
