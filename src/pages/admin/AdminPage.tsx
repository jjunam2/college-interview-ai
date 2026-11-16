import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  FileText,
  GraduationCap,
  LayoutDashboard,
  PlaySquare,
  Shield,
  UserCog,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { WorkspaceSnapshot } from '../../types';
import { AdminDashboardTab } from './AdminDashboardTab';
import { AdminLiveBoardTab } from './AdminLiveBoardTab';
import { AdminReportsTab } from './AdminReportsTab';
import { AdminResultsTab } from './AdminResultsTab';
import { AdminRoundsTab } from './AdminRoundsTab';
import { AdminSecurityTab } from './AdminSecurityTab';
import { AdminStudentsTab } from './AdminStudentsTab';
import { AdminTeachersTab } from './AdminTeachersTab';
import { AdminUniversitiesTab } from './AdminUniversitiesTab';

type AdminTabId =
  | 'dashboard'
  | 'live'
  | 'teachers'
  | 'rounds'
  | 'students'
  | 'universities'
  | 'results'
  | 'reports'
  | 'security';

const NAV_ITEMS: Array<{ id: AdminTabId; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'live', label: '진행 보드', icon: PlaySquare },
  { id: 'teachers', label: '교사 관리', icon: UserCog },
  { id: 'rounds', label: '회차 관리', icon: CalendarDays },
  { id: 'students', label: '학생·면접 건', icon: Users },
  { id: 'universities', label: '대학·평가표', icon: GraduationCap },
  { id: 'results', label: '결과 취합', icon: BarChart3 },
  { id: 'reports', label: '결과지 관리', icon: FileText },
  { id: 'security', label: '보안·데이터', icon: Shield },
];

export function AdminPage() {
  const { api, activeRole, setSettings, showToast } = useApp();
  const [tab, setTab] = useState<AdminTabId>('dashboard');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<WorkspaceSnapshot | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string>(new Date().toISOString());
  const serverTimeRef = useRef<string>(new Date().toISOString());

  const loadWorkspace = useCallback(async () => {
    try {
      const ws = await api.getAdminWorkspace();
      setData(ws);
      setSettings(ws.settings);
      serverTimeRef.current = ws.serverTime;
      setLastSyncAt(new Date().toISOString());
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '운영 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [api, setSettings, showToast]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  // 5초 실시간 폴링 (visibilityState 준수)
  useEffect(() => {
    let timerId: number | null = null;

    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await api.getChanges(serverTimeRef.current, activeRole);
        serverTimeRef.current = res.serverTime;
        setLastSyncAt(new Date().toISOString());
        if (res.settings) setSettings(res.settings);

        setData((prev) => {
          if (!prev) return prev;
          let nextApps = prev.applications;
          if (res.applications && res.applications.length > 0) {
            const map = new Map(prev.applications.map((a) => [a.id, a]));
            res.applications.forEach((a) => map.set(a.id, a));
            nextApps = Array.from(map.values()).sort((a, b) => a.sequenceNo - b.sequenceNo);
          }
          let nextEvals = prev.evaluations;
          if (res.evaluations && res.evaluations.length > 0) {
            const map = new Map(prev.evaluations.map((e) => [e.id, e]));
            res.evaluations.forEach((e) => map.set(e.id, e));
            nextEvals = Array.from(map.values());
          }
          return {
            ...prev,
            settings: res.settings ?? prev.settings,
            rounds: res.rounds ?? prev.rounds,
            applications: nextApps,
            evaluations: nextEvals,
            reports: res.reports ?? prev.reports,
          };
        });
      } catch {
        // 조용히 재시도
      }
    };

    const startPolling = () => {
      if (timerId !== null) window.clearInterval(timerId);
      timerId = window.setInterval(() => void poll(), 5000);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void poll();
        startPolling();
      } else if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timerId !== null) window.clearInterval(timerId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [api, activeRole, setSettings]);

  if (loading || !data) {
    return (
      <div className="max-w-[1440px] mx-auto p-6 space-y-4">
        <div className="h-28 bg-white rounded-xl border border-slate-200 animate-pulse" />
        <div className="h-96 bg-white rounded-xl border border-slate-200 animate-pulse" />
      </div>
    );
  }

  const pendingCount = data.teachers.filter((t) => t.status === 'pending').length;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row gap-6">
      {/* 사이드바 내비게이션 */}
      <aside className="no-print lg:w-60 shrink-0">
        <nav
          aria-label="운영자 메뉴"
          className="bg-white rounded-xl border border-slate-200 p-2 flex lg:flex-col gap-1 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-[#1E3A5F] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="inline-flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.id === 'teachers' && pendingCount > 0 && (
                  <span
                    className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      active ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 min-w-0">
        {tab === 'dashboard' && (
          <AdminDashboardTab
            data={data}
            lastSyncAt={lastSyncAt}
            onNavigateTab={(t) => setTab(t as AdminTabId)}
          />
        )}
        {tab === 'live' && (
          <AdminLiveBoardTab data={data} lastSyncAt={lastSyncAt} onRefresh={loadWorkspace} />
        )}
        {tab === 'teachers' && (
          <AdminTeachersTab teachers={data.teachers} onRefresh={loadWorkspace} />
        )}
        {tab === 'rounds' && (
          <AdminRoundsTab
            rounds={data.rounds}
            teachers={data.teachers}
            onRefresh={loadWorkspace}
          />
        )}
        {tab === 'students' && <AdminStudentsTab data={data} onRefresh={loadWorkspace} />}
        {tab === 'universities' && <AdminUniversitiesTab data={data} onRefresh={loadWorkspace} />}
        {tab === 'results' && <AdminResultsTab data={data} lastSyncAt={lastSyncAt} />}
        {tab === 'reports' && <AdminReportsTab data={data} onRefresh={loadWorkspace} />}
        {tab === 'security' && <AdminSecurityTab data={data} onRefresh={loadWorkspace} />}
      </main>
    </div>
  );
}
