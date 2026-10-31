import React, { useState, useEffect } from 'react';
import { 
  AlertCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  ShieldAlert, 
  X 
} from 'lucide-react';

export type DialogType = 'error' | 'warning' | 'success' | 'info';

interface DialogState {
  isOpen: boolean;
  type: DialogType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isConfirm?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

// Global programmatic APIs
export const showModalAlert = (
  message: string, 
  title?: string, 
  type: DialogType = 'info'
) => {
  window.dispatchEvent(new CustomEvent('progit-modal-dialog', {
    detail: {
      isConfirm: false,
      title: title || (type === 'error' ? 'Error' : 'Notice'),
      message,
      type
    }
  }));
};

export const showModalConfirm = (options: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}): Promise<boolean> => {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent('progit-modal-dialog', {
      detail: {
        isConfirm: true,
        title: options.title,
        message: options.message,
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        isDanger: options.isDanger ?? false,
        type: options.isDanger ? 'warning' : 'info',
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      }
    }));
  });
};

export const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
  window.dispatchEvent(new CustomEvent('progit-toast', {
    detail: { message, type }
  }));
};

export const GlobalDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    // Monkey-patch window.alert to route to our styled modal
    const originalAlert = window.alert;
    window.alert = (message?: any) => {
      const msg = String(message ?? '');
      const isForbidden = msg.toLowerCase().includes('forbidden') || msg.toLowerCase().includes('permission');
      
      let title = 'Notice';
      let formattedMsg = msg;
      let type: DialogType = 'info';

      if (isForbidden) {
        title = 'Access Restricted';
        formattedMsg = 'You do not have permission to perform this action. Administrator or write privileges are required.';
        type = 'error';
      } else if (msg.toLowerCase().includes('error') || msg.toLowerCase().includes('failed')) {
        title = 'Action Failed';
        type = 'error';
      } else if (msg.toLowerCase().includes('success') || msg.toLowerCase().includes('created') || msg.toLowerCase().includes('saved')) {
        title = 'Success';
        type = 'success';
      }

      setDialog({
        isOpen: true,
        type,
        title,
        message: formattedMsg,
        confirmText: 'OK',
        onConfirm: () => setDialog(null),
        onCancel: () => setDialog(null)
      });
    };

    const handleCustomDialog = (e: any) => {
      const detail = e.detail;
      let title = detail.title;
      let message = detail.message;
      let type = detail.type || 'info';

      if (message && (message.toLowerCase().includes('forbidden') || message.toLowerCase().includes('permission'))) {
        title = title || 'Access Restricted';
        message = 'You do not have permission to perform this action. Administrator or write privileges are required.';
        type = 'error';
      }

      setDialog({
        isOpen: true,
        isConfirm: detail.isConfirm,
        type,
        title: title || (type === 'error' ? 'Action Failed' : 'Notice'),
        message,
        confirmText: detail.confirmText || (detail.isConfirm ? 'Confirm' : 'Close'),
        cancelText: detail.cancelText || 'Cancel',
        isDanger: detail.isDanger,
        onConfirm: () => {
          setDialog(null);
          detail.onConfirm?.();
        },
        onCancel: () => {
          setDialog(null);
          detail.onCancel?.();
        }
      });
    };

    const handleCustomToast = (e: any) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = {
        id,
        type: e.detail.type || 'success',
        message: e.detail.message || '',
      };
      setToasts((prev) => [...prev, newToast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    };

    window.addEventListener('progit-modal-dialog', handleCustomDialog);
    window.addEventListener('progit-toast', handleCustomToast);

    return () => {
      window.alert = originalAlert;
      window.removeEventListener('progit-modal-dialog', handleCustomDialog);
      window.removeEventListener('progit-toast', handleCustomToast);
    };
  }, []);

  const getIcon = (type: DialogType, title: string) => {
    if (title === 'Access Restricted') {
      return (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50">
          <ShieldAlert className="w-6 h-6" />
        </div>
      );
    }
    switch (type) {
      case 'error':
        return (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50">
            <AlertCircle className="w-6 h-6" />
          </div>
        );
      case 'warning':
        return (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
            <AlertTriangle className="w-6 h-6" />
          </div>
        );
      case 'success':
        return (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        );
      default:
        return (
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50">
            <Info className="w-6 h-6" />
          </div>
        );
    }
  };

  return (
    <>
      {children}

      {/* Styled ProGit Themed Modal Dialog */}
      {dialog && dialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden p-6 space-y-4">
            <div className="flex items-start space-x-3.5">
              {getIcon(dialog.type, dialog.title)}
              <div className="flex-1 min-w-0 pt-0.5">
                <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">
                  {dialog.title}
                </h3>
                <p className="mt-1 text-xs text-gray-600 dark:text-dark-text leading-relaxed">
                  {dialog.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-gray-100 dark:border-dark-border/40">
              {dialog.isConfirm && (
                <button
                  type="button"
                  onClick={() => dialog.onCancel?.()}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-border/60 transition-colors"
                >
                  {dialog.cancelText || 'Cancel'}
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={() => dialog.onConfirm?.()}
                className={`px-4 py-2 text-xs font-bold text-white rounded-lg shadow-sm transition-colors ${
                  dialog.isDanger
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {dialog.confirmText || 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Floating Toast Stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[90] space-y-2 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto flex items-center space-x-2.5 px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold backdrop-blur-md transition-all bg-white dark:bg-dark-surface border-gray-200 dark:border-dark-border text-gray-900 dark:text-white"
            >
              {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
              {t.type === 'error' && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
              {t.type === 'info' && <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />}
              <span className="flex-1">{t.message}</span>
              <button
                onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

