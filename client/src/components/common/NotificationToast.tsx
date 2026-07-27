import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';

export const NotificationToast: React.FC = () => {
  const { newNotification, clearNew } = useRealtimeNotifications();

  useEffect(() => {
    if (!newNotification) return;
    const timer = setTimeout(clearNew, 5000);
    return () => clearTimeout(timer);
  }, [newNotification, clearNew]);

  return (
    <AnimatePresence>
      {newNotification && (
        <motion.div
          initial={{ opacity: 0, y: -20, x: 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-20 right-4 z-50 max-w-sm bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-4 flex items-start gap-3"
        >
          <span className="text-xl flex-shrink-0">🔔</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">새 알림</p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{newNotification.message}</p>
          </div>
          <button
            type="button"
            onClick={clearNew}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex-shrink-0"
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
