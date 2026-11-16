import React, { useState } from 'react';
import { Calendar, Plus, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Round, RoundStatus, User } from '../../types';
import { formatKoreanDateTime } from '../../utils/format';

interface Props {
  rounds: Round[];
  teachers: User[];
  onRefresh: () => Promise<void>;
}

export function AdminRoundsTab({ rounds, teachers, onRefresh }: Props) {
  const { api, showToast } = useApp();
  const [editing, setEditing] = useState<Round | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [name, setName] = useState('');
  const [date, setDate] = useState('2026-11-17');
  const [startTime, setStartTime] = useState('18:30');
  const [room, setRoom] = useState('진로진학실');
  const [status, setStatus] = useState<RoundStatus>('준비');

  const [assigningRound, setAssigningRound] = useState<Round | null>(null);
  const [selectedInts, setSelectedInts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const eligibleInterviewers = teachers.filter(
    (t) => t.status === 'active' && (t.roles.includes('interviewer') || t.roles.includes('admin'))
  );

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDate('2026-11-17');
    setStartTime('18:30');
    setRoom('진로진학실');
    setStatus('준비');
    setShowModal(true);
  };

  const openEdit = (r: Round) => {
    setEditing(r);
    setName(r.name);
    setDate(r.date);
    setStartTime(r.startTime);
    setRoom(r.room);
    setStatus(r.status);
    setShowModal(true);
  };

  const handleSaveRound = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        await api.updateRound(editing.id, { name, date, startTime, room, status });
        showToast('success', '회차 정보를 수정했습니다.');
      } else {
        await api.createRound({ name, date, startTime, room, status });
        showToast('success', '새 회차를 생성했습니다.');
      }
      setShowModal(false);
      await onRefresh();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '회차 저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const openAssignModal = (r: Round) => {
    setAssigningRound(r);
    setSelectedInts([...r.interviewerIds]);
  };

  const handleSaveInterviewers = async () => {
    if (!assigningRound) return;
    setBusy(true);
    try {
      await api.setRoundInterviewers(assigningRound.id, selectedInts);
      setAssigningRound(null);
      await onRefresh();
      showToast(
        'success',
        '회차 면접위원이 저장되었으며 해당 회차 모든 면접 건에 일괄 배정되었습니다.'
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '면접위원 배정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const teacherMap = new Map(teachers.map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">회차 및 면접위원 관리</h1>
          <p className="text-sm text-slate-600">
            회차에 면접위원을 지정하면 해당 회차의 모든 면접 건에 자동으로 일괄 배정됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#1E3A5F] hover:bg-[#162d4a] text-white text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          <span>회차 추가</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rounds.map((r) => (
          <section
            key={r.id}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#1E3A5F]" />
                  <h2 className="text-lg font-bold text-slate-900">{r.name}</h2>
                  <span
                    className={`px-2 py-0.5 text-xs font-semibold rounded border ${
                      r.status === '진행 중'
                        ? 'bg-teal-50 text-[#0F766E] border-teal-200'
                        : r.status === '종료'
                          ? 'bg-slate-100 text-slate-600 border-slate-200'
                          : 'bg-blue-50 text-[#1E3A5F] border-blue-200'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  {formatKoreanDateTime(r.date, r.startTime)} · 장소: {r.room}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openEdit(r)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                수정
              </button>
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">
                  배정된 면접위원 ({r.interviewerIds.length}명)
                </span>
                <button
                  type="button"
                  onClick={() => openAssignModal(r)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0F766E] hover:bg-[#0d625b] text-white text-xs font-semibold"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>면접위원 지정</span>
                </button>
              </div>
              {r.interviewerIds.length === 0 ? (
                <p className="text-xs text-slate-400">지정된 면접위원이 없습니다.</p>
              ) : (
                <p className="text-sm text-slate-800">
                  {r.interviewerIds.map((id) => teacherMap.get(id)?.name ?? '교사').join(' · ')}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>

      {/* 회차 생성/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveRound}
            className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h2 className="text-lg font-bold text-slate-900">
              {editing ? '회차 수정' : '새 회차 생성'}
            </h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">회차명 *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 2차 모의면접"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">날짜 *</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">시작 시각 *</label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">고사실 *</label>
                <input
                  type="text"
                  required
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">상태</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as RoundStatus)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="준비">준비</option>
                  <option value="진행 중">진행 중</option>
                  <option value="종료">종료</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 rounded-lg bg-[#1E3A5F] text-white text-sm font-semibold disabled:opacity-50"
              >
                {busy ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 면접위원 다중 선택 모달 */}
      {assigningRound && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">
              {assigningRound.name} 면접위원 지정
            </h2>
            <p className="text-xs text-slate-600">
              저장 시 이 회차의 모든 면접 건에 선택한 면접위원이 일괄 배정됩니다. (개별 면접 건에서 추가/제외 가능)
            </p>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {eligibleInterviewers.map((t) => {
                const checked = selectedInts.includes(t.id);
                return (
                  <label
                    key={t.id}
                    className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedInts((prev) =>
                          checked ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                        )
                      }
                      className="w-4 h-4 accent-[#0F766E]"
                    />
                    <div className="text-sm">
                      <span className="font-semibold text-slate-900">{t.name}</span>
                      <span className="text-slate-500 ml-1.5 text-xs">{t.dept}</span>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssigningRound(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium"
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSaveInterviewers()}
                className="px-5 py-2 rounded-lg bg-[#0F766E] text-white text-sm font-semibold disabled:opacity-50"
              >
                {busy ? '배정 중...' : `일괄 배정 저장 (${selectedInts.length}명)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
