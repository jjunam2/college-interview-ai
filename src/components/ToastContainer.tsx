import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function ToastContainer() {
  const { toasts, dismissToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div
      className="no-print fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const styles =
          t.type === 'success'
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
            : t.type === 'error'
              ? 'bg-red-50 border-red-300 text-red-900'
              : t.type === 'warning'
                ? 'bg-orange-50 border-orange-300 text-orange-900'
                : 'bg-white border-slate-300 text-slate-900';

        const Icon =
          t.type === 'success' ? CheckCircle2 : t.type === 'error' || t.type === 'warning' ? AlertCircle : Info;

        return (
          <div
            key={t.id}
            className={`flex items-start gap-2.5 rounded-xl border p-3.5 shadow-md text-sm ${styles}`}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="flex-1 font-medium leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="알림 닫기"
              className="text-current opacity-60 hover:opacity-100 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
