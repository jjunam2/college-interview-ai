import React, { useCallback, useEffect, useState } from 'react';
import { Database, ShieldAlert, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { AuditLog, Settings, WorkspaceSnapshot } from '../../types';
import { formatKoreanDateTime } from '../../utils/format';

interface Props {
  data: WorkspaceSnapshot;
  onRefresh: () => Promise<void>;
}

export function AdminSecurityTab({ data, onRefresh }: Props) {
  const { api, isMock, setSettings: setCtxSettings, showToast } = useApp();
  const [formSettings, setFormSettings] = useState<Settings>(data.settings);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [purgeConfirmText, setPurgeConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFormSettings(data.settings);
  }, [data.settings]);

  const loadLogs = useCallback(async () => {
    try {
      const res = await api.getAuditLogs({
        action: actionFilter || undefined,
        actorUserId: actorFilter || undefined,
        date: dateFilter || undefined,
      });
      setLogs(res.logs);
    } catch {
      // ignore
    }
  }, [api, actionFilter, actorFilter, dateFilter]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.updateSettings(formSettings);
      setCtxSettings(res.settings);
      await onRefresh();
      showToast('success', '운영 및 보안 설정을 저장했습니다.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '설정 저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleSeedDemo = async () => {
    setBusy(true);
    try {
      await api.seedDemoData();
      await onRefresh();
      showToast('success', '데모 데이터(is_demo=1)를 생성했습니다.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '데모 데이터 생성에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleClearDemo = async () => {
    setBusy(true);
    try {
      await api.clearDemoData();
      await onRefresh();
      showToast('success', '데모 데이터(is_demo=1)를 삭제했습니다.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '데모 데이터 삭제에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handlePurge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (purgeConfirmText !== '파기') {
      showToast('error', '확인란에 "파기"를 정확히 입력하세요.');
      return;
    }
    setBusy(true);
    try {
      await api.purgeAllData(purgeConfirmText);
      setPurgeConfirmText('');
      await onRefresh();
      await loadLogs();
      showToast('success', '학생·면접·평가·결과지 데이터를 모두 파기했습니다.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '데이터 파기에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">보안·설정·감사 로그·데이터 관리</h1>
        <p className="text-sm text-slate-600">
          행사 설정, 이름 마스킹, 감사 로그 조회, 데모 데이터 관리 및 행사 후 데이터 파기를 수행합니다.
        </p>
      </div>

      {/* 행사 및 개인정보 보호 설정 */}
      <form
        onSubmit={handleSaveSettings}
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4"
      >
        <h2 className="text-base font-bold text-slate-900">행사 및 개인정보 설정</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">행사명</label>
            <input
              type="text"
              required
              value={formSettings.eventName}
              onChange={(e) => setFormSettings((s) => ({ ...s, eventName: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">학교명</label>
            <input
              type="text"
              required
              value={formSettings.schoolName}
              onChange={(e) => setFormSettings((s) => ({ ...s, schoolName: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              개인정보 보관 기한
            </label>
            <input
              type="date"
              required
              value={formSettings.retentionUntil}
              onChange={(e) => setFormSettings((s) => ({ ...s, retentionUntil: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-6 pt-1 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formSettings.maskStudentNames}
              onChange={(e) =>
                setFormSettings((s) => ({ ...s, maskStudentNames: e.target.checked }))
              }
              className="accent-[#1E3A5F] w-4 h-4"
            />
            <span>목록 화면에서 학생 이름 마스킹 (예: 김*수)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formSettings.showInterviewerNamesToHomeroom}
              onChange={(e) =>
                setFormSettings((s) => ({
                  ...s,
                  showInterviewerNamesToHomeroom: e.target.checked,
                }))
              }
              className="accent-[#1E3A5F] w-4 h-4"
            />
            <span>담임교사 조회 화면에 면접관 실명 공개 (체크 해제 시 면접관 A/B 표기)</span>
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2 rounded-lg bg-[#1E3A5F] hover:bg-[#162d4a] text-white text-sm font-semibold"
          >
            설정 저장
          </button>
        </div>
      </form>

      {/* 데모 데이터 관리 */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
            <Database className="w-4 h-4 text-[#0F766E]" />
            <span>데모 데이터 관리 (is_demo = 1)</span>
          </h2>
          <p className="text-xs text-slate-600">
            사전 점검용 가상 학생·면접 데이터를 생성하거나 데모 데이터만 안전하게 삭제합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy || isMock}
            onClick={() => void handleSeedDemo()}
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-45"
          >
            데모 데이터 생성
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleClearDemo()}
            className="px-4 py-2 rounded-lg border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            데모 데이터 삭제
          </button>
        </div>
      </section>

      {/* 감사 로그 */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">감사 로그 조회</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              aria-label="행동 필터"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white"
            >
              <option value="">전체 행동</option>
              <option value="LOGIN">로그인 (LOGIN)</option>
              <option value="LOGIN_FAIL">로그인 실패 (LOGIN_FAIL)</option>
              <option value="CREATE_USER">교사 생성 (CREATE_USER)</option>
              <option value="APPROVE_USER">교사 승인 (APPROVE_USER)</option>
              <option value="RESET_PASSWORD">비밀번호 재발급 (RESET_PASSWORD)</option>
              <option value="OPEN_NOTION">노션 열람 (OPEN_NOTION)</option>
              <option value="EXPORT_CSV">CSV 내보내기 (EXPORT_CSV)</option>
              <option value="CONFIRM_REPORT">결과지 확정 (CONFIRM_REPORT)</option>
              <option value="PURGE">데이터 파기 (PURGE)</option>
            </select>
            <select
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              aria-label="교사 필터"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white"
            >
              <option value="">전체 교사</option>
              {data.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              aria-label="날짜 필터"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <th className="py-2.5 px-3">시각</th>
                <th className="py-2.5 px-3">교사</th>
                <th className="py-2.5 px-3">행동</th>
                <th className="py-2.5 px-3">상세 내용</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    조건에 맞는 감사 로그가 없습니다.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {formatKoreanDateTime(l.at)}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-900">{l.actorName}</td>
                    <td className="py-2 px-3 font-mono text-[#1E3A5F]">{l.action}</td>
                    <td className="py-2 px-3 text-slate-700">{l.detail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 전체 데이터 파기 */}
      <form
        onSubmit={handlePurge}
        className="bg-red-50 rounded-xl border border-red-200 p-5 space-y-3"
      >
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-base font-bold text-red-900">전체 학생·평가 데이터 파기</h2>
            <p className="text-xs text-red-800 leading-relaxed">
              행사 종료 및 보관 기한 만료 후 사용합니다. 파기 전 [결과 취합] 화면에서 반드시 CSV 백업을
              내려받으세요. 확인란에 <strong>파기</strong>를 입력하면 모든 학생·면접 건·배정·질문·평가·결과지
              데이터가 영구 삭제되며 파기 기록이 감사 로그에 남습니다.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <input
            type="text"
            value={purgeConfirmText}
            onChange={(e) => setPurgeConfirmText(e.target.value)}
            placeholder='확인 입력: "파기"'
            className="rounded-lg border border-red-300 bg-white px-3.5 py-2 text-sm w-56"
          />
          <button
            type="submit"
            disabled={busy || purgeConfirmText !== '파기'}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-sm font-semibold disabled:opacity-45"
          >
            <Trash2 className="w-4 h-4" />
            <span>전체 데이터 영구 파기</span>
          </button>
        </div>
      </form>
    </div>
  );
}
