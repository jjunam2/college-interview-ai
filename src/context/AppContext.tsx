import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ApiClient } from '../api/client';
import { MockApiClient } from '../api/mockApi';
import { RealApiClient } from '../api/realApi';
import type { Settings, User, UserRole } from '../types';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

interface AppContextValue {
  api: ApiClient;
  isMock: boolean;
  loading: boolean;
  user: User | null;
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  isIdleLocked: boolean;
  unlockSession: (password: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
  switchMockRole: (role: UserRole) => void;
  toasts: ToastItem[];
  showToast: (type: ToastItem['type'], message: string) => void;
  dismissToast: (id: string) => void;
}

const DEFAULT_SETTINGS: Settings = {
  eventName: '덕신고 2027 대입 모의면접',
  schoolName: '덕신고등학교',
  maskStudentNames: false,
  showInterviewerNamesToHomeroom: false,
  retentionUntil: '2026-12-31',
  resultsLocked: false,
};

const IDLE_LOCK_MS = 15 * 60 * 1000; // 15분

const AppContext = createContext<AppContextValue | null>(null);

function pickDefaultRole(user: User | null): UserRole {
  if (!user || user.roles.length === 0) return 'interviewer';
  if (user.roles.includes('admin')) return 'admin';
  if (user.roles.includes('interviewer')) return 'interviewer';
  return user.roles[0];
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const realClientRef = useRef<RealApiClient | null>(null);
  const mockClientRef = useRef<MockApiClient | null>(null);
  if (!realClientRef.current) realClientRef.current = new RealApiClient();
  if (!mockClientRef.current) mockClientRef.current = new MockApiClient();

  const [isMock, setIsMock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>('admin');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isIdleLocked, setIsIdleLocked] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const api: ApiClient = isMock ? mockClientRef.current : realClientRef.current;

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastItem['type'], message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  useEffect(() => {
    let active = true;
    async function boot() {
      const real = realClientRef.current!;
      try {
        const health = await real.health();
        if (!health.ok || health.db !== true || health.secrets !== true) {
          throw new Error('Preview fallback');
        }
        if (!active) return;
        setIsMock(false);
        try {
          const me = await real.getMe();
          if (!active) return;
          setUser(me.user);
          setSettings(me.settings);
          setActiveRole(pickDefaultRole(me.user));
        } catch {
          if (!active) return;
          try {
            const pub = await real.publicSettings();
            if (!active) return;
            setSettings((prev) => ({
              ...prev,
              eventName: pub.eventName,
              schoolName: pub.schoolName,
              retentionUntil: pub.retentionUntil,
            }));
          } catch {
            // ignore public settings error
          }
          setUser(null);
        }
      } catch {
        // 자동 목업 모드 진입
        if (!active) return;
        const mock = mockClientRef.current!;
        setIsMock(true);
        const me = await mock.getMe();
        if (!active) return;
        setUser(me.user);
        setSettings(me.settings);
        setActiveRole('admin');
      } finally {
        if (active) setLoading(false);
      }
    }
    boot();
    return () => {
      active = false;
    };
  }, []);

  const refreshMe = useCallback(async () => {
    const me = await api.getMe();
    setUser(me.user);
    setSettings(me.settings);
    if (me.user && !me.user.roles.includes(activeRole)) {
      setActiveRole(pickDefaultRole(me.user));
    }
  }, [api, activeRole]);

  const logout = useCallback(async () => {
    await api.logout();
    if (!isMock) {
      setUser(null);
      setIsIdleLocked(false);
    } else {
      showToast('info', '미리보기 모드에서는 상단 드롭다운으로 역할을 전환할 수 있습니다.');
    }
  }, [api, isMock, showToast]);

  const switchMockRole = useCallback(
    (role: UserRole) => {
      if (!isMock || !mockClientRef.current) return;
      const nextUser = mockClientRef.current.setMockRole(role);
      setUser(nextUser);
      setActiveRole(role);
      showToast(
        'info',
        `${role === 'admin' ? '운영자' : role === 'interviewer' ? '면접관' : '담임교사'} 화면으로 전환했습니다.`
      );
    },
    [isMock, showToast]
  );

  // 15분 무활동 시 화면 잠금 (잠금 전 작성 중 평가 자동 저장 이벤트 발송)
  useEffect(() => {
    if (!user || isIdleLocked) return;
    if (user.mustChangePassword || !user.pledgeAgreedAt) return;

    let timerId: number;
    const resetTimer = () => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('app:before-idle-lock'));
        setIsIdleLocked(true);
      }, IDLE_LOCK_MS);
    };

    const events = ['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      window.clearTimeout(timerId);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [user, isIdleLocked]);

  const unlockSession = useCallback(
    async (password: string) => {
      await api.unlock(password);
      setIsIdleLocked(false);
      showToast('success', '화면 잠금이 해제되었습니다.');
    },
    [api, showToast]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      api,
      isMock,
      loading,
      user,
      activeRole,
      setActiveRole,
      settings,
      setSettings,
      setUser,
      isIdleLocked,
      unlockSession,
      refreshMe,
      logout,
      switchMockRole,
      toasts,
      showToast,
      dismissToast,
    }),
    [
      api,
      isMock,
      loading,
      user,
      activeRole,
      settings,
      isIdleLocked,
      unlockSession,
      refreshMe,
      logout,
      switchMockRole,
      toasts,
      showToast,
      dismissToast,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
