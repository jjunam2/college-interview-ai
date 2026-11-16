import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function AuthPage() {
  const { api, settings, refreshMe, showToast } = useApp();
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // 로그인 상태
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  // 자가 등록 상태
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dept, setDept] = useState('');
  const [homeroomClass, setHomeroomClass] = useState('');
  const [requestedRoles, setRequestedRoles] = useState<Array<'interviewer' | 'homeroom'>>([
    'interviewer',
  ]);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [entryCode, setEntryCode] = useState('');
  const [regError, setRegError] = useState('');
  const [regMessage, setRegMessage] = useState('');
  const [regBusy, setRegBusy] = useState(false);

  const toggleRole = (role: 'interviewer' | 'homeroom') => {
    setRequestedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginBusy(true);
    try {
      await api.login(loginEmail.trim(), loginPassword);
      await refreshMe();
      showToast('success', '로그인되었습니다.');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegMessage('');

    if (requestedRoles.length === 0) {
      setRegError('희망 역할을 하나 이상 선택하세요.');
      return;
    }
    if (password.length < 8) {
      setRegError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (password !== passwordConfirm) {
      setRegError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setRegBusy(true);
    try {
      const res = await api.register({
        name: name.trim(),
        email: email.trim(),
        dept: dept.trim(),
        homeroomClass: homeroomClass.trim(),
        requestedRoles,
        password,
        entryCode,
      });
      setRegMessage(res.message);
      showToast('success', res.message);
      if (res.status === 'active') {
        setTab('login');
        setLoginEmail(email.trim());
      }
    } catch (err) {
      setRegError(err instanceof Error ? err.message : '가입 신청에 실패했습니다.');
    } finally {
      setRegBusy(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#1E3A5F] text-white">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{settings.eventName}</h1>
          <p className="text-sm text-slate-600">
            {settings.schoolName} 교직원 전용 모의면접 평가 시스템
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setLoginError('');
              }}
              className={`py-3 text-sm font-semibold transition-colors ${
                tab === 'login'
                  ? 'bg-white text-[#1E3A5F] border-b-2 border-[#1E3A5F]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              교사 로그인
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setRegError('');
                setRegMessage('');
              }}
              className={`py-3 text-sm font-semibold transition-colors ${
                tab === 'register'
                  ? 'bg-white text-[#1E3A5F] border-b-2 border-[#1E3A5F]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              교사 가입 신청
            </button>
          </div>

          <div className="p-6">
            {tab === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1">
                    이메일 (로그인 ID)
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="teacher@school.kr"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-base"
                  />
                </div>
                <div>
                  <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1">
                    비밀번호
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="비밀번호 입력"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-base"
                  />
                </div>

                {loginError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loginBusy}
                  className="w-full py-3 rounded-lg bg-[#1E3A5F] hover:bg-[#162d4a] text-white font-semibold text-base disabled:opacity-50 transition-colors"
                >
                  {loginBusy ? '로그인 중...' : '로그인'}
                </button>
                <p className="text-xs text-slate-500 text-center">
                  비밀번호를 잊으신 경우 운영교사에게 임시 비밀번호 재발급을 요청해 주세요.
                </p>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                {regMessage && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 text-sm text-emerald-900 font-medium">
                    {regMessage}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-name" className="block text-sm font-medium text-slate-700 mb-1">
                      성명 *
                    </label>
                    <input
                      id="reg-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-dept" className="block text-sm font-medium text-slate-700 mb-1">
                      소속 (교과/부서)
                    </label>
                    <input
                      id="reg-dept"
                      type="text"
                      value={dept}
                      onChange={(e) => setDept(e.target.value)}
                      placeholder="예: 진로진학부"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700 mb-1">
                    이메일 (로그인 ID) *
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teacher@school.kr"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-homeroom" className="block text-sm font-medium text-slate-700 mb-1">
                      담당 학급 (선택)
                    </label>
                    <input
                      id="reg-homeroom"
                      type="text"
                      value={homeroomClass}
                      onChange={(e) => setHomeroomClass(e.target.value)}
                      placeholder="예: 3-2"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-code" className="block text-sm font-medium text-slate-700 mb-1">
                      행사 입장 코드 *
                    </label>
                    <input
                      id="reg-code"
                      type="password"
                      required
                      value={entryCode}
                      onChange={(e) => setEntryCode(e.target.value)}
                      placeholder="안내받은 코드 입력"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-sm font-medium text-slate-700 mb-1.5">
                    희망 역할 (복수 선택 가능) *
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={requestedRoles.includes('interviewer')}
                        onChange={() => toggleRole('interviewer')}
                        className="w-4 h-4 accent-[#1E3A5F]"
                      />
                      <span className="text-sm font-medium text-slate-800">면접관</span>
                    </label>
                    <label className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={requestedRoles.includes('homeroom')}
                        onChange={() => toggleRole('homeroom')}
                        className="w-4 h-4 accent-[#1E3A5F]"
                      />
                      <span className="text-sm font-medium text-slate-800">담임교사</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-pw" className="block text-sm font-medium text-slate-700 mb-1">
                      비밀번호 (8자 이상) *
                    </label>
                    <input
                      id="reg-pw"
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-pw2" className="block text-sm font-medium text-slate-700 mb-1">
                      비밀번호 확인 *
                    </label>
                    <input
                      id="reg-pw2"
                      type="password"
                      required
                      minLength={8}
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
                    />
                  </div>
                </div>

                {regError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    {regError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={regBusy}
                  className="w-full py-3 rounded-lg bg-[#0F766E] hover:bg-[#0d625b] text-white font-semibold text-base disabled:opacity-50 transition-colors"
                >
                  {regBusy ? '신청 처리 중...' : '가입 신청하기'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* 개인정보 처리 안내 */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 text-xs text-slate-600 space-y-1.5 leading-relaxed">
          <h2 className="font-bold text-slate-800">개인정보 처리 안내</h2>
          <p>
            <span className="font-semibold text-slate-700">수집 항목:</span> 학번, 이름, 반, 지원 대학,
            모의면접 평가 내용
          </p>
          <p>
            <span className="font-semibold text-slate-700">이용 목적:</span> 교내 모의면접 운영 및
            학생별 결과지 제공
          </p>
          <p>
            <span className="font-semibold text-slate-700">보관 기한:</span> {settings.retentionUntil}까지
            보관
          </p>
          <p>
            <span className="font-semibold text-slate-700">파기 방법:</span> 보관 기한 경과 후 시스템 내
            학생·평가 데이터 일괄 파기
          </p>
        </section>
      </div>
    </div>
  );
}
