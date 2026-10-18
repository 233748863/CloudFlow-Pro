import { create } from 'zustand';
import { Announcement, AnnouncementType } from '@/types';
import { getMyAnnouncements, markAnnouncementRead } from '@/services/api/announcement';

const THROTTLE_MS = 20 * 60 * 1000;
const POPUP_ADVANCE_DELAY_MS = 300;

let shownPopupIds = new Set<number>();
let identityGeneration = 0;
let fetchGeneration = 0;

interface AnnouncementStoreState {
  announcements: Announcement[];
  loading: boolean;
  lastFetchTime: number;
  popupQueue: Announcement[];
  currentPopup: Announcement | null;
  fetchAnnouncements: (force?: boolean) => Promise<void>;
  markAsRead: (announcementId: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismissPopup: () => Promise<void>;
  reset: () => void;
}

function sortAnnouncements(list: Announcement[]) {
  return [...list].sort((left, right) => {
    if (left.isTop !== right.isTop) {
      return Number(right.isTop) - Number(left.isTop);
    }

    return new Date(right.createTime).getTime() - new Date(left.createTime).getTime();
  });
}

/**
 * 参考源码里有 `notify_mode`，但本项目后端没有这个字段。
 * 这里保留“源码式弹窗队列”的结构，再用本地业务规则做兼容：
 * 置顶、紧急、高优先级公告进入自动弹窗队列。
 */
function isPopupCandidate(announcement: Announcement) {
  return (
    !announcement.isRead
    && (
      announcement.isTop === 1
      || announcement.priority === 'H'
      || announcement.type === AnnouncementType.URGENT
    )
  );
}

function emitAnnouncementReadEvent() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('announcementRead'));
  }
}

function showNextPopup(state: Pick<AnnouncementStoreState, 'popupQueue' | 'currentPopup'>) {
  if (state.currentPopup || state.popupQueue.length === 0) {
    return state;
  }

  const [nextPopup, ...restQueue] = state.popupQueue;
  shownPopupIds.add(nextPopup.announcementId);

  return {
    currentPopup: nextPopup,
    popupQueue: restQueue,
  };
}

export const useAnnouncementStore = create<AnnouncementStoreState>((set, get) => ({
  announcements: [],
  loading: false,
  lastFetchTime: 0,
  popupQueue: [],
  currentPopup: null,

  fetchAnnouncements: async (force = false) => {
    const now = Date.now();
    const { lastFetchTime } = get();

    if (!force && lastFetchTime > 0 && now - lastFetchTime < THROTTLE_MS) {
      return;
    }
    const identity = identityGeneration;
    const request = ++fetchGeneration;

    // 先写入时间戳，避免并发重复请求；失败后再回滚，和源码策略保持一致。
    set({ loading: true, lastFetchTime: now });

    try {
      const all = await getMyAnnouncements();
      if (identity !== identityGeneration || request !== fetchGeneration) return;
      const announcements = sortAnnouncements(all);

      set((state) => {
        const queueIds = new Set(state.popupQueue.map((item) => item.announcementId));
        const nextQueue = state.popupQueue
          .map((item) => announcements.find((candidate) => candidate.announcementId === item.announcementId) || null)
          .filter((item): item is Announcement => Boolean(item) && isPopupCandidate(item));

        const currentPopup = state.currentPopup
          ? announcements.find((item) => item.announcementId === state.currentPopup?.announcementId) || null
          : null;

        const refreshedCurrentPopup = currentPopup && isPopupCandidate(currentPopup) ? currentPopup : null;

        const newPopups = announcements.filter((item) => (
          isPopupCandidate(item)
          && !shownPopupIds.has(item.announcementId)
          && !queueIds.has(item.announcementId)
          && item.announcementId !== refreshedCurrentPopup?.announcementId
        ));

        const popupState = showNextPopup({
          currentPopup: refreshedCurrentPopup,
          popupQueue: [...nextQueue, ...newPopups],
        });

        return {
          announcements,
          loading: false,
          ...popupState,
        };
      });
    } catch (error) {
      if (identity !== identityGeneration || request !== fetchGeneration) return;
      console.error('获取公告列表失败:', error);
      set({ loading: false, lastFetchTime: 0 });
    }
  },

  markAsRead: async (announcementId: number) => {
    const identity = identityGeneration;
    try {
      await markAnnouncementRead(String(announcementId));
      if (identity !== identityGeneration) return;

      set((state) => ({
        announcements: state.announcements.map((item) => (
          item.announcementId === announcementId ? { ...item, isRead: true } : item
        )),
        popupQueue: state.popupQueue.filter((item) => item.announcementId !== announcementId),
        currentPopup: state.currentPopup?.announcementId === announcementId ? null : state.currentPopup,
      }));

      emitAnnouncementReadEvent();
    } catch (error) {
      if (identity !== identityGeneration) return;
      console.error('标记公告已读失败:', error);
    }
  },

  markAllAsRead: async () => {
    const identity = identityGeneration;
    const unreadAnnouncements = get().announcements.filter((item) => !item.isRead);
    if (unreadAnnouncements.length === 0) {
      return;
    }

    try {
      set({ loading: true });

      await Promise.all(
        unreadAnnouncements.map((item) => markAnnouncementRead(String(item.announcementId))),
      );
      if (identity !== identityGeneration) return;
      const readIds = new Set(unreadAnnouncements.map(item => item.announcementId));

      set((state) => ({
        loading: false,
        announcements: state.announcements.map((item) => readIds.has(item.announcementId) ? { ...item, isRead: true } : item),
        popupQueue: state.popupQueue.filter(item => !readIds.has(item.announcementId)),
        currentPopup: state.currentPopup && readIds.has(state.currentPopup.announcementId) ? null : state.currentPopup,
      }));

      emitAnnouncementReadEvent();
    } catch (error) {
      if (identity !== identityGeneration) return;
      console.error('全部标记已读失败:', error);
      set({ loading: false });
      throw error;
    }
  },

  dismissPopup: async () => {
    const identity = identityGeneration;
    const currentPopup = get().currentPopup;
    if (!currentPopup) {
      return;
    }

    set({ currentPopup: null });
    void get().markAsRead(currentPopup.announcementId);

    if (get().popupQueue.length > 0) {
      setTimeout(() => {
        if (identity !== identityGeneration) return;
        set((state) => ({
          ...state,
          ...showNextPopup(state),
        }));
      }, POPUP_ADVANCE_DELAY_MS);
    }
  },

  reset: () => {
    identityGeneration += 1;
    fetchGeneration += 1;
    shownPopupIds = new Set<number>();
    set({
      announcements: [],
      loading: false,
      lastFetchTime: 0,
      popupQueue: [],
      currentPopup: null,
    });
  },
}));

export const useAnnouncementUnreadCount = () => (
  useAnnouncementStore((state) => state.announcements.filter((item) => !item.isRead).length)
);
