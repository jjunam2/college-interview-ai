import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { IdleLockModal } from './components/IdleLockModal';
import { ToastContainer } from './components/ToastContainer';
import { TopBar } from './components/TopBar';
import { AppProvider, useApp } from './context/AppContext';
import { AuthPage } from './pages/AuthPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { AdminPage } from './pages/admin/AdminPage';
import { HomeroomPage } from './pages/homeroom/HomeroomPage';
import { InterviewerPage } from './pages/interviewer/InterviewerPage';

function AppShell() {
  const { loading, user, activeRole } = useApp();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-[#1E3A5F] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-600">시스템 연결을 확인하고 있습니다...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      <TopBar />
      <Routes>
        <Route
          path="*"
          element={
            !user ? (
              <AuthPage />
            ) : user.mustChangePassword || !user.pledgeAgreedAt ? (
              <OnboardingPage />
            ) : activeRole === 'admin' && user.roles.includes('admin') ? (
              <AdminPage />
            ) : activeRole === 'interviewer' && user.roles.includes('interviewer') ? (
              <InterviewerPage />
            ) : activeRole === 'homeroom' && user.roles.includes('homeroom') ? (
              <HomeroomPage />
            ) : user.roles.includes('admin') ? (
              <AdminPage />
            ) : user.roles.includes('interviewer') ? (
              <InterviewerPage />
            ) : user.roles.includes('homeroom') ? (
              <HomeroomPage />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
      </Routes>
      <IdleLockModal />
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </BrowserRouter>
  );
}
