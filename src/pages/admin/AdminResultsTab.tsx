import { useMemo, useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { WorkspaceSnapshot } from '../../types';
import { downloadCsv, formatKstTime, maskStudentName } from '../../utils/format';

interface Props {
  data: WorkspaceSnapshot;
  lastSyncAt: string;
}

export function AdminResultsTab({ data, lastSyncAt }: Props) {
  const { api, showToast } = useApp();
  const [roundFilter, setRoundFilter] = useState('all');
  const [univFilter, setUnivFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [submitFilter, setSubmitFilter] = useState<'all' | 'complete' | 'incomplete'>('all');
  const [sortBy, setSortBy] = useState<'seq' | 'avg' | 'studentNo'>('seq');

  const studentMap = useMemo(() => new Map(data.students.map((s) => [s.id, s])), [data.students]);
  const univMap = useMemo(() => new Map(data.universities.map((u) => [u.id, u])), [data.universities]);

  const classOptions = useMemo(() => {
    return Array.from(new Set(data.students.map((s) => s.classLabel))).sort();
  }, [data.students]);

  const rows = useMemo(() => {
    return data.applications
      .map((app) => {
        const stu = studentMap.get(app.studentId);
        const univ = univMap.get(app.universityId);
        const appEvals = data.evaluations.filter(
          (e) => e.applicationId === app.id && e.status === 'submitted'
        );
        const avg =
          appEvals.length > 0
            ? appEvals.reduce((s, e) => s + e.convertedScore, 0) / appEvals.length
            : null;

        // 항목별 평균과 2점 이상 편차 검사
        const itemStats =
          univ?.rubric.map((item) => {
            const vals = appEvals
              .map((e) => e.scores[item.key])
              .filter((v): v is number => typeof v === 'number');
            if (vals.length === 0) {
              return { key: item.key, label: item.label, avg: null, spread: 0, hasGap: false };
            }
            const itemAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
            const spread = Math.max(...vals) - Math.min(...vals);
            return {
              key: item.key,
              label: item.label,
              avg: itemAvg,
              spread,
              hasGap: spread >= 2,
            };
          }) ?? [];

        const hasAnyGap = itemStats.some((st) => st.hasGap);
        const isFullySubmitted =
          app.interviewerIds.length > 0 && appEvals.length >= app.interviewerIds.length;

        return {
          app,
          stu,
          univ,
          appEvals,
          avg,
          itemStats,
          hasAnyGap,
          isFullySubmitted,
        };
      })
      .filter((r) => {
        if (roundFilter !== 'all' && r.app.roundId !== roundFilter) return false;
        if (univFilter !== 'all' && r.app.universityId !== univFilter) return false;
        if (classFilter !== 'all' && r.stu?.classLabel !== classFilter) return false;
        if (submitFilter === 'complete' && !r.isFullySubmitted) return false;
        if (submitFilter === 'incomplete' && r.isFullySubmitted) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'avg') return (b.avg ?? -1) - (a.avg ?? -1);
        if (sortBy === 'studentNo') {
          return (a.stu?.studentNo ?? '').localeCompare(b.stu?.studentNo ?? '');
        }
        return a.app.sequenceNo - b.app.sequenceNo;
      });
  }, [
    data.applications,
    data.evaluations,
    studentMap,
    univMap,
    roundFilter,
    univFilter,
    classFilter,
    submitFilter,
    sortBy,
  ]);

  const handleExportCsv = async () => {
    const headers = [
      '순서',
      '학번',
      '이름',
      '반',
      '대학',
      '모집단위',
      '진행상태',
      '제출인원',
      '평균환산점수',
      '면접관별점수',
      '항목별평균',
      '항목편차경고',
    ];
    const csvRows = rows.map((r) => [
      r.app.sequenceNo,
      r.stu?.studentNo ?? '',
      r.stu?.name ?? '',
      r.stu?.classLabel ?? '',
      r.univ?.name ?? '',
      r.app.major,
      r.app.status,
      `${r.appEvals.length}/${r.app.interviewerIds.length}`,
      r.avg !== null ? r.avg.toFixed(1) : '-',
      r.appEvals.map((e) => `${e.interviewerName || '면접관'}:${e.convertedScore.toFixed(1)}`).join(' / '),
      r.itemStats
        .map((st) => `${st.label}:${st.avg !== null ? st.avg.toFixed(1) : '-'}`)
        .join(' / '),
      r.hasAnyGap ? '2점 이상 차이' : '',
    ]);

    downloadCsv(`모의면접_결과취합_${new Date().toISOString().slice(0, 10)}.csv`, headers, csvRows);
    try {
      await api.recordCsvExport(`결과 취합 CSV 내보내기 (${rows.length}건)`);
    } catch {
      // 감사 로그 기록 실패가 다운로드를 막지는 않음
    }
    showToast('success', '엑셀 호환 CSV 파일을 내려받았습니다.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">결과 취합 매트릭스</h1>
          <p className="text-sm text-slate-600">
            같은 항목에서 면접관 간 점수 차이가 2점 이상이면 주황색 경고로 표시됩니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            방금 전 갱신 · {formatKstTime(lastSyncAt)}
          </span>
          <button
            type="button"
            onClick={() => void handleExportCsv()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#0F766E] hover:bg-[#0d625b] text-white text-sm font-semibold"
          >
            <Download className="w-4 h-4" />
            <span>CSV 내보내기</span>
          </button>
        </div>
      </div>

      {/* 필터 & 정렬 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
        <select
          value={roundFilter}
          onChange={(e) => setRoundFilter(e.target.value)}
          aria-label="회차 필터"
          className="rounded-lg border border-slate-300 px-3 py-2 bg-white"
        >
          <option value="all">전체 회차</option>
          {data.rounds.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <select
          value={univFilter}
          onChange={(e) => setUnivFilter(e.target.value)}
          aria-label="대학 필터"
          className="rounded-lg border border-slate-300 px-3 py-2 bg-white"
        >
          <option value="all">전체 대학</option>
          {data.universities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          aria-label="학반 필터"
          className="rounded-lg border border-slate-300 px-3 py-2 bg-white"
        >
          <option value="all">전체 학반</option>
          {classOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={submitFilter}
          onChange={(e) => setSubmitFilter(e.target.value as 'all' | 'complete' | 'incomplete')}
          aria-label="제출 상태 필터"
          className="rounded-lg border border-slate-300 px-3 py-2 bg-white"
        >
          <option value="all">전체 제출 상태</option>
          <option value="complete">전원 제출 완료</option>
          <option value="incomplete">미제출 포함</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'seq' | 'avg' | 'studentNo')}
          aria-label="정렬 기준"
          className="rounded-lg border border-slate-300 px-3 py-2 bg-white"
        >
          <option value="seq">진행 순서순</option>
          <option value="avg">평균 점수 높은순</option>
          <option value="studentNo">학번순</option>
        </select>
      </div>

      {/* 매트릭스 테이블 */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            조건에 해당하는 면접 결과가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">순서</th>
                  <th className="py-3 px-4">학생</th>
                  <th className="py-3 px-4">대학 · 모집단위</th>
                  <th className="py-3 px-4">면접관별 환산점수</th>
                  <th className="py-3 px-4">항목별 평균</th>
                  <th className="py-3 px-4 text-right">총 평균</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map(({ app, stu, univ, appEvals, avg, itemStats, hasAnyGap }) => (
                  <tr key={app.id} className="hover:bg-slate-50 align-top">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-700 tabular-nums">
                      {app.sequenceNo}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-900">
                        {maskStudentName(stu?.name ?? '-', data.settings.maskStudentNames)}
                      </p>
                      <p className="text-xs text-slate-500 font-mono tabular-nums">
                        {stu?.studentNo} · {stu?.classLabel}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900">{univ?.name}</p>
                      <p className="text-xs text-slate-500">{app.major || '-'}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      {appEvals.length === 0 ? (
                        <span className="text-xs text-slate-400">
                          제출 없음 (0/{app.interviewerIds.length})
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {appEvals.map((ev) => (
                            <span
                              key={ev.id}
                              className="px-2 py-0.5 rounded bg-slate-100 text-xs font-mono tabular-nums text-slate-800"
                            >
                              {ev.interviewerName || '면접관'}:{' '}
                              <strong>{ev.convertedScore.toFixed(1)}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1.5">
                        {itemStats.map((st) => (
                          <span
                            key={st.key}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono tabular-nums border ${
                              st.hasGap
                                ? 'bg-orange-50 border-orange-300 text-orange-900 font-bold'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            {st.hasGap && <AlertTriangle className="w-3 h-3 text-orange-600" />}
                            <span>
                              {st.label} {st.avg !== null ? st.avg.toFixed(1) : '-'}
                            </span>
                          </span>
                        ))}
                      </div>
                      {hasAnyGap && (
                        <p className="text-xs text-orange-700 font-medium mt-1">
                          경고: 면접관 간 항목 점수 차이 2점 이상 발생
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                      <span className="text-lg font-bold text-[#1E3A5F]">
                        {avg !== null ? avg.toFixed(1) : '-'}
                      </span>
                      <p className="text-xs text-slate-500">
                        {appEvals.length}/{app.interviewerIds.length}명
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
