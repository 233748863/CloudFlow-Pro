import { useEffect, useRef, useState } from 'react';
import { getCurrentUserSnapshot } from '@/utils/authStorage';
import { tenantStorage } from '@/utils/tenantStorage';
import { findCurrentMenu, getMenuSearchIdentity, menuSearchIdentityKey, type FlatMenuItem, type MenuSearchIdentity } from '@/utils/menuSearch';
import { getMenuHistoryGroups, menuHistoryStorageKey, MENU_HISTORY_MAX_AGE, parseMenuHistory, pruneMenuHistory, recordMenuVisit, type MenuVisit } from '@/utils/menuSearchHistory';

interface HistoryState {
  identityKey: string;
  entries: MenuVisit[];
}

export const useMenuSearchHistory = (
  identity: MenuSearchIdentity | null,
  items: FlatMenuItem[],
  ready: boolean,
  location: { key: string; pathname: string; search: string },
) => {
  const identityKey = menuSearchIdentityKey(identity);
  const [history, setHistory] = useState<HistoryState>({ identityKey: '', entries: [] });
  const historyRef = useRef(history);
  const lastVisitRef = useRef<string | null>(null);

  useEffect(() => {
    const isCurrentIdentity = () => Boolean(identityKey)
      && identityKey === menuSearchIdentityKey(getMenuSearchIdentity(getCurrentUserSnapshot()));
    if (!identity || !isCurrentIdentity()) {
      const empty = { identityKey: '', entries: [] };
      historyRef.current = empty;
      lastVisitRef.current = null;
      setHistory(empty);
      return;
    }

    const storageKey = menuHistoryStorageKey(identity.userId);
    const authorizedIds = new Set(items.map((item) => item.id));
    const publish = (entries: MenuVisit[]) => {
      if (!isCurrentIdentity()) return;
      const bounded = pruneMenuHistory(entries).filter((entry) => !ready || authorizedIds.has(entry.menuId));
      const next = { identityKey, entries: bounded };
      historyRef.current = next;
      const serialized = JSON.stringify(bounded);
      setHistory((previous) => previous.identityKey === identityKey && JSON.stringify(previous.entries) === serialized ? previous : next);
      tenantStorage.set(storageKey, serialized);
    };

    if (historyRef.current.identityKey !== identityKey) {
      historyRef.current = { identityKey, entries: parseMenuHistory(tenantStorage.get(storageKey)) };
      lastVisitRef.current = null;
    }
    let entries = historyRef.current.entries;
    const visitKey = JSON.stringify([location.key, location.pathname, location.search]);
    if (ready && lastVisitRef.current !== visitKey) {
      lastVisitRef.current = visitKey;
      const current = findCurrentMenu(items, location.pathname, location.search);
      if (current) entries = recordMenuVisit(entries, current.id);
    }
    publish(entries);

    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleExpiry = () => {
      clearTimeout(expiryTimer);
      const oldest = historyRef.current.entries.at(-1);
      if (!oldest || !isCurrentIdentity()) return;
      const delay = Math.min(Math.max(oldest.visitedAt + MENU_HISTORY_MAX_AGE - Date.now(), 1), 2_147_483_647);
      expiryTimer = setTimeout(() => {
        publish(historyRef.current.entries);
        scheduleExpiry();
      }, delay);
    };
    scheduleExpiry();

    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== `t${identity.tenantId}:${storageKey}`) return;
      if (!isCurrentIdentity()) return;
      publish(parseMenuHistory(tenantStorage.get(storageKey)));
      scheduleExpiry();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      clearTimeout(expiryTimer);
      window.removeEventListener('storage', onStorage);
    };
  }, [identityKey, items, ready, location.key, location.pathname, location.search]);

  return getMenuHistoryGroups(history.identityKey === identityKey ? history.entries : [], items);
};
