import React, { useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { RubricItem, University, WorkspaceSnapshot } from '../../types';

interface Props {
  data: WorkspaceSnapshot;
  onRefresh: () => Promise<void>;
}

const DEFAULT_NEW_RUBRIC: RubricItem[] = [
  {
    key: 'academic',
    label: '학업역량',
    description: '교과 학습과 탐구 경험을 구체적 과정과 결과로 설명하는가',
    weight: 50,
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
    weight: 50,
    anchors: {
      '5': '구체적 사례와 본인 역할·배운 점을 명확히 제시하고 꼬리질문에도 일관됨',
      '3': '사례는 있으나 과정이나 의미 설명이 부족함',
      '1': '사례 없이 일반론적 답변, 또는 자신의 활동을 설명하지 못함',
    },
  },
];

export function AdminUniversitiesTab({ data, onRefresh }: Props) {
  const { api, showToast } = useApp();
  const [editing, setEditing] = useState<University | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [name, setName] = useState('');
  const [admissionType, setAdmissionType] = useState('');
  const [interviewFormat, setInterviewFormat] = useState('');
  const [durationMin, setDurationMin] = useState(10);
  const [color, setColor] = useState('#1E40AF');
  const [sortOrder, setSortOrder] = useState(1);
  const [rubric, setRubric] = useState<RubricItem[]>([]);
  const [showSubmittedWarning, setShowSubmittedWarning] = useState(false);
  const [busy, setBusy] = useState(false);

  const weightSum = rubric.reduce((s, r) => s + Number(r.weight || 0), 0);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setAdmissionType('');
    setInterviewFormat('제출 서류 기반 확인 면접 (개별 패널)');
    setDurationMin(10);
    setColor('#1E40AF');
    setSortOrder(data.universities.length + 1);
    setRubric(JSON.parse(JSON.stringify(DEFAULT_NEW_RUBRIC)));
    setShowModal(true);
  };

  const openEdit = (u: University) => {
    setEditing(u);
    setName(u.name);
    setAdmissionType(u.admissionType);
    setInterviewFormat(u.interviewFormat);
    setDurationMin(u.durationMin);
    setColor(u.color);
    setSortOrder(u.sortOrder);
    setRubric(JSON.parse(JSON.stringify(u.rubric)));
    setShowModal(true);
  };

  const hasSubmittedEvalsForEditing = editing
    ? data.evaluations.some((ev) => {
        if (ev.status !== 'submitted') return false;
        const app = data.applications.find((a) => a.id === ev.applicationId);
        return app?.universityId === editing.id;
      })
    : false;

  const commitSave = async () => {
    if (weightSum !== 100) {
      showToast('error', `가중치 합계는 반드시 100이어야 합니다. (현재: ${weightSum})`);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        admissionType: admissionType.trim(),
        interviewFormat: interviewFormat.trim(),
        durationMin: Number(durationMin),
        color,
        sortOrder: Number(sortOrder),
        rubric,
      };
      if (editing) {
        await api.updateUniversity(editing.id, payload);
        showToast('success', '대학 및 평가표를 수정했습니다.');
      } else {
        await api.createUniversity(payload);
        showToast('success', '새 대학을 추가했습니다.');
      }
      setShowSubmittedWarning(false);
      setShowModal(false);
      await onRefresh();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (weightSum !== 100) {
      showToast('error', `가중치 합계는 반드시 100이어야 합니다. (현재: ${weightSum})`);
      return;
    }
    if (editing && hasSubmittedEvalsForEditing) {
      setShowSubmittedWarning(true);
      return;
    }
    void commitSave();
  };

  const addRubricItem = () => {
    setRubric((prev) => [
      ...prev,
      {
        key: `item_${Date.now().toString(36)}`,
        label: '새 평가 항목',
        description: '',
        weight: 0,
        anchors: {
          '5': '우수 수준 기준',
          '3': '보통 수준 기준',
          '1': '미흡 수준 기준',
        },
      },
    ]);
  };

  const moveRubric = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= rubric.length) return;
    setRubric((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, item);
      return copy;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">대학 및 평가표(루브릭) 관리</h1>
          <p className="text-sm text-slate-600">
            대학별 전형명, 면접 시간(분), 평가 항목과 가중치(합계 100)를 설정합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#1E3A5F] hover:bg-[#162d4a] text-white text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          <span>대학 추가</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {data.universities.map((u) => (
          <section
            key={u.id}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full inline-block"
                      style={{ backgroundColor: u.color }}
                    />
                    <h2 className="text-lg font-bold text-slate-900">{u.name}</h2>
                  </div>
                  <p className="text-sm font-medium text-[#0F766E] mt-0.5">{u.admissionType}</p>
                </div>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  {u.durationMin}분
                </span>
              </div>
              <p className="text-xs text-slate-600">{u.interviewFormat}</p>

              <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs">
                {u.rubric.map((r) => (
                  <div key={r.key} className="flex items-center justify-between text-slate-700">
                    <span>{r.label}</span>
                    <span className="font-mono font-semibold tabular-nums">{r.weight}점</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => openEdit(u)}
                className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-800"
              >
                평가표 수정
              </button>
            </div>
          </section>
        ))}
      </div>

      {/* 대학·평가표 편집 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleFormSubmit}
            className="bg-white rounded-xl border border-slate-200 max-w-3xl w-full p-6 space-y-5 shadow-xl my-8"
          >
            <h2 className="text-lg font-bold text-slate-900">
              {editing ? `${editing.name} 평가표 수정` : '새 대학 추가'}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">대학명 *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">전형명 *</label>
                <input
                  type="text"
                  required
                  value={admissionType}
                  onChange={(e) => setAdmissionType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    시간(분) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    required
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">색상</label>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full h-[38px] rounded-lg border border-slate-300 p-1"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                면접 방식 안내 *
              </label>
              <input
                type="text"
                required
                value={interviewFormat}
                onChange={(e) => setInterviewFormat(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            {/* 루브릭 편집기 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">
                  평가 항목 ({rubric.length}개)
                </span>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-mono font-bold tabular-nums ${
                      weightSum === 100 ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    가중치 합계: {weightSum} / 100
                  </span>
                  <button
                    type="button"
                    onClick={addRubricItem}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800"
                  >
                    + 항목 추가
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {rubric.map((item, idx) => (
                  <div
                    key={item.key}
                    className="border border-slate-200 rounded-xl p-3.5 bg-slate-50 space-y-2"
                  >
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        required
                        value={item.label}
                        onChange={(e) =>
                          setRubric((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r))
                          )
                        }
                        placeholder="항목명"
                        className="col-span-5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold"
                      />
                      <div className="col-span-3 flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          required
                          value={item.weight}
                          onChange={(e) =>
                            setRubric((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, weight: Number(e.target.value) } : r
                              )
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-mono"
                        />
                        <span className="text-xs text-slate-500">점</span>
                      </div>
                      <div className="col-span-4 flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => moveRubric(idx, -1)}
                          className="p-1.5 rounded border border-slate-200 bg-white"
                          aria-label="위로"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveRubric(idx, 1)}
                          className="p-1.5 rounded border border-slate-200 bg-white"
                          aria-label="아래로"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={rubric.length <= 1}
                          onClick={() => setRubric((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1.5 rounded border border-red-200 bg-white text-red-600 disabled:opacity-30"
                          aria-label="삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) =>
                        setRubric((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, description: e.target.value } : r
                          )
                        )
                      }
                      placeholder="항목 설명"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      {(['5', '3', '1'] as const).map((level) => (
                        <input
                          key={level}
                          type="text"
                          value={item.anchors[level]}
                          onChange={(e) =>
                            setRubric((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? { ...r, anchors: { ...r.anchors, [level]: e.target.value } }
                                  : r
                              )
                            )
                          }
                          placeholder={`${level}점 기준`}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={busy || weightSum !== 100}
                className="px-5 py-2 rounded-lg bg-[#1E3A5F] text-white text-sm font-semibold disabled:opacity-45"
              >
                {busy ? '저장 중...' : '평가표 저장'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 이미 제출된 평가가 있을 때 경고 모달 */}
      {showSubmittedWarning && (
        <div className="fixed inset-0 z-[60] bg-slate-900/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-slate-900">이미 제출된 평가가 있습니다</h3>
                <p className="text-sm text-slate-600 mt-1">
                  {editing?.name}에는 이미 제출된 평가가 존재합니다. 평가표를 수정하면 기존 평가와의
                  배점 기준이 달라질 수 있습니다. 계속 저장하시겠습니까?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSubmittedWarning(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium"
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void commitSave()}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold"
              >
                경고 확인 후 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
