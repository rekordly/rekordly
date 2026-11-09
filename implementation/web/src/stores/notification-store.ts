import { create } from "zustand";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  /** In-app path opened when the notification is chosen. */
  link?: string;
}

const MAX_NOTIFICATIONS = 100;

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (notification: AppNotification) => void;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
}

/** Memory-only and bounded: it holds nothing that survives a reload or a sign-out. */
export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (notification) =>
    set((state) =>
      state.notifications.some((item) => item.id === notification.id)
        ? state
        : {
            notifications: [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS),
            unreadCount: state.unreadCount + (notification.isRead ? 0 : 1),
          },
    ),

  markAsRead: (notificationId) =>
    set((state) => {
      const target = state.notifications.find((item) => item.id === notificationId);
      if (!target || target.isRead) return state;
      return {
        notifications: state.notifications.map((item) =>
          item.id === notificationId ? { ...item, isRead: true } : item,
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      };
    }),

  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((item) => ({ ...item, isRead: true })),
      unreadCount: 0,
    })),
}));
