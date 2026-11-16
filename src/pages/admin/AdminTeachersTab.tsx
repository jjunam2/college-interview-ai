import React, { useState } from 'react';
import { Check, Copy, KeyRound, Plus, UserCheck, UserX } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { User, UserRole } from '../../types';

interface Props {
  teachers: User[];
  onRefresh: () => Promise<void>;
}

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: 'admin', label: '운영자' },
  { value: 'interviewer', label: '면접관' },
  { value: 'homeroom', label: '담임교사' },
];

export function AdminTeachersTab({ teachers, onRefresh }: Props) {
  const { api, user: me, showToast } = useApp();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dept, setDept] = useState('');
  const [homeroomClass, setHomeroomClass] = useState('');
  const [roles, setRoles] = useState<UserRole[]>(['interviewer']);
  const [busy, setBusy] = useState(false);

  // 1회만 보여 주는 임시 비밀번호 모달
  const [issuedCreds, setIssuedCreds] = useState<{
    title: string;
    name: string;
    email: string;
    tempPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // 승인 대기 교사별 지정 역할 상태
  const [pendingRoleEdits, setPendingRoleEdits] = useState<Record<string, UserRole[]>>({});

  const pendingList = teachers.filter((t) => t.status === 'pending');
  const activeOrDisabledList = teachers.filter((t) => t.status !== 'pending');

  const toggleCreateRole = (r: UserRole) => {
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (roles.length === 0) {
      showToast('warning', '역할을 하나 이상 선택하세요.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.createTeacher({
        name: name.trim(),
        email: email.trim(),
        dept: dept.trim(),
        homeroomClass: homeroomClass.trim(),
        roles,
      });
      setShowCreate(false);
      setIssuedCreds({
        title: '교사 계정 생성 완료',
        name: res.user.name,
        email: res.user.email,
        tempPassword: res.tempPassword,
      });
      setCopied(false);
      setName('');
      setEmail('');
      setDept('');
      setHomeroomClass('');
      await onRefresh();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '계정 생성에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (t: User, approved: boolean) => {
    const chosenRoles =
      pendingRoleEdits[t.id] ?? (t.requestedRoles.length > 0 ? t.requestedRoles : ['interviewer']);
    try {
      await api.approveTeacher(t.id, approved, chosenRoles);
      await onRefresh();
      showToast('success', `${t.name} 계정을 ${approved ? '승인' : '거절'}했습니다.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '승인 처리에 실패했습니다.');
    }
  };

  const handleToggleRole = async (t: User, role: UserRole) => {
    const next = t.roles.includes(role) ? t.roles.filter((r) => r !== role) : [...t.roles, role];
    if (next.length === 0) {
      showToast('warning', '최소 1개 이상의 역할이 필요합니다.');
      return;
    }
    try {
      await api.updateTeacher(t.id, { roles: next });
      await onRefresh();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '역할 변경에 실패했습니다.');
    }
  };

  const handleToggleStatus = async (t: User) => {
    const nextStatus = t.status === 'active' ? 'disabled' : 'active';
    try {
      await api.updateTeacher(t.id, { status: nextStatus });
      await onRefresh();
      showToast('info', `${t.name} 계정이 ${nextStatus === 'active' ? '활성화' : '비활성화'}되었습니다.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '상태 변경에 실패했습니다.');
    }
  };

  const handleResetPassword = async (t: User) => {
    try {
      const res = await api.resetTeacherPassword(t.id);
      setIssuedCreds({
        title: '임시 비밀번호 재발급 완료',
        name: t.name,
        email: t.email,
        tempPassword: res.tempPassword,
      });
      setCopied(false);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '비밀번호 재발급에 실패했습니다.');
    }
  };

  const copyTempPw = async () => {
    if (!issuedCreds) return;
    await navigator.clipboard.writeText(issuedCreds.tempPassword);
    setCopied(true);
    showToast('success', '임시 비밀번호가 복사되었습니다.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">교사 계정 및 승인 관리</h1>
          <p className="text-sm text-slate-600">
            자가 등록 교사 승인, 교사 계정 직접 생성, 역할 부여 및 임시 비밀번호 재발급을 관리합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#1E3A5F] hover:bg-[#162d4a] text-white text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          <span>교사 계정 직접 생성</span>
        </button>
      </div>

      {/* 승인 대기 목록 */}
      {pendingList.length > 0 && (
        <section className="bg-amber-50 rounded-xl border border-amber-200 p-5 space-y-4">
          <h2 className="text-base font-bold text-amber-950">
            가입 승인 대기 ({pendingList.length}명)
          </h2>
          <div className="space-y-3">
            {pendingList.map((t) => {
              const selectedRoles =
                pendingRoleEdits[t.id] ??
                (t.requestedRoles.length > 0 ? t.requestedRoles : ['interviewer']);
              return (
                <div
                  key={t.id}
                  className="bg-white rounded-xl border border-amber-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <p className="font-bold text-slate-900">
                      {t.name}{' '}
                      <span className="text-sm font-normal text-slate-600">
                        ({t.email}) · {t.dept || '소속 미입력'}{' '}
                        {t.homeroomClass ? `· ${t.homeroomClass} 담임` : ''}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-500">부여할 역할:</span>
                      {ROLE_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedRoles.includes(opt.value)}
                            onChange={() => {
                              const next = selectedRoles.includes(opt.value)
                                ? selectedRoles.filter((r) => r !== opt.value)
                                : [...selectedRoles, opt.value];
                              setPendingRoleEdits((p) => ({ ...p, [t.id]: next }));
                            }}
                            className="accent-[#1E3A5F]"
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleApprove(t, false)}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold"
                    >
                      <UserX className="w-4 h-4" />
                      <span>거절</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleApprove(t, true)}
                      className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-[#0F766E] hover:bg-[#0d625b] text-white text-xs font-semibold"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>승인</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 등록 교사 목록 */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">이름 / 이메일</th>
                <th className="py-3 px-4">소속 / 학급</th>
                <th className="py-3 px-4">역할 (클릭해 변경)</th>
                <th className="py-3 px-4">상태</th>
                <th className="py-3 px-4 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {activeOrDisabledList.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <p className="font-bold text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.email}</p>
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    {t.dept || '-'} {t.homeroomClass ? `(${t.homeroomClass})` : ''}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1.5">
                      {ROLE_OPTIONS.map((opt) => {
                        const active = t.roles.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => void handleToggleRole(t, opt.value)}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                              active
                                ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-semibold rounded border ${
                        t.status === 'active'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {t.status === 'active' ? '활성' : '비활성'}
                    </span>
                    {t.mustChangePassword && (
                      <span className="ml-1.5 text-xs text-amber-700 font-medium">· 첫 변경 대기</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleResetPassword(t)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>비밀번호 재발급</span>
                      </button>
                      {t.id !== me?.id && (
                        <button
                          type="button"
                          onClick={() => void handleToggleStatus(t)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          {t.status === 'active' ? '비활성화' : '활성화'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 직접 생성 모달 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h2 className="text-lg font-bold text-slate-900">교사 계정 직접 생성</h2>
            <p className="text-xs text-slate-600">
              즉시 활성화된 계정과 12자리 임시 비밀번호가 발급됩니다. 첫 로그인 시 비밀번호 변경이 강제됩니다.
            </p>
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
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">이메일 *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">소속</label>
                <input
                  type="text"
                  value={dept}
                  onChange={(e) => setDept(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">담당 학급</label>
                <input
                  type="text"
                  value={homeroomClass}
                  onChange={(e) => setHomeroomClass(e.target.value)}
                  placeholder="예: 3-1"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1.5">역할 *</span>
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={roles.includes(opt.value)}
                      onChange={() => toggleCreateRole(opt.value)}
                      className="accent-[#1E3A5F]"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 rounded-lg bg-[#1E3A5F] text-white text-sm font-semibold disabled:opacity-50"
              >
                {busy ? '생성 중...' : '생성 및 임시 비밀번호 발급'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 1회성 임시 비밀번호 안내 모달 */}
      {issuedCreds && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">{issuedCreds.title}</h2>
            <p className="text-sm text-red-700 font-semibold bg-red-50 border border-red-200 rounded-lg p-3">
              이 비밀번호는 지금 한 번만 표시되며 닫으면 다시 볼 수 없습니다. 반드시 복사해 교사에게 전달하세요.
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-sm">
              <p>
                <span className="text-slate-500">교사:</span> <strong>{issuedCreds.name}</strong> (
                {issuedCreds.email})
              </p>
              <div className="flex items-center justify-between gap-2 pt-1">
                <code className="font-mono text-lg font-bold text-[#1E3A5F] select-all">
                  {issuedCreds.tempPassword}
                </code>
                <button
                  type="button"
                  onClick={() => void copyTempPw()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0F766E] text-white text-xs font-semibold"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? '복사됨' : '복사'}</span>
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setIssuedCreds(null)}
                className="px-5 py-2 rounded-lg bg-[#1E3A5F] text-white text-sm font-semibold"
              >
                확인 후 닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
