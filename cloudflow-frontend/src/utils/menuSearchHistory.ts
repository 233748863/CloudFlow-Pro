import type { FlatMenuItem } from './menuSearch';

export const MENU_HISTORY_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
export const MENU_HISTORY_LIMIT = 100;
export const MENU_RECENT_LIMIT = 8;
export const MENU_FREQUENT_LIMIT = 6;

export interface MenuVisit {
  menuId: string;
  visitedAt: number;
}

export const menuHistoryStorageKey = (userId: string): string => `menu-search:v1:user:${userId}`;

export const pruneMenuHistory = (entries: unknown, now = Date.now()): MenuVisit[] => {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry): entry is MenuVisit => Boolean(entry) && typeof entry.menuId === 'string' && Boolean(entry.menuId)
      && Number.isSafeInteger(entry.visitedAt) && entry.visitedAt > now - MENU_HISTORY_MAX_AGE && entry.visitedAt <= now)
    .map(({ menuId, visitedAt }) => ({ menuId, visitedAt }))
    .sort((left, right) => right.visitedAt - left.visitedAt)
    .slice(0, MENU_HISTORY_LIMIT);
};

export const parseMenuHistory = (stored: string | null, now = Date.now()): MenuVisit[] => {
  try {
    return pruneMenuHistory(stored ? JSON.parse(stored) : [], now);
  } catch {
    return [];
  }
};

export const recordMenuVisit = (history: MenuVisit[], menuId: string, now = Date.now()): MenuVisit[] =>
  pruneMenuHistory([{ menuId, visitedAt: now }, ...history], now);

export const getMenuHistoryGroups = (history: MenuVisit[], items: FlatMenuItem[], now = Date.now()) => {
  const authorized = new Map(items.map((item) => [item.id, item]));
  const visits = pruneMenuHistory(history, now).filter((entry) => authorized.has(entry.menuId));
  const stats = new Map<string, { count: number; lastVisit: number }>();
  visits.forEach((entry) => {
    const previous = stats.get(entry.menuId);
    stats.set(entry.menuId, { count: (previous?.count || 0) + 1, lastVisit: previous?.lastVisit ?? entry.visitedAt });
  });
  const recent = [...stats.keys()].slice(0, MENU_RECENT_LIMIT).map((id) => authorized.get(id)!);
  const frequent = [...stats.entries()]
    .sort((left, right) => right[1].count - left[1].count || right[1].lastVisit - left[1].lastVisit
      || authorized.get(left[0])!.order - authorized.get(right[0])!.order)
    .slice(0, MENU_FREQUENT_LIMIT)
    .map(([id]) => authorized.get(id)!);
  return { recent, frequent };
};
