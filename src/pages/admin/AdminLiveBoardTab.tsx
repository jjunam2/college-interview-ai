import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Clock, FastForward, Play } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Application, WorkspaceSnapshot } from '../../types';
import { formatKstTime, maskStudentName } from '../../utils/format';

interface Props {
  data: WorkspaceSnapshot;
  lastSyncAt: string;
  onRefresh: () => Promise<void>;
}

export function AdminLiveBoardTab({ data, lastSyncAt, onRefresh }: Props) {
  const { api, showToast } = useApp();
  const [selectedRoundId, setSelectedRoundId] = useState<string>(
    () =>
      data.rounds.find((r) => r.status === '진행 중')?.id ?? data.rounds[0]?.id ?? ''
  );
  const [busy, setBusy] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const selectedRound = data.rounds.find((r) => r.id === selectedRoundId) ?? data.rounds[0];

  const roundApps = useMemo(() => {
    if (!selectedRound) return [];
    return data.applications
      .filter((a) => a.roundId === selectedRound.id)
      .sort((a, b) => a.sequenceNo - b.sequenceNo);
  }, [data.applications, selectedRound]);

  const currentApp = selectedRound?.currentApplicationId
    ? roundApps.find((a) => a.id === selectedRound.currentApplicationId)
    : roundApps.find((a) => a.status === '면접 중');

  const studentMap = useMemo(() => new Map(data.students.map((s) => [s.id, s])), [data.students]);
  const univMap = useMemo(() => new Map(data.universities.map((u) => [u.id, u])), [data.universities]);
  const teacherMap = useMemo(() => new Map(data.teachers.map((t) => [t.id, t])), [data.teachers]);

  // 현재 면접 시작 시각 기준 경과 타이머
  useEffect(() => {
    if (!currentApp) {
      setElapsedSec(0);
      return;
    }
    const computeElapsed = () => {
      const startMs = Date.parse(currentApp.updatedAt);
      if (Number.isNaN(startMs)) return 0;
      return Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    };
    setElapsedSec(computeElapsed());
    const id = window.setInterval(() => setElapsedSec(computeElapsed()), 1000);
    return () => window.clearInterval(id);
  }, [currentApp?.id, currentApp?.updatedAt]);

  const handleStart = async (appId: string) => {
    if (!selectedRound) return;
    setBusy(true);
    try {
      await api.startApplication(selectedRound.id, appId);
      await onRefresh();
      showToast('success', '해당 학생의 면접을 시작했습니다. 면접관 화면이 자동 전환됩니다.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '면접 시작에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleNext = async () => {
    if (!selectedRound) return;
    setBusy(true);
    try {
      await api.nextApplication(selectedRound.id);
      await onRefresh();
      showToast('success', '다음 학생으로 전환했습니다.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '다음 학생 전환에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (idx: number, dir: -1 | 1) => {
    if (!selectedRound) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= roundApps.length) return;
    const nextOrder = roundApps.map((a) => a.id);
    const [moved] = nextOrder.splice(idx, 1);
    nextOrder.splice(targetIdx, 0, moved);
    try {
      await api.reorderRound(selectedRound.id, nextOrder);
      await onRefresh();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '순서 변경에 실패했습니다.');
    }
  };

  const handleToggleAbsent = async (app: Application) => {
    const nextStatus = app.status === '결시' ? '대기' : '결시';
    try {
      await api.updateApplication(app.id, { status: nextStatus });
      await onRefresh();
      showToast('info', `${nextStatus} 상태로 변경되었습니다.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '상태 변경에 실패했습니다.');
    }
  };

  const curStu = currentApp ? studentMap.get(currentApp.studentId) : undefined;
  const curUniv = currentApp ? univMap.get(currentApp.universityId) : undefined;
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');
  const isOvertime = curUniv ? elapsedSec >= curUniv.durationMin * 60 : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">행사 당일 진행 보드</h1>
          <p className="text-sm text-slate-600">
            진행 중인 학생을 지정하면 면접관 화면이 5초 이내에 해당 학생 평가표로 전환됩니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            방금 전 갱신 · {formatKstTime(lastSyncAt)}
          </span>
          <select
            value={selectedRound?.id ?? ''}
            onChange={(e) => setSelectedRoundId(e.target.value)}
            aria-label="회차 선택"
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-base font-semibold text-slate-900"
          >
            {data.rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 현재 진행 중인 학생 대형 카드 */}
      <section className="bg-[#1E3A5F] text-white rounded-xl p-6 shadow-sm space-y-5">
        {currentApp && curStu && curUniv ? (
          <>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-teal-200">
                  현재 면접 중 · 순서 {currentApp.sequenceNo}번 · {selectedRound?.room}
                </p>
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 className="text-3xl sm:text-4xl font-bold">
                    {maskStudentName(curStu.name, data.settings.maskStudentNames)}
                  </h2>
                  <span className="text-lg text-slate-200 font-mono tabular-nums">
                    {curStu.studentNo} · {curStu.classLabel}
                  </span>
                </div>
                <p className="text-lg text-slate-100">
                  {curUniv.name} ({curUniv.admissionType}) · {currentApp.major || curStu.desiredMajor}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="bg-white/10 rounded-xl px-5 py-3 text-center">
                  <span className="text-xs text-slate-200 block">
                    경과 시간 (기준 {curUniv.durationMin}분)
                  </span>
                  <span
                    className={`text-3xl font-bold font-mono tabular-nums inline-flex items-center gap-2 ${
                      isOvertime ? 'text-amber-300' : 'text-white'
                    }`}
                  >
                    <Clock className="w-5 h-5" />
                    {mm}:{ss}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleNext()}
                  className="inline-flex items-center gap-2 px-6 py-4 rounded-xl bg-[#0F766E] hover:bg-[#0d625b] text-white font-bold text-lg transition-colors disabled:opacity-50"
                >
                  <FastForward className="w-5 h-5" />
                  <span>다음 학생</span>
                </button>
              </div>
            </div>

            {/* 면접위원별 제출 현황 */}
            <div className="border-t border-white/15 pt-4">
              <p className="text-xs font-semibold text-slate-200 mb-2.5">
                배정 면접위원 실시간 제출 현황 ({currentApp.interviewerIds.length}명)
              </p>
              <div className="flex flex-wrap gap-2">
                {currentApp.interviewerIds.map((uid) => {
                  const teacher = teacherMap.get(uid);
                  const ev = data.evaluations.find(
                    (e) => e.applicationId === currentApp.id && e.interviewerUserId === uid
                  );
                  const label =
                    ev?.status === 'submitted'
                      ? '제출 완료'
                      : ev
                        ? '작성 중'
                        : '미작성';
                  const cls =
                    ev?.status === 'submitted'
                      ? 'bg-emerald-500/25 border-emerald-300 text-emerald-100'
                      : ev
                        ? 'bg-amber-400/25 border-amber-300 text-amber-100'
                        : 'bg-white/10 border-white/25 text-slate-200';
                  return (
                    <span
                      key={uid}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${cls}`}
                    >
                      {ev?.status === 'submitted' && <Check className="w-4 h-4" />}
                      <span>{teacher?.name ?? '면접관'}</span>
                      <span className="opacity-80">· {label}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">현재 진행 중인 면접이 없습니다</h2>
              <p className="text-sm text-slate-200 mt-1">
                아래 대기 목록에서 첫 번째 학생의 [면접 시작] 버튼을 눌러 주세요.
              </p>
            </div>
            {roundApps.some((a) => a.status === '대기') && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleNext()}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#0F766E] hover:bg-[#0d625b] text-white font-bold text-base"
              >
                <Play className="w-4 h-4" />
                <span>첫 대기 학생 시작</span>
              </button>
            )}
          </div>
        )}
      </section>

      {/* 진행 순서 목록 */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            진행 순서 목록 ({roundApps.length}건)
          </h2>
        </div>

        {roundApps.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            이 회차에 등록된 면접 건이 없습니다. [학생·면접 건] 메뉴에서 등록해 주세요.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">순서</th>
                  <th className="py-3 px-4">학생</th>
                  <th className="py-3 px-4">지원 대학 · 모집단위</th>
                  <th className="py-3 px-4">제출 현황</th>
                  <th className="py-3 px-4">상태</th>
                  <th className="py-3 px-4 text-right">진행 제어</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-base">
                {roundApps.map((app, idx) => {
                  const stu = studentMap.get(app.studentId);
                  const univ = univMap.get(app.universityId);
                  const submittedCount = data.evaluations.filter(
                    (e) => e.applicationId === app.id && e.status === 'submitted'
                  ).length;

                  const statusCls =
                    app.status === '면접 중'
                      ? 'bg-teal-50 text-[#0F766E] border-teal-300'
                      : app.status === '완료'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : app.status === '결시'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200';

                  return (
                    <tr
                      key={app.id}
                      className={app.status === '면접 중' ? 'bg-teal-50/40' : 'hover:bg-slate-50'}
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 tabular-nums">
                        {app.sequenceNo}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-900">
                          {maskStudentName(stu?.name ?? '-', data.settings.maskStudentNames)}
                        </span>
                        <span className="text-sm text-slate-500 font-mono tabular-nums ml-2">
                          {stu?.studentNo} · {stu?.classLabel}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-sm">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full mr-1.5"
                          style={{ backgroundColor: univ?.color ?? '#1E3A5F' }}
                        />
                        <span className="font-semibold text-slate-800">{univ?.name}</span>
                        <span className="text-slate-500 ml-1.5">{app.major || '-'}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-sm tabular-nums text-slate-700">
                        {submittedCount} / {app.interviewerIds.length}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-md border text-xs font-semibold ${statusCls}`}
                        >
                          {app.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => void handleMove(idx, -1)}
                            aria-label="순서 위로"
                            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === roundApps.length - 1}
                            onClick={() => void handleMove(idx, 1)}
                            aria-label="순서 아래로"
                            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleAbsent(app)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            {app.status === '결시' ? '결시 해제' : '결시'}
                          </button>
                          <button
                            type="button"
                            disabled={busy || app.status === '결시'}
                            onClick={() => void handleStart(app.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1E3A5F] hover:bg-[#162d4a] text-white text-xs font-semibold disabled:opacity-40"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>면접 시작</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
