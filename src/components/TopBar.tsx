import { LogOut, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { UserRole } from '../types';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: '운영자',
  interviewer: '면접관',
  homeroom: '담임교사',
};

export function TopBar() {
  const { isMock, user, activeRole, setActiveRole, settings, logout, switchMockRole } = useApp();

  return (
    <div className="no-print sticky top-0 z-30 bg-white border-b border-slate-200">
      {isMock && (
        <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-amber-950 text-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-medium">
            <ShieldAlert className="w-4 h-4 text-amber-800 shrink-0" />
            <span>미리보기 모드 — 가짜 데이터이며 저장되지 않습니다</span>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="mock-role-select" className="text-xs font-semibold text-amber-900 whitespace-nowrap">
              역할 전환
            </label>
            <select
              id="mock-role-select"
              value={activeRole}
              onChange={(e) => switchMockRole(e.target.value as UserRole)}
              className="rounded-lg border border-amber-400 bg-white px-3 py-1 text-sm font-medium text-slate-900"
            >
              <option value="admin">운영자</option>
              <option value="interviewer">면접관</option>
              <option value="homeroom">담임교사</option>
            </select>
          </div>
        </div>
      )}

      <header className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="min-w-0 flex items-center gap-4">
          <span className="text-lg font-bold tracking-tight text-[#1E3A5F] whitespace-nowrap shrink-0 truncate">
            {settings.eventName}
          </span>
        </div>

        {user && (
          <div className="flex items-center gap-4 shrink-0">
            {!isMock && user.roles.length > 1 && (
              <div
                className="hidden sm:flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
                role="tablist"
                aria-label="역할 전환"
              >
                {user.roles.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="tab"
                    aria-selected={activeRole === r}
                    onClick={() => setActiveRole(r)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      activeRole === r
                        ? 'bg-white text-[#1E3A5F] shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 text-sm text-slate-700 whitespace-nowrap">
              <span className="font-semibold text-slate-900">{user.name}</span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="text-[#0F766E] font-medium">{ROLE_LABELS[activeRole]}</span>
            </div>

            {!isMock && (
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-4 h-4" />
                <span>로그아웃</span>
              </button>
            )}
          </div>
        )}
      </header>

      {user && !isMock && user.roles.length > 1 && (
        <div className="sm:hidden border-t border-slate-100 px-4 py-2 flex items-center gap-1 bg-slate-50">
          {user.roles.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setActiveRole(r)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeRole === r
                  ? 'bg-[#1E3A5F] text-white'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
