import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function IdleLockModal() {
  const { isIdleLocked, isMock, user, unlockSession, logout } = useApp();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isIdleLocked || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMock && !password) {
      setError('비밀번호를 입력하세요.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await unlockSession(password);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '비밀번호 확인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-lock-title"
    >
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#1E3A5F] text-white flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 id="idle-lock-title" className="text-lg font-bold text-slate-900">
              화면이 자동 잠금되었습니다
            </h2>
            <p className="text-sm text-slate-600">
              15분간 활동이 없어 학생 정보 보호를 위해 잠금 처리되었습니다.
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
          작성 중이던 평가 내용은 잠금 전 자동 임시저장되었습니다. 계속하려면{' '}
          <span className="font-semibold">{user.name}</span>님의 비밀번호를 다시 입력하세요.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isMock && (
            <div>
              <label htmlFor="unlock-password" className="block text-sm font-medium text-slate-700 mb-1">
                비밀번호
              </label>
              <input
                id="unlock-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-base"
                placeholder="비밀번호 입력"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            {!isMock && (
              <button
                type="button"
                onClick={() => void logout()}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                로그아웃
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-[#1E3A5F] hover:bg-[#162d4a] rounded-lg disabled:opacity-50"
            >
              {submitting ? '확인 중...' : isMock ? '미리보기 잠금 해제' : '잠금 해제'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
