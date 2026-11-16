import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, ListChecks, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Application, CsvImportRowInput, Student, WorkspaceSnapshot } from '../../types';
import { downloadCsv, isAllowedNotionUrl, maskStudentName, parseCsvText } from '../../utils/format';

interface Props {
  data: WorkspaceSnapshot;
  onRefresh: () => Promise<void>;
}

export function AdminStudentsTab({ data, onRefresh }: Props) {
  const { api, showToast } = useApp();
  const [search, setSearch] = useState('');
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [showStudentModal, setShowStudentModal] = useState(false);

  // 학생 폼 (생기부 필드 절대 없음)
  const [studentNo, setStudentNo] = useState('');
  const [name, setName] = useState('');
  const [classLabel, setClassLabel] = useState('');
  const [homeroomUserId, setHomeroomUserId] = useState<string>('');
  const [desiredMajor, setDesiredMajor] = useState('');
  const [memo, setMemo] = useState('');
  const [active, setActive] = useState(true);

  // 학생 상세 (면접 건 목록 & 추가)
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const [appRoundId, setAppRoundId] = useState(data.rounds[0]?.id ?? '');
  const [appUnivId, setAppUnivId] = useState(data.universities[0]?.id ?? '');
  const [appMajor, setAppMajor] = useState('');
  const [appNotionUrl, setAppNotionUrl] = useState('');
  const [appSeq, setAppSeq] = useState(1);
  const [appSlotTime, setAppSlotTime] = useState('');

  // 질문 체크리스트 편집 모달
  const [questionApp, setQuestionApp] = useState<Application | null>(null);
  const [questionText, setQuestionText] = useState('');

  // 개별 면접관 배정 모달
  const [intOverrideApp, setIntOverrideApp] = useState<Application | null>(null);
  const [intOverrideIds, setIntOverrideIds] = useState<string[]>([]);

  // CSV 일괄 등록 모달
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvRoundId, setCsvRoundId] = useState(data.rounds[0]?.id ?? '');
  const [csvRawText, setCsvRawText] = useState('');
  const [busy, setBusy] = useState(false);

  const homeroomTeachers = data.teachers.filter(
    (t) => t.status === 'active' && (t.roles.includes('homeroom') || t.roles.includes('admin'))
  );
  const interviewerTeachers = data.teachers.filter(
    (t) => t.status === 'active' && (t.roles.includes('interviewer') || t.roles.includes('admin'))
  );
  const univMap = useMemo(() => new Map(data.universities.map((u) => [u.id, u])), [data.universities]);
  const roundMap = useMemo(() => new Map(data.rounds.map((r) => [r.id, r])), [data.rounds]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.students.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.studentNo.toLowerCase().includes(q) ||
        s.classLabel.toLowerCase().includes(q)
    );
  }, [data.students, search]);

  const openCreateStudent = () => {
    setEditingStudent(null);
    setStudentNo('');
    setName('');
    setClassLabel('');
    setHomeroomUserId('');
    setDesiredMajor('');
    setMemo('');
    setActive(true);
    setShowStudentModal(true);
  };

  const openEditStudent = (s: Student) => {
    setEditingStudent(s);
    setStudentNo(s.studentNo);
    setName(s.name);
    setClassLabel(s.classLabel);
    setHomeroomUserId(s.homeroomUserId ?? '');
    setDesiredMajor(s.desiredMajor);
    setMemo(s.memo);
    setActive(s.active);
    setShowStudentModal(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        studentNo: studentNo.trim(),
        name: name.trim(),
        classLabel: classLabel.trim(),
        homeroomUserId: homeroomUserId || null,
        desiredMajor: desiredMajor.trim(),
        memo: memo.trim(),
        active,
      };
      if (editingStudent) {
        await api.updateStudent(editingStudent.id, payload);
        showToast('success', '학생 정보를 수정했습니다.');
      } else {
        await api.createStudent(payload);
        showToast('success', '학생을 등록했습니다.');
      }
      setShowStudentModal(false);
      await onRefresh();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '학생 저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const openDetail = (s: Student) => {
    setDetailStudent(s);
    const defaultRoundId = data.rounds[0]?.id ?? '';
    setAppRoundId(defaultRoundId);
    setAppUnivId(data.universities[0]?.id ?? '');
    setAppMajor(s.desiredMajor);
    setAppNotionUrl('');
    const maxSeq = data.applications
      .filter((a) => a.roundId === defaultRoundId)
      .reduce((m, a) => Math.max(m, a.sequenceNo), 0);
    setAppSeq(maxSeq + 1);
    setAppSlotTime('');
  };

  const handleAddApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailStudent) return;
    if (appNotionUrl && !isAllowedNotionUrl(appNotionUrl)) {
      showToast('error', '노션 링크는 https://notion.so, notion.site, app.notion.com 도메인만 허용됩니다.');
      return;
    }
    setBusy(true);
    try {
      await api.createApplication({
        studentId: detailStudent.id,
        universityId: appUnivId,
        roundId: appRoundId,
        major: appMajor.trim(),
        notionUrl: appNotionUrl.trim(),
        sequenceNo: Number(appSeq),
        slotTime: appSlotTime.trim(),
        status: '대기',
      });
      setAppNotionUrl('');
      setAppSeq((p) => p + 1);
      await onRefresh();
      showToast('success', '면접 건을 추가했습니다.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '면접 건 추가에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteApp = async (appId: string) => {
    try {
      await api.deleteApplication(appId);
      await onRefresh();
      showToast('info', '면접 건을 삭제했습니다.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '삭제에 실패했습니다.');
    }
  };

  const openQuestionsEditor = (app: Application) => {
    const existing = data.questions
      .filter((q) => q.applicationId === app.id)
      .sort((a, b) => a.seq - b.seq)
      .map((q) => q.questionText)
      .join('\n');
    setQuestionText(existing);
    setQuestionApp(app);
  };

  const handleSaveQuestions = async () => {
    if (!questionApp) return;
    const lines = questionText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    setBusy(true);
    try {
      await api.saveApplicationQuestions(questionApp.id, lines);
      setQuestionApp(null);
      await onRefresh();
      showToast('success', `질문 ${lines.length}건이 저장되었습니다.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '질문 저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveIntOverride = async () => {
    if (!intOverrideApp) return;
    setBusy(true);
    try {
      await api.updateApplication(intOverrideApp.id, { interviewerIds: intOverrideIds });
      setIntOverrideApp(null);
      await onRefresh();
      showToast('success', '개별 면접관 배정을 수정했습니다.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '면접관 수정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  // CSV 파싱 및 미리보기
  const parsedCsvRows = useMemo<CsvImportRowInput[]>(() => {
    if (!csvRawText.trim()) return [];
    const matrix = parseCsvText(csvRawText);
    if (matrix.length === 0) return [];
    const firstRow = matrix[0];
    const hasHeader = firstRow[0]?.includes('학번') || firstRow[1]?.includes('이름');
    const bodyRows = hasHeader ? matrix.slice(1) : matrix;

    return bodyRows.map((cols, idx) => {
      const studentNo = cols[0] ?? '';
      const stuName = cols[1] ?? '';
      const cls = cols[2] ?? '';
      const homeroomEmail = cols[3] ?? '';
      const universityName = cols[4] ?? '';
      const major = cols[5] ?? '';
      const seqRaw = cols[6] ?? '';
      const notionUrl = cols[7] ?? '';
      const sequenceNo = Number(seqRaw);

      const errors: string[] = [];
      if (!studentNo) errors.push('학번 누락');
      if (!stuName) errors.push('이름 누락');
      if (!cls) errors.push('반 누락');
      if (!Number.isInteger(sequenceNo) || sequenceNo < 1) errors.push('진행순서 오류');

      const normUniv = universityName.trim().replace(/대학교$|대$/u, '').toLowerCase();
      const matchedUniv = data.universities.find(
        (u) =>
          u.name.toLowerCase() === universityName.trim().toLowerCase() ||
          u.name.replace(/대학교$|대$/u, '').toLowerCase() === normUniv
      );
      if (!matchedUniv) errors.push(`대학 미매칭(${universityName})`);

      if (notionUrl && !isAllowedNotionUrl(notionUrl)) {
        errors.push('노션 도메인 오류');
      }

      return {
        rowNumber: idx + 1,
        studentNo,
        name: stuName,
        classLabel: cls,
        homeroomEmail,
        universityName,
        major,
        sequenceNo: Number.isInteger(sequenceNo) && sequenceNo > 0 ? sequenceNo : 0,
        notionUrl,
        error: errors.length > 0 ? errors.join(', ') : undefined,
      };
    });
  }, [csvRawText, data.universities]);

  const csvHasErrors = parsedCsvRows.some((r) => Boolean(r.error));

  const handleConfirmCsv = async () => {
    if (!csvRoundId || parsedCsvRows.length === 0 || csvHasErrors) return;
    setBusy(true);
    try {
      const res = await api.importCsv(
        csvRoundId,
        parsedCsvRows.map(({ rowNumber: _rn, error: _err, ...rest }) => rest)
      );
      setShowCsvModal(false);
      setCsvRawText('');
      await onRefresh();
      showToast(
        'success',
        `학생 ${res.createdStudents}명, 면접 건 ${res.createdApplications}건이 등록되었습니다.`
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'CSV 등록에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    downloadCsv(
      '모의면접_학생등록_양식.csv',
      ['학번', '이름', '반', '담임이메일', '대학', '모집단위', '진행순서', '노션링크'],
      [
        ['30101', '홍길동', '3-1', '', '인하대', '컴퓨터공학과', 1, 'https://www.notion.so/sample-1'],
        ['30101', '홍길동', '3-1', '', '동국대학교', '컴퓨터AI학부', 2, 'https://www.notion.so/sample-2'],
      ]
    );
  };

  const detailApps = detailStudent
    ? data.applications
        .filter((a) => a.studentId === detailStudent.id)
        .sort((a, b) => a.sequenceNo - b.sequenceNo)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">학생 및 면접 건 관리</h1>
          <p className="text-sm text-slate-600">
            학생 정보와 대학별 면접 건을 관리합니다. (학교생활기록부 원문·파일은 저장하지 않습니다)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setCsvRoundId(data.rounds[0]?.id ?? '');
              setShowCsvModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#0F766E]" />
            <span>CSV 일괄 등록</span>
          </button>
          <button
            type="button"
            onClick={openCreateStudent}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#1E3A5F] hover:bg-[#162d4a] text-white text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>학생 추가</span>
          </button>
        </div>
      </div>

      {/* 검색 바 */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="학번, 이름, 반 검색..."
          className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-sm"
        />
      </div>

      {/* 학생 테이블 */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredStudents.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 space-y-3">
            <p>등록된 학생이 없습니다.</p>
            <button
              type="button"
              onClick={openCreateStudent}
              className="px-4 py-2 rounded-lg bg-[#1E3A5F] text-white text-sm font-semibold"
            >
              첫 학생 등록하기
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">학번</th>
                  <th className="py-3 px-4">이름</th>
                  <th className="py-3 px-4">학반</th>
                  <th className="py-3 px-4">담임교사</th>
                  <th className="py-3 px-4">희망 전공</th>
                  <th className="py-3 px-4">면접 건</th>
                  <th className="py-3 px-4 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredStudents.map((s) => {
                  const apps = data.applications.filter((a) => a.studentId === s.id);
                  return (
                    <tr key={s.id} className={!s.active ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50'}>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-700">{s.studentNo}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {maskStudentName(s.name, data.settings.maskStudentNames)}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{s.classLabel}</td>
                      <td className="py-3 px-4 text-slate-700">{s.homeroomName || '미지정'}</td>
                      <td className="py-3 px-4 text-slate-700">{s.desiredMajor || '-'}</td>
                      <td className="py-3 px-4">
                        {apps.length === 0 ? (
                          <span className="text-slate-400">0건</span>
                        ) : (
                          <span className="text-xs text-slate-700">
                            {apps
                              .map((a) => univMap.get(a.universityId)?.name.replace(/대학교$/, '') ?? '대학')
                              .join(', ')}{' '}
                            ({apps.length}건)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditStudent(s)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            정보 수정
                          </button>
                          <button
                            type="button"
                            onClick={() => openDetail(s)}
                            className="px-3 py-1.5 rounded-lg bg-[#0F766E] hover:bg-[#0d625b] text-white text-xs font-semibold"
                          >
                            면접 건 관리
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

      {/* 학생 추가/수정 모달 */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveStudent}
            className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h2 className="text-lg font-bold text-slate-900">
              {editingStudent ? '학생 정보 수정' : '새 학생 등록'}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">학번 *</label>
                <input
                  type="text"
                  required
                  value={studentNo}
                  onChange={(e) => setStudentNo(e.target.value)}
                  placeholder="예: 30101"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">이름 *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">반 *</label>
                <input
                  type="text"
                  required
                  value={classLabel}
                  onChange={(e) => setClassLabel(e.target.value)}
                  placeholder="예: 3-1"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">담임교사</label>
                <select
                  value={homeroomUserId}
                  onChange={(e) => setHomeroomUserId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="">미지정</option>
                  {homeroomTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.homeroomClass ? `(${t.homeroomClass})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">희망 전공</label>
              <input
                type="text"
                value={desiredMajor}
                onChange={(e) => setDesiredMajor(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">운영 메모</label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="accent-[#1E3A5F]"
              />
              <span>활성 학생</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowStudentModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 rounded-lg bg-[#1E3A5F] text-white text-sm font-semibold"
              >
                저장
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 학생별 면접 건 상세 모달 */}
      {detailStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 max-w-3xl w-full p-6 space-y-5 shadow-xl my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {detailStudent.name} ({detailStudent.studentNo} · {detailStudent.classLabel}) 면접 건
                </h2>
                <p className="text-xs text-slate-500">
                  한 학생에게 여러 대학 면접 건을 추가할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailStudent(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium"
              >
                닫기
              </button>
            </div>

            {/* 기존 면접 건 */}
            <div className="space-y-2.5">
              {detailApps.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                  등록된 면접 건이 없습니다.
                </p>
              ) : (
                detailApps.map((app) => {
                  const univ = univMap.get(app.universityId);
                  const rnd = roundMap.get(app.roundId);
                  const qCount = data.questions.filter((q) => q.applicationId === app.id).length;
                  return (
                    <div
                      key={app.id}
                      className="border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-[#1E3A5F]">
                            #{app.sequenceNo}
                          </span>
                          <span className="font-bold text-slate-900">{univ?.name}</span>
                          <span className="text-slate-600">· {app.major || '-'}</span>
                          <span className="text-xs text-slate-500">
                            ({rnd?.name} · {app.status})
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate max-w-md">
                          노션: {app.notionUrl || '링크 미등록'} · 면접관 {app.interviewerIds.length}명
                          · 질문 {qCount}개
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setIntOverrideApp(app);
                            setIntOverrideIds([...app.interviewerIds]);
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          면접관 조정
                        </button>
                        <button
                          type="button"
                          onClick={() => openQuestionsEditor(app)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <ListChecks className="w-3.5 h-3.5" />
                          <span>질문 목록</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteApp(app.id)}
                          aria-label="면접 건 삭제"
                          className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 새 면접 건 추가 폼 */}
            <form
              onSubmit={handleAddApplication}
              className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3"
            >
              <h3 className="text-sm font-bold text-slate-900">새 면접 건 추가</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">회차</label>
                  <select
                    value={appRoundId}
                    onChange={(e) => setAppRoundId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
                  >
                    {data.rounds.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">대학</label>
                  <select
                    value={appUnivId}
                    onChange={(e) => setAppUnivId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
                  >
                    {data.universities.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">진행 순서</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={appSeq}
                    onChange={(e) => setAppSeq(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">모집단위</label>
                  <input
                    type="text"
                    value={appMajor}
                    onChange={(e) => setAppMajor(e.target.value)}
                    placeholder="예: 컴퓨터공학과"
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    예정 시각 (선택)
                  </label>
                  <input
                    type="text"
                    value={appSlotTime}
                    onChange={(e) => setAppSlotTime(e.target.value)}
                    placeholder="예: 18:30"
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  노션 모의질문 페이지 링크 (https://notion.so 등)
                </label>
                <input
                  type="url"
                  value={appNotionUrl}
                  onChange={(e) => setAppNotionUrl(e.target.value)}
                  placeholder="https://www.notion.so/..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  노션 페이지는 &apos;웹에 게시&apos;로 공개하지 말고, 면접위원의 노션 계정에만 공유하세요.
                  이 앱은 링크만 저장하며 노션 내용은 저장하지 않습니다.
                </p>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-[#1E3A5F] text-white text-sm font-semibold"
                >
                  면접 건 추가
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 질문 체크리스트 편집 모달 */}
      {questionApp && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">질문 체크리스트 편집</h2>
            <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
              예시 답안, 생기부 원문, 근거 문장은 붙여 넣지 마세요. 질문 문장만 입력합니다. (한 줄에 한 질문)
            </p>
            <textarea
              rows={7}
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder={'전공 탐색 과정에서 가장 깊이 탐구한 주제는 무엇인가요?\n모둠 활동 중 갈등을 해결한 경험을 말해 보세요.'}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setQuestionApp(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium"
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSaveQuestions()}
                className="px-5 py-2 rounded-lg bg-[#1E3A5F] text-white text-sm font-semibold"
              >
                질문 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 개별 면접 건 면접관 조정 모달 */}
      {intOverrideApp && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">개별 면접 건 면접관 조정</h2>
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {interviewerTeachers.map((t) => {
                const checked = intOverrideIds.includes(t.id);
                return (
                  <label
                    key={t.id}
                    className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setIntOverrideIds((prev) =>
                          checked ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                        )
                      }
                      className="accent-[#1E3A5F]"
                    />
                    <span className="text-sm font-medium text-slate-900">{t.name}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIntOverrideApp(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium"
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSaveIntOverride()}
                className="px-5 py-2 rounded-lg bg-[#1E3A5F] text-white text-sm font-semibold"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV 일괄 등록 모달 */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 max-w-4xl w-full p-6 space-y-4 shadow-xl my-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-slate-900">CSV 학생·면접 건 일괄 등록</h2>
                <p className="text-xs text-slate-600">
                  헤더: 학번,이름,반,담임이메일,대학,모집단위,진행순서,노션링크 (같은 학번 여러 줄은 학생 1명 + 면접 여러 건으로 처리)
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadSampleCsv}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                예시 CSV 내려받기
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  등록할 회차 선택 *
                </label>
                <select
                  value={csvRoundId}
                  onChange={(e) => setCsvRoundId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {data.rounds.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  CSV 파일 업로드 (선택)
                </label>
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-sm cursor-pointer w-full">
                  <Upload className="w-4 h-4 text-slate-600" />
                  <span>파일 선택 (.csv)</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      void file.text().then((txt) => setCsvRawText(txt));
                    }}
                  />
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                CSV 내용 붙여넣기
              </label>
              <textarea
                rows={5}
                value={csvRawText}
                onChange={(e) => setCsvRawText(e.target.value)}
                placeholder="학번,이름,반,담임이메일,대학,모집단위,진행순서,노션링크"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>

            {parsedCsvRows.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                      <th className="py-2 px-3">행</th>
                      <th className="py-2 px-3">학번</th>
                      <th className="py-2 px-3">이름</th>
                      <th className="py-2 px-3">반</th>
                      <th className="py-2 px-3">대학</th>
                      <th className="py-2 px-3">모집단위</th>
                      <th className="py-2 px-3">순서</th>
                      <th className="py-2 px-3">검증</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedCsvRows.map((r) => (
                      <tr key={r.rowNumber} className={r.error ? 'bg-red-50' : ''}>
                        <td className="py-2 px-3 font-mono">{r.rowNumber}</td>
                        <td className="py-2 px-3 font-mono">{r.studentNo}</td>
                        <td className="py-2 px-3 font-semibold">{r.name}</td>
                        <td className="py-2 px-3">{r.classLabel}</td>
                        <td className="py-2 px-3">{r.universityName}</td>
                        <td className="py-2 px-3">{r.major}</td>
                        <td className="py-2 px-3 font-mono">{r.sequenceNo}</td>
                        <td className="py-2 px-3">
                          {r.error ? (
                            <span className="text-red-700 font-semibold">{r.error}</span>
                          ) : (
                            <span className="text-emerald-700 font-semibold">정상</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCsvModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium"
              >
                닫기
              </button>
              <button
                type="button"
                disabled={busy || parsedCsvRows.length === 0 || csvHasErrors || !csvRoundId}
                onClick={() => void handleConfirmCsv()}
                className="px-5 py-2 rounded-lg bg-[#1E3A5F] text-white text-sm font-semibold disabled:opacity-45"
              >
                {busy ? '등록 중...' : `일괄 등록 확정 (${parsedCsvRows.length}건)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
