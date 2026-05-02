import { defineStore } from 'pinia'
import { getMyAnnouncements, markAnnouncementRead } from '@/services/api/announcement'
import { AnnouncementType, type Announcement } from '@/types'

const THROTTLE_MS = 20 * 60 * 1000
const POPUP_ADVANCE_DELAY_MS = 300

let shownPopupIds = new Set<number>()

const sortAnnouncements = (list: Announcement[]) =>
  [...list].sort((left, right) => {
    if (Number(left.isTop || 0) !== Number(right.isTop || 0)) {
      return Number(right.isTop || 0) - Number(left.isTop || 0)
    }
    return new Date(right.createTime || right.publishTime || 0).getTime() - new Date(left.createTime || left.publishTime || 0).getTime()
  })

const isPopupCandidate = (announcement: Announcement) =>
  !announcement.isRead &&
  (announcement.isTop === 1 || announcement.priority === 'H' || announcement.type === AnnouncementType.URGENT)

export const useAnnouncementStore = defineStore('announcement', {
  state: () => ({
    announcements: [] as Announcement[],
    loading: false,
    lastFetchTime: 0,
    popupQueue: [] as Announcement[],
    currentPopup: null as Announcement | null
  }),
  getters: {
    unreadCount: (state) => state.announcements.filter((item) => !item.isRead).length
  },
  actions: {
    showNextPopup() {
      if (this.currentPopup || this.popupQueue.length === 0) return
      const [nextPopup, ...restQueue] = this.popupQueue
      shownPopupIds.add(nextPopup.announcementId)
      this.currentPopup = nextPopup
      this.popupQueue = restQueue
    },
    async fetchAnnouncements(force = false) {
      const now = Date.now()
      if (!force && this.lastFetchTime > 0 && now - this.lastFetchTime < THROTTLE_MS) return

      this.loading = true
      this.lastFetchTime = now
      try {
        const announcements = sortAnnouncements(await getMyAnnouncements()).slice(0, 20)
        const queueIds = new Set(this.popupQueue.map((item) => item.announcementId))
        const currentPopup = this.currentPopup
          ? announcements.find((item) => item.announcementId === this.currentPopup?.announcementId) || null
          : null
        this.currentPopup = currentPopup && isPopupCandidate(currentPopup) ? currentPopup : null
        this.popupQueue = this.popupQueue
          .map((item) => announcements.find((candidate) => candidate.announcementId === item.announcementId) || null)
          .filter((item): item is Announcement => item !== null)
          .filter((item) => isPopupCandidate(item))

        const newPopups = announcements.filter(
          (item) =>
            isPopupCandidate(item) &&
            !shownPopupIds.has(item.announcementId) &&
            !queueIds.has(item.announcementId) &&
            item.announcementId !== this.currentPopup?.announcementId
        )

        this.announcements = announcements
        this.popupQueue = [...this.popupQueue, ...newPopups]
        this.showNextPopup()
      } catch {
        this.lastFetchTime = 0
      } finally {
        this.loading = false
      }
    },
    async markAsRead(announcementId: number) {
      await markAnnouncementRead(announcementId)
      this.announcements = this.announcements.map((item) =>
        item.announcementId === announcementId ? { ...item, isRead: true } : item
      )
      this.popupQueue = this.popupQueue.filter((item) => item.announcementId !== announcementId)
      if (this.currentPopup?.announcementId === announcementId) this.currentPopup = null
      window.dispatchEvent(new Event('announcementRead'))
    },
    async markAllAsRead() {
      const unread = this.announcements.filter((item) => !item.isRead)
      await Promise.all(unread.map((item) => markAnnouncementRead(item.announcementId)))
      this.announcements = this.announcements.map((item) => ({ ...item, isRead: true }))
      this.popupQueue = []
      this.currentPopup = null
      window.dispatchEvent(new Event('announcementRead'))
    },
    async dismissPopup() {
      const currentPopup = this.currentPopup
      if (!currentPopup) return
      this.currentPopup = null
      await this.markAsRead(currentPopup.announcementId)
      if (this.popupQueue.length > 0) {
        window.setTimeout(() => this.showNextPopup(), POPUP_ADVANCE_DELAY_MS)
      }
    },
    reset() {
      shownPopupIds = new Set<number>()
      this.announcements = []
      this.loading = false
      this.lastFetchTime = 0
      this.popupQueue = []
      this.currentPopup = null
    }
  }
})
