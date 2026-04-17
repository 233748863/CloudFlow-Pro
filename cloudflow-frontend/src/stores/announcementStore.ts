import { create } from 'zustand';
import { Announcement, AnnouncementType } from '@/types';
import { getMyAnnouncements, markAnnouncementRead } from '@/services/api/announcement';

const FETCH_THROTTLE_MS = 60 * 1000;
const POPUP_ADVANCE_DELAY_MS = 300;

let shownPopupIds = new Set<number>();

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
 * 源码里有 notify_mode 字段，本项目后端没有。
 * 这里用“置顶 / 紧急 / 高优先级”作为弹窗公告的兼容规则。
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

function syncPopupState(
  nextAnnouncements: Announcement[],
  popupQueue: Announcement[],
  currentPopup: Announcement | null,
) {
  const current = currentPopup
    ? nextAnnouncements.find((item) => item.announcementId === currentPopup.announcementId) || null
    : null;
  const nextCurrentPopup = current && isPopupCandidate(current) ? current : null;

  const queueIds = new Set(popupQueue.map((item) => item.announcementId));
  const refreshedQueue = popupQueue
    .map((item) => nextAnnouncements.find((announcement) => announcement.announcementId === item.announcementId) || null)
    .filter((item): item is Announcement => Boolean(item))
    .filter((item) => isPopupCandidate(item) && item.announcementId !== nextCurrentPopup?.announcementId);

  const newCandidates = nextAnnouncements.filter((item) => (
    isPopupCandidate(item)
    && !shownPopupIds.has(item.announcementId)
    && !queueIds.has(item.announcementId)
    && item.announcementId !== nextCurrentPopup?.announcementId
  ));

  let nextQueue = [...refreshedQueue, ...newCandidates];
  let activePopup = nextCurrentPopup;

  if (!activePopup && nextQueue.length > 0) {
    activePopup = nextQueue[0];
    shownPopupIds.add(activePopup.announcementId);
    nextQueue = nextQueue.slice(1);
  }

  return {
    currentPopup: activePopup,
    popupQueue: nextQueue,
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
    const { lastFetchTime, popupQueue, currentPopup } = get();

    if (!force && lastFetchTime > 0 && now - lastFetchTime < FETCH_THROTTLE_MS) {
      return;
    }

    set({ loading: true, lastFetchTime: now });

    try {
      const list = await getMyAnnouncements();
      const sortedAnnouncements = sortAnnouncements(list);
      const popupState = syncPopupState(sortedAnnouncements, popupQueue, currentPopup);

      set({
        announcements: sortedAnnouncements,
        loading: false,
        ...popupState,
      });
    } catch (error) {
      console.error('获取公告列表失败:', error);
      set({ loading: false, lastFetchTime: 0 });
    }
  },

  markAsRead: async (announcementId: number) => {
    try {
      await markAnnouncementRead(String(announcementId));
      set((state) => ({
        announcements: state.announcements.map((item) => (
          item.announcementId === announcementId ? { ...item, isRead: true } : item
        )),
        popupQueue: state.popupQueue.filter((item) => item.announcementId !== announcementId),
        currentPopup: state.currentPopup?.announcementId === announcementId ? null : state.currentPopup,
      }));
      emitAnnouncementReadEvent();
    } catch (error) {
      console.error('标记公告已读失败:', error);
    }
  },

  markAllAsRead: async () => {
    const unreadAnnouncements = get().announcements.filter((item) => !item.isRead);
    if (unreadAnnouncements.length === 0) {
      return;
    }

    try {
      set({ loading: true });
      await Promise.all(
        unreadAnnouncements.map((item) => markAnnouncementRead(String(item.announcementId))),
      );

      set((state) => ({
        loading: false,
        announcements: state.announcements.map((item) => ({ ...item, isRead: true })),
        popupQueue: [],
        currentPopup: null,
      }));
      emitAnnouncementReadEvent();
    } catch (error) {
      console.error('全部标记已读失败:', error);
      set({ loading: false });
      throw error;
    }
  },

  dismissPopup: async () => {
    const currentPopup = get().currentPopup;
    if (!currentPopup) {
      return;
    }

    set({ currentPopup: null });
    await get().markAsRead(currentPopup.announcementId);

    setTimeout(() => {
      set((state) => {
        if (state.currentPopup || state.popupQueue.length === 0) {
          return state;
        }

        const [nextPopup, ...restQueue] = state.popupQueue;
        shownPopupIds.add(nextPopup.announcementId);

        return {
          ...state,
          currentPopup: nextPopup,
          popupQueue: restQueue,
        };
      });
    }, POPUP_ADVANCE_DELAY_MS);
  },

  reset: () => {
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

