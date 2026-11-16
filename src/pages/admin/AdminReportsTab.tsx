import { useMemo, useState } from 'react';
import { CheckCircle2, Lock, Printer, Unlock } from 'lucide-react';
import { ReportPrintView } from '../../components/ReportPrintView';
import { useApp } from '../../context/AppContext';
import type { Student, WorkspaceSnapshot } from '../../types';

interface Props {
  data: WorkspaceSnapshot;
  onRefresh: () => Promise<void>;
}

export function AdminReportsTab({ data, onRefresh }: Props) {
  const { api, showToast } = useApp();
  const [classFilter, setClassFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [comment, setComment] = useState('');
  const [printingStudents, setPrintingStudents] = useState<Student[] | null>(null);
  const [busy, setBusy] = useState(false);

  const reportMap = useMemo(
    () => new Map(data.reports.map((r) => [r.studentId, r])),
    [data.reports]
  );

  const classOptions = useMemo(
    () => Array.from(new Set(data.students.map((s) => s.classLabel))).sort(),
    [data.students]
  );

  const visibleStudents = useMemo(
    () =>
      data.students.filter((s) => classFilter === 'all' || s.classLabel === classFilter),
    [data.students, classFilter]
  );

  const handleToggleLock = async () => {
    setBusy(true);
    try {
      const next = !data.settings.resultsLocked;
      await api.updateSettings({ ...data.settings, resultsLocked: next });
      await onRefresh();
      showToast(
        'info',
        next ? '전체 평가가 잠금 처리되었습니다.' : '전체 평가 잠금이 해제되었습니다.'
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '잠금 설정 변경에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const openEditor = (s: Student) => {
    const rep = reportMap.get(s.id);
    setEditingStudent(s);
    setComment(rep?.adminComment ?? '');
  };

  const handleSaveReport = async (status: 'draft' | 'confirmed') => {
    if (!editingStudent) return;
    setBusy(true);
    try {
      await api.saveReport(editingStudent.id, comment, status);
      setEditingStudent(null);
      await onRefresh();
      showToast(
        'success',
        status === 'confirmed' ? '결과지가 확정되었습니다.' : '초안이 저장되었습니다.'
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '결과지 저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleBatchConfirm = async () => {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      await api.confirmReportsBatch(selectedIds);
      setSelectedIds([]);
      await onRefresh();
      showToast('success', `${selectedIds.length}명의 결과지를 일괄 확정했습니다.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '일괄 확정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleBatchPrint = () => {
    const targets =
      selectedIds.length > 0
        ? visibleStudents.filter((s) => selectedIds.includes(s.id))
        : visibleStudents;
    if (targets.length === 0) {
      showToast('warning', '인쇄할 학생이 없습니다.');
      return;
    }
    setPrintingStudents(targets);
  };

  if (printingStudents) {
    return (
      <ReportPrintView
        students={printingStudents}
        applications={data.applications}
        universities={data.universities}
        rounds={data.rounds}
        questions={data.questions}
        evaluations={data.evaluations}
        reports={data.reports}
        settings={data.settings}
        onClose={() => setPrintingStudents(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">결과지 확정 및 인쇄</h1>
          <p className="text-sm text-slate-600">
            운영자 종합 코멘트를 작성해 결과지를 확정하고, 반별·전체 일괄 인쇄(PDF)를 실행합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleToggleLock()}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
              data.settings.resultsLocked
                ? 'bg-orange-50 border-orange-300 text-orange-900'
                : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
            }`}
          >
            {data.settings.resultsLocked ? (
              <Lock className="w-4 h-4" />
            ) : (
              <Unlock className="w-4 h-4" />
            )}
            <span>{data.settings.resultsLocked ? '평가 잠금 중 (해제하기)' : '전체 평가 잠그기'}</span>
          </button>

          <button
            type="button"
            onClick={handleBatchPrint}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#1E3A5F] hover:bg-[#162d4a] text-white text-sm font-semibold"
          >
            <Printer className="w-4 h-4" />
            <span>
              {selectedIds.length > 0
                ? `선택 일괄 인쇄 (${selectedIds.length}명)`
                : `목록 일괄 인쇄 (${visibleStudents.length}명)`}
            </span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <label htmlFor="report-class-filter" className="text-sm font-medium text-slate-700">
            학반 선택
          </label>
          <select
            id="report-class-filter"
            value={classFilter}
            onChange={(e) => {
              setClassFilter(e.target.value);
              setSelectedIds([]);
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-white"
          >
            <option value="all">전체 반</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          disabled={busy || selectedIds.length === 0}
          onClick={() => void handleBatchConfirm()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F766E] text-white text-sm font-semibold disabled:opacity-40"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>선택 일괄 확정 ({selectedIds.length}명)</span>
        </button>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    aria-label="전체 선택"
                    checked={
                      visibleStudents.length > 0 && selectedIds.length === visibleStudents.length
                    }
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? visibleStudents.map((s) => s.id) : [])
                    }
                    className="accent-[#1E3A5F]"
                  />
                </th>
                <th className="py-3 px-4">학번 / 이름</th>
                <th className="py-3 px-4">학반</th>
                <th className="py-3 px-4">제출 평가 수</th>
                <th className="py-3 px-4">결과지 상태</th>
                <th className="py-3 px-4 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visibleStudents.map((s) => {
                const stuApps = data.applications.filter((a) => a.studentId === s.id);
                const submittedCnt = data.evaluations.filter(
                  (e) =>
                    stuApps.some((a) => a.id === e.applicationId) && e.status === 'submitted'
                ).length;
                const rep = reportMap.get(s.id);
                const isConfirmed = rep?.status === 'confirmed';

                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(s.id)}
                        onChange={(e) =>
                          setSelectedIds((prev) =>
                            e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                          )
                        }
                        className="accent-[#1E3A5F]"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-slate-500 mr-2">{s.studentNo}</span>
                      <span className="font-bold text-slate-900">{s.name}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{s.classLabel}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                      {submittedCnt}건 ({stuApps.length}개 면접)
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded border ${
                          isConfirmed
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {isConfirmed ? '확정 완료' : '미확정'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditor(s)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                        >
                          코멘트 · 확정
                        </button>
                        <button
                          type="button"
                          onClick={() => setPrintingStudents([s])}
                          className="px-3 py-1.5 rounded-lg bg-[#1E3A5F] text-white text-xs font-semibold"
                        >
                          미리보기/인쇄
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 코멘트 & 확정 모달 */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">
              {editingStudent.name} ({editingStudent.studentNo}) 결과지 확정
            </h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                운영자 종합 코멘트 (결과지에 표시)
              </label>
              <textarea
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="학생에게 전달할 종합 격려 및 준비 방향을 입력하세요."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium"
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSaveReport('draft')}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-800 text-sm font-semibold"
              >
                임시저장
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSaveReport('confirmed')}
                className="px-5 py-2 rounded-lg bg-[#0F766E] text-white text-sm font-semibold"
              >
                결과지 확정
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
