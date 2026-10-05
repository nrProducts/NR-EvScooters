import React from 'react';
import { useNotificationToastStore } from '../store/useNotificationToastStore';
import { NotificationToastCard } from './NotificationToastCard';

/**
 * Renders whichever notification popup is current — mounted once, at the
 * root, alongside DialogHost. Keyed on id so each new item gets a fresh
 * mount (and therefore a fresh slide-in animation + auto-dismiss timer).
 */
export const NotificationToastHost: React.FC = () => {
  const current = useNotificationToastStore((s) => s.current);
  if (!current) return null;
  return <NotificationToastCard key={current.id} item={current} />;
};
