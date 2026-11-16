import { useMemo } from 'react';
import type { WorkspaceSnapshot } from '../../types';
import { formatKstTime, maskStudentName } from '../../utils/format';

interface Props {
  data: WorkspaceSnapshot;
  lastSyncAt: string;
  onNavigateTab: (tab: string) => void;
}

export function AdminDashboardTab({ data, lastSyncAt, onNavigateTab }: Props) {
  const { settings, rounds, teachers, students, applications, universities, evaluations } = data;

  const pendingTeachers = teachers.filter((t) => t.status === 'pending');

  // 기대 평가 수 = 각 면접 건(결시 제외)에 배정된 면접관 수 합
  const activeApps = applications.filter((a) => a.status !== '결시');
  let expectedCount = 0;
  let submittedCount = 0;
  const missingInterviewerIds = new Set<string>();

  const evalByAppAndUser = new Map<string, string>();
  for (const ev of evaluations) {
    evalByAppAndUser.set(`${ev.applicationId}:${ev.interviewerUserId}`, ev.status);
  }

  for (const app of activeApps) {
    for (const uid of app.interviewerIds) {
      expectedCount++;
      const status = evalByAppAndUser.get(`${app.id}:${uid}`);
      if (status === 'submitted') {
        submittedCount++;
      } else if (app.status === '완료' || app.status === '면접 중') {
        missingInterviewerIds.add(uid);
      }
    }
  }

  const submitRate = expectedCount > 0 ? Math.round((submittedCount / expectedCount) * 100) : 0;

  const univProgress = useMemo(() => {
    return universities.map((u) => {
      const uApps = applications.filter((a) => a.universityId === u.id);
      const done = uApps.filter((a) => a.status === '완료').length;
      const pct = uApps.length > 0 ? Math.round((done / uApps.length) * 100) : 0;
      return { univ: u, total: uApps.length, done, pct };
    });
  }, [universities, applications]);

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const appMap = new Map(applications.map((a) => [a.id, a]));
  const univMap = new Map(universities.map((u) => [u.id, u]));

  const recentFeed = useMemo(() => {
    return evaluations
      .filter((e) => e.status === 'submitted' && e.submittedAt)
      .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))
      .slice(0, 10);
  }, [evaluations]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">운영자 대시보드</h1>
          <p className="text-sm text-slate-600">
            모의면접 진행 현황과 면접위원 평가 제출 상태를 실시간으로 확인합니다.
          </p>
        </div>
        <span className="text-xs font-mono text-slate-500 tabular-nums">
          방금 전 갱신 · {formatKstTime(lastSyncAt)}
        </span>
      </div>

      {/* KPI 카드 6개 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">회차 수</p>
          <p className="text-2xl font-bold text-[#1E3A5F] font-mono tabular-nums mt-1">
            {rounds.length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">등록 학생</p>
          <p className="text-2xl font-bold text-[#1E3A5F] font-mono tabular-nums mt-1">
            {students.filter((s) => s.active).length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">전체 면접 건</p>
          <p className="text-2xl font-bold text-[#1E3A5F] font-mono tabular-nums mt-1">
            {applications.length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">평가 제출률</p>
          <p className="text-2xl font-bold text-[#0F766E] font-mono tabular-nums mt-1">
            {submitRate}%
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">미제출 면접관</p>
          <p className="text-2xl font-bold text-amber-700 font-mono tabular-nums mt-1">
            {missingInterviewerIds.size}명
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigateTab('teachers')}
          className="text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-[#1E3A5F] transition-colors"
        >
          <p className="text-xs font-medium text-slate-500">승인 대기 교사</p>
          <p
            className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
              pendingTeachers.length > 0 ? 'text-orange-700' : 'text-slate-700'
            }`}
          >
            {pendingTeachers.length}명
          </p>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 대학별 진행률 */}
        <section className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900">대학별 면접 진행률</h2>
          {univProgress.length === 0 ? (
            <p className="text-sm text-slate-500">등록된 대학이 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {univProgress.map(({ univ, total, done, pct }) => (
                <div key={univ.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-800 inline-flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: univ.color }}
                      />
                      {univ.name}
                    </span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      {done} / {total}건 ({pct}%)
                    </span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: univ.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 최근 제출 피드 10건 */}
        <section className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900">최근 평가 제출 피드</h2>
          {recentFeed.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              아직 제출된 평가가 없습니다. 진행 보드에서 면접을 시작하면 실시간으로 표시됩니다.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentFeed.map((ev) => {
                const app = appMap.get(ev.applicationId);
                const stu = app ? studentMap.get(app.studentId) : undefined;
                const univ = app ? univMap.get(app.universityId) : undefined;
                return (
                  <div key={ev.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-900">
                        {ev.interviewerName || '면접관'}
                      </span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-slate-800">
                        {maskStudentName(stu?.name ?? '-', settings.maskStudentNames)}
                      </span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-slate-600">{univ?.name ?? '-'}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                      <span className="font-bold text-[#1E3A5F]">{ev.convertedScore.toFixed(1)}점</span>
                      <span className="text-xs text-slate-500">
                        {ev.submittedAt ? formatKstTime(ev.submittedAt) : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
