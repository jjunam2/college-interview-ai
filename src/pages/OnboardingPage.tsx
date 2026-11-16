import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PLEDGE_TEXT } from '../types';

export function OnboardingPage() {
  const { api, user, setUser, showToast } = useApp();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreePledge, setAgreePledge] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const needsPasswordChange = user.mustChangePassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (needsPasswordChange) {
      if (newPassword.length < 8) {
        setError('새 비밀번호는 8자 이상이어야 합니다.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('새 비밀번호 확인이 일치하지 않습니다.');
        return;
      }
    }

    if (!agreePledge) {
      setError('개인정보 보호 및 비밀유지 서약에 동의해 주세요.');
      return;
    }

    setBusy(true);
    try {
      const res = await api.completeOnboarding({
        newPassword: needsPasswordChange ? newPassword : undefined,
        agreePledge: true,
      });
      setUser(res.user);
      showToast('success', '초기 설정이 완료되었습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '설정 저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#1E3A5F] text-white flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">첫 로그인 보안 설정</h1>
            <p className="text-sm text-slate-600 mt-0.5">
              {user.name}님, 시스템을 이용하기 전에 아래 절차를 완료해 주세요.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {needsPasswordChange && (
            <div className="space-y-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-sm font-semibold text-amber-950">
                임시 비밀번호로 로그인하셨습니다. 본인의 새 비밀번호로 변경해야 합니다.
              </p>
              <div>
                <label htmlFor="onb-pw" className="block text-sm font-medium text-slate-700 mb-1">
                  새 비밀번호 (8자 이상)
                </label>
                <input
                  id="onb-pw"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base"
                />
              </div>
              <div>
                <label htmlFor="onb-pw2" className="block text-sm font-medium text-slate-700 mb-1">
                  새 비밀번호 확인
                </label>
                <input
                  id="onb-pw2"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base"
                />
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-900">개인정보 보호 및 비밀유지 서약</h2>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-800 leading-relaxed">
              {PLEDGE_TEXT}
            </div>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={agreePledge}
                onChange={(e) => setAgreePledge(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-[#0F766E] shrink-0"
              />
              <span className="text-sm font-medium text-slate-900">
                위 개인정보 보호 및 비밀유지 서약 내용을 확인하였으며 이에 동의합니다.
              </span>
            </label>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-lg bg-[#1E3A5F] hover:bg-[#162d4a] text-white font-semibold text-base disabled:opacity-50 transition-colors"
          >
            {busy ? '저장 중...' : '동의하고 시작하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
